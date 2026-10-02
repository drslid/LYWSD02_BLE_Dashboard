"""Keep one LYWSD02 clock on time: on demand, on schedule and after UTC offset changes."""

from __future__ import annotations

import asyncio
from collections.abc import Mapping
from datetime import datetime, timedelta
import logging
from typing import Any

from bleak import BleakClient
from bleak.backends.device import BLEDevice
from bleak.exc import BleakError
from bleak_retry_connector import (
    BLEAK_RETRY_EXCEPTIONS,
    BleakClientWithServiceCache,
    close_stale_connections_by_address,
    establish_connection,
)

from homeassistant.components import bluetooth
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import CALLBACK_TYPE, HomeAssistant, callback
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import issue_registry as ir
from homeassistant.helpers.event import (
    async_call_later,
    async_track_point_in_time,
    async_track_time_change,
)
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util
from homeassistant.util.hass_dict import HassKey

from .const import (
    CONF_CLOCK_FORMAT,
    CONF_CORRECTION,
    CONF_UNIT,
    DOMAIN,
    ISSUE_NO_CONNECTABLE_ADAPTER,
    ISSUE_PASSIVE_ONLY,
    REPORT_MISSING_AFTER,
    RETRY_DELAYS,
    SEARCH_INTERVAL,
    STATUS_FAILED,
    STATUS_SYNCED,
    STATUS_WAITING,
    SYNC_TIMEOUT,
    TIME_CHARACTERISTIC,
    UNIT_CHARACTERISTIC,
)
from .protocol import (
    clock_drift,
    decode_unit,
    encode_clock_format,
    encode_time,
    encode_unit,
    utc_offset_minutes,
)
from .schedule import cron_expression, next_run, previous_run

_LOGGER = logging.getLogger(__name__)

STORAGE_VERSION = 1
# One sync at a time keeps Bluetooth proxy connection slots free.
SYNC_LOCK: HassKey[asyncio.Lock] = HassKey(f"{DOMAIN}_sync_lock")
TROUBLESHOOTING_URL = "https://github.com/drslid/LYWSD02_BLE_Dashboard#if-a-clock-is-not-synchronized"
MISSING_MESSAGES: dict[str | None, str] = {
    None: (
        "%s has not been heard by any Bluetooth adapter or proxy for a few minutes; "
        "it will be synchronized as soon as it is in range"
    ),
    ISSUE_PASSIVE_ONLY: (
        "%s is only heard by Bluetooth proxies that cannot connect: enable connections on a proxy "
        "near it (ESPHome: bluetooth_proxy active: true) or bring a Bluetooth adapter closer"
    ),
    ISSUE_NO_CONNECTABLE_ADAPTER: (
        "%s cannot be synchronized: no Bluetooth adapter or proxy of Home Assistant can connect to devices"
    ),
}


def _store(hass: HomeAssistant, entry_id: str) -> Store[dict[str, Any]]:
    return Store(hass, STORAGE_VERSION, f"{DOMAIN}.{entry_id}")


async def async_remove_storage(hass: HomeAssistant, entry_id: str) -> None:
    """Delete the saved sync state of a removed entry."""
    await _store(hass, entry_id).async_remove()


