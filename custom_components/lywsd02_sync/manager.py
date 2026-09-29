"""Keep one LYWSD02 clock on time: on demand, on schedule and after UTC offset changes."""

from __future__ import annotations

import asyncio
from datetime import datetime
import logging
from typing import Any

from bleak.backends.device import BLEDevice
from bleak_retry_connector import (
    BLEAK_RETRY_EXCEPTIONS,
    BleakClientWithServiceCache,
    establish_connection,
)

from homeassistant.components import bluetooth
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import CALLBACK_TYPE, HomeAssistant, callback
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.event import async_track_point_in_time, async_track_time_change
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util
from homeassistant.util.hass_dict import HassKey

from .const import (
    DOMAIN,
    RETRY_DELAYS,
    STATUS_FAILED,
    STATUS_SYNCED,
    STATUS_WAITING,
    SYNC_TIMEOUT,
    TIME_CHARACTERISTIC,
)
from .protocol import clock_drift, encode_time, utc_offset_minutes
from .schedule import cron_expression, next_run, previous_run

_LOGGER = logging.getLogger(__name__)

STORAGE_VERSION = 1
# One sync at a time keeps Bluetooth proxy connection slots free.
SYNC_LOCK: HassKey[asyncio.Lock] = HassKey(f"{DOMAIN}_sync_lock")


def _store(hass: HomeAssistant, entry_id: str) -> Store[dict[str, Any]]:
    return Store(hass, STORAGE_VERSION, f"{DOMAIN}.{entry_id}")


async def async_remove_storage(hass: HomeAssistant, entry_id: str) -> None:
    """Delete the saved sync state of a removed entry."""
    await _store(hass, entry_id).async_remove()