def device_settings(options: Mapping[str, Any]) -> dict[str, Any]:
    """Return the display settings written at each sync; None leaves the clock unchanged."""
    return {
        CONF_UNIT: options.get(CONF_UNIT),
        CONF_CLOCK_FORMAT: options.get(CONF_CLOCK_FORMAT),
        CONF_CORRECTION: int(options.get(CONF_CORRECTION, 0)),
    }


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
        # Unit displayed by the clock at the last sync.
        self.unit: str | None = None
        self.status = STATUS_WAITING
        self._synced_offset: int | None = None
        self._applied: dict[str, Any] | None = None
        self._expression = cron_expression(entry.options)
        self._pending = False
        self._syncing = 0
        self._failures = 0
        self._missing_since: datetime | None = None
        self._missing_reported = False
        self._format_warned = False
        self._issue_id = f"unreachable_{entry.entry_id}"
        self._task: asyncio.Task[None] | None = None
        self._unsub_schedule: CALLBACK_TYPE | None = None
        self._unsub_retry: CALLBACK_TYPE | None = None
        self._unsub_advertisements: CALLBACK_TYPE | None = None
        self._listeners: list[CALLBACK_TYPE] = []
        self._store = _store(hass, entry.entry_id)

    async def async_start(self) -> None:
        """Restore the last sync, then follow the schedule, the settings and the UTC offset."""
        if stored := await self._store.async_load():
            self.last_sync = dt_util.parse_datetime(stored["last_sync"])
            self.drift = stored.get("drift")
            self.unit = stored.get("unit")
            self._synced_offset = stored.get("offset")
            self._applied = stored.get("applied")
            self.status = STATUS_SYNCED
        self.entry.async_on_unload(
            async_track_time_change(self.hass, self._async_check_offset, minute=2, second=0)
        )
        self.entry.async_on_unload(self._async_stop)
        self._async_schedule_next()
        missed = self._expression is not None and self.last_sync is not None and (
            previous_run(self._expression, dt_util.now()) > self.last_sync
        )
        # A setting changed while the clock was out of reach is applied after a restart too.
        if self.last_sync is None or missed or self._applied != device_settings(self.entry.options):
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
    def async_update_options(self, **changes: Any) -> None:
        """Save settings changed from an entity; the update listener applies them."""
        self.hass.config_entries.async_update_entry(self.entry, options={**self.entry.options, **changes})

    @callback
    def async_apply_options(self) -> None:
        """Follow new options without reloading: reschedule and push changed display settings."""
        self._expression = cron_expression(self.entry.options)
        self._async_schedule_next()
        if self._applied != device_settings(self.entry.options):
            self.async_request_sync()
        self._async_notify()

    @callback
    def async_request_sync(self) -> None:
        """Sync now, then keep trying until the clock has been reached."""
        self._pending = True
        if self._syncing:
            # The running attempt writes the current time and rechecks the settings.
            return
        self._async_cancel_retry()
        self._async_start_background_sync()

    async def async_sync(self) -> None:
        """Write the time and settings; raise HomeAssistantError when the clock cannot be reached."""
        self._pending = True
        self._syncing += 1
        self._async_cancel_retry()
        try:
            async with self.hass.data.setdefault(SYNC_LOCK, asyncio.Lock()):
                # Settings changed during a connection are written by one more connection.
                while self._pending:
                    await self._async_attempt()
        finally:
            self._syncing -= 1

    async def _async_attempt(self) -> None:
        ble_device = bluetooth.async_ble_device_from_address(self.hass, self.address, connectable=True)
        if ble_device is None:
            raise self._async_missing()
        self._async_found()
        settings = device_settings(self.entry.options)
        try:
            async with asyncio.timeout(SYNC_TIMEOUT):
                drift, unit = await self._async_write_clock(ble_device, settings)
        except (*BLEAK_RETRY_EXCEPTIONS, TimeoutError) as err:
            raise self._async_failed(err) from err
        except Exception as err:
            # Bluetooth backends can raise their own errors; the clock must still be retried.
            _LOGGER.exception("Unexpected error while synchronizing %s", self.name)
            raise self._async_failed(err) from err
        now = dt_util.now()
        self.last_sync = now
        self.drift = drift
        self.unit = unit
        self._synced_offset = utc_offset_minutes(now)
        self._applied = settings
        self._failures = 0
        self._pending = settings != device_settings(self.entry.options)
        self.status = STATUS_SYNCED
        if not self._pending:
            self._async_stop_listening()
        self._async_notify()
        await self._store.async_save(
            {
                "last_sync": now.isoformat(),
                "drift": drift,
                "offset": self._synced_offset,
                "unit": unit,
                "applied": settings,
            }
        )

    async def _async_write_clock(
        self, ble_device: BLEDevice, settings: Mapping[str, Any]
    ) -> tuple[float | None, str | None]:
        """Connect once to set the time and display settings; return the drift and unit found."""
        await close_stale_connections_by_address(self.address)
        client = await establish_connection(
            BleakClientWithServiceCache, ble_device, self.name, max_attempts=3
        )
        correction = settings[CONF_CORRECTION]
        unit: str | None = settings[CONF_UNIT]
        try:
            try:
                value = await client.read_gatt_char(TIME_CHARACTERISTIC)
                drift: float | None = round(clock_drift(value, dt_util.now()) - correction * 60, 1)
            except (*BLEAK_RETRY_EXCEPTIONS, ValueError):
                # The write below still corrects a clock whose value cannot be read.
                drift = None
            await client.write_gatt_char(
                TIME_CHARACTERISTIC, encode_time(dt_util.now(), correction), response=True
            )
            if unit is not None:
                await client.write_gatt_char(UNIT_CHARACTERISTIC, encode_unit(unit), response=True)
            else:
                try:
                    unit = decode_unit(await client.read_gatt_char(UNIT_CHARACTERISTIC))
                except (*BLEAK_RETRY_EXCEPTIONS, ValueError):
                    # Only shown in Home Assistant; the clock is already on time.
                    unit = self.unit
            if settings[CONF_CLOCK_FORMAT] is not None:
                await self._async_write_clock_format(client, settings[CONF_CLOCK_FORMAT])
        finally:
            await client.disconnect()
        return drift, unit

    async def _async_write_clock_format(self, client: BleakClient, clock_format: str) -> None:
        try:
            await client.write_gatt_char(
                TIME_CHARACTERISTIC, encode_clock_format(clock_format), response=True
            )
        except BleakError as err:
            # The plain LYWSD02 rejects this command; its time is already set.
            if not self._format_warned:
                self._format_warned = True
                _LOGGER.warning(
                    "%s did not accept the 12/24 h setting (%s); only the LYWSD02MMC supports it",
                    self.name,
                    err,
                )

    @callback
    def _async_missing(self) -> HomeAssistantError:
        """Keep looking for a clock that no adapter can reach; return the error to show."""
        now = dt_util.utcnow()
        if self._missing_since is None:
            self._missing_since = now
        if now - self._missing_since >= REPORT_MISSING_AFTER:
            reason = self._async_report_missing()
        else:
            reason = self._async_unreachable_reason()
        if self.status != STATUS_WAITING:
            self.status = STATUS_WAITING
            self._async_notify()
        self._async_listen()
        self._async_schedule_retry(SEARCH_INTERVAL)
        return HomeAssistantError(
            translation_domain=DOMAIN,
            translation_key=reason or "not_in_range",
            translation_placeholders={"name": self.name},
        )

    @callback
    def _async_unreachable_reason(self) -> str | None:
        """Return why a heard clock cannot be reached, or None when it is not heard at all."""
        if not bluetooth.async_scanner_count(self.hass, connectable=True):
            return ISSUE_NO_CONNECTABLE_ADAPTER
        if bluetooth.async_ble_device_from_address(self.hass, self.address, connectable=False):
            return ISSUE_PASSIVE_ONLY
        return None

    @callback
    def _async_report_missing(self) -> str | None:
        """Explain a lasting absence: a repair issue for setup problems, a warning in the log."""
        reason = self._async_unreachable_reason()
        if reason is None:
            ir.async_delete_issue(self.hass, DOMAIN, self._issue_id)
        else:
            ir.async_create_issue(
                self.hass,
                DOMAIN,
                self._issue_id,
                is_fixable=False,
                learn_more_url=TROUBLESHOOTING_URL,
                severity=ir.IssueSeverity.WARNING,
                translation_key=reason,
                translation_placeholders={"name": self.name},
            )
        if not self._missing_reported:
            self._missing_reported = True
            _LOGGER.warning(MISSING_MESSAGES[reason], self.name)
        return reason

    @callback
    def _async_found(self) -> None:
        if self._missing_since is not None:
            self._missing_since = None
            self._missing_reported = False
            ir.async_delete_issue(self.hass, DOMAIN, self._issue_id)

    @callback
    def _async_failed(self, err: Exception) -> HomeAssistantError:
        """Retry a failed connection after a growing delay; return the error to show."""
        self._failures += 1
        self.status = STATUS_FAILED
        self._async_schedule_retry(RETRY_DELAYS[min(self._failures, len(RETRY_DELAYS)) - 1])
        self._async_notify()
        return HomeAssistantError(
            translation_domain=DOMAIN,
            translation_key="sync_failed",
            translation_placeholders={"name": self.name, "error": str(err) or type(err).__name__},
        )

    @callback
    def _async_listen(self) -> None:
        """Watch for the clock while it is missing; active mode makes automatic scanners look for it."""
        if self._unsub_advertisements is None:
            self._unsub_advertisements = bluetooth.async_register_callback(
                self.hass,
                self._async_advertisement,
                bluetooth.BluetoothCallbackMatcher(address=self.address, connectable=True),
                bluetooth.BluetoothScanningMode.ACTIVE,
            )

    @callback
    def _async_stop_listening(self) -> None:
        if self._unsub_advertisements:
            self._unsub_advertisements()
            self._unsub_advertisements = None

    @callback
    def _async_advertisement(
        self, service_info: bluetooth.BluetoothServiceInfoBleak, change: bluetooth.BluetoothChange
    ) -> None:
        # Only a shortcut: Home Assistant does not report every advertisement, the retry timer does the rest.
        if self._pending and not self._syncing and self.status == STATUS_WAITING:
            self._async_start_background_sync()

    @callback
    def _async_schedule_retry(self, delay: timedelta) -> None:
        self._async_cancel_retry()
        self._unsub_retry = async_call_later(self.hass, delay, self._async_retry)

    @callback
    def _async_retry(self, _now: datetime) -> None:
        self._unsub_retry = None
        self._async_start_background_sync()

    @callback
    def _async_cancel_retry(self) -> None:
        if self._unsub_retry:
            self._unsub_retry()
            self._unsub_retry = None

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
            # Warn once per failure streak; a missing clock is reported by _async_report_missing.
            if self.status == STATUS_FAILED and self._failures == 1:
                _LOGGER.warning("%s", err)
            else:
                _LOGGER.debug("%s", err)

    @callback
    def _async_stop(self) -> None:
        self._async_cancel_schedule()
        self._async_cancel_retry()
        self._async_stop_listening()
        ir.async_delete_issue(self.hass, DOMAIN, self._issue_id)

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