class ClockSyncManager:
    """Synchronize one clock and share the result with its entities."""

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry, address: str) -> None:
        """Prepare the manager; call async_start to begin."""
        self.hass = hass
        self.entry = entry
        self.address = address
        self.name = entry.title
        self.last_sync: datetime | None = None
        self.next_sync: datetime | None = None
        self.drift: float | None = None
        self.status = STATUS_WAITING
        self._synced_offset: int | None = None
        self._expression = cron_expression(entry.options)
        self._pending = False
        self._failures = 0
        self._retry_at: datetime | None = None
        self._task: asyncio.Task[None] | None = None
        self._unsub_schedule: CALLBACK_TYPE | None = None
        self._listeners: list[CALLBACK_TYPE] = []
        self._store = _store(hass, entry.entry_id)

    async def async_start(self) -> None:
        """Restore the last sync, then follow the clock, the schedule and the UTC offset."""
        if stored := await self._store.async_load():
            self.last_sync = dt_util.parse_datetime(stored["last_sync"])
            self.drift = stored.get("drift")
            self._synced_offset = stored.get("offset")
            self.status = STATUS_SYNCED
        self.entry.async_on_unload(
            bluetooth.async_register_callback(
                self.hass,
                self._async_advertisement,
                bluetooth.BluetoothCallbackMatcher(address=self.address, connectable=True),
                bluetooth.BluetoothScanningMode.PASSIVE,
            )
        )
        self.entry.async_on_unload(
            async_track_time_change(self.hass, self._async_check_offset, minute=2, second=0)
        )
        self.entry.async_on_unload(self._async_cancel_schedule)
        self._async_schedule_next()
        missed = self._expression is not None and self.last_sync is not None and (
            previous_run(self._expression, dt_util.now()) > self.last_sync
        )
        if self.last_sync is None or missed:
            self.async_request_sync()

    @callback
    def async_add_listener(self, update_callback: CALLBACK_TYPE) -> CALLBACK_TYPE:
        """Call update_callback whenever the sync state changes."""
        self._listeners.append(update_callback)
        return lambda: self._listeners.remove(update_callback)

    @callback
    def _async_notify(self) -> None:
        for update_callback in list(self._listeners):
            update_callback()

    @callback
    def async_request_sync(self) -> None:
        """Sync now if the clock is in range, otherwise as soon as it is seen again."""
        self._pending = True
        self._retry_at = None
        if bluetooth.async_address_present(self.hass, self.address, connectable=True):
            self._async_start_background_sync()
        else:
            self.status = STATUS_WAITING
            self._async_notify()

    async def async_sync(self) -> None:
        """Write the current time; raise HomeAssistantError when the clock cannot be reached."""
        async with self.hass.data.setdefault(SYNC_LOCK, asyncio.Lock()):
            ble_device = bluetooth.async_ble_device_from_address(
                self.hass, self.address, connectable=True
            )
            if ble_device is None:
                self._pending = True
                self.status = STATUS_WAITING
                self._async_notify()
                raise HomeAssistantError(
                    translation_domain=DOMAIN,
                    translation_key="not_in_range",
                    translation_placeholders={"name": self.name},
                )
            try:
                async with asyncio.timeout(SYNC_TIMEOUT):
                    drift = await self._async_write_time(ble_device)
            except (*BLEAK_RETRY_EXCEPTIONS, TimeoutError) as err:
                self._failures += 1
                self._pending = True
                self._retry_at = dt_util.utcnow() + RETRY_DELAYS[min(self._failures, len(RETRY_DELAYS)) - 1]
                self.status = STATUS_FAILED
                self._async_notify()
                raise HomeAssistantError(
                    translation_domain=DOMAIN,
                    translation_key="sync_failed",
                    translation_placeholders={"name": self.name, "error": str(err) or type(err).__name__},
                ) from err
            now = dt_util.now()
            self.last_sync = now
            self.drift = drift
            self._synced_offset = utc_offset_minutes(now)
            self._pending = False
            self._failures = 0
            self._retry_at = None
            self.status = STATUS_SYNCED
            self._async_notify()
            await self._store.async_save(
                {"last_sync": now.isoformat(), "drift": drift, "offset": self._synced_offset}
            )

    async def _async_write_time(self, ble_device: BLEDevice) -> float | None:
        client = await establish_connection(
            BleakClientWithServiceCache, ble_device, self.name, max_attempts=3
        )
        try:
            try:
                value = await client.read_gatt_char(TIME_CHARACTERISTIC)
                drift: float | None = round(clock_drift(value, dt_util.now()), 1)
            except (*BLEAK_RETRY_EXCEPTIONS, ValueError):
                # The write below still corrects a clock whose value cannot be read.
                drift = None
            await client.write_gatt_char(TIME_CHARACTERISTIC, encode_time(dt_util.now()), response=True)
        finally:
            await client.disconnect()
        return drift

    @callback
    def _async_advertisement(
        self, service_info: bluetooth.BluetoothServiceInfoBleak, change: bluetooth.BluetoothChange
    ) -> None:
        if self._pending and (self._retry_at is None or dt_util.utcnow() >= self._retry_at):
            self._async_start_background_sync()

    @callback
    def _async_start_background_sync(self) -> None:
        if self._task and not self._task.done():
            return
        self._task = self.entry.async_create_background_task(
            self.hass, self._async_background_sync(), f"{DOMAIN} sync {self.address}"
        )

    async def _async_background_sync(self) -> None:
        try:
            await self.async_sync()
        except HomeAssistantError as err:
            # Warn once per failure streak; retries follow the backoff quietly.
            (_LOGGER.warning if self._failures == 1 else _LOGGER.debug)("%s", err)

    @callback
    def _async_check_offset(self, _now: datetime) -> None:
        """Resync after a daylight saving change or a new Home Assistant time zone."""
        if (
            self._synced_offset is not None
            and not self._pending
            and utc_offset_minutes(dt_util.now()) != self._synced_offset
        ):
            self.async_request_sync()

    @callback
    def _async_schedule_next(self) -> None:
        self._async_cancel_schedule()
        if self._expression is None:
            self.next_sync = None
            return
        self.next_sync = next_run(self._expression, dt_util.now())
        self._unsub_schedule = async_track_point_in_time(
            self.hass, self._async_scheduled, self.next_sync
        )

    @callback
    def _async_scheduled(self, _now: datetime) -> None:
        self._unsub_schedule = None
        self._async_schedule_next()
        self.async_request_sync()
        self._async_notify()

    @callback
    def _async_cancel_schedule(self) -> None:
        if self._unsub_schedule:
            self._unsub_schedule()
            self._unsub_schedule = None
