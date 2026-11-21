"""Keep one LYWSD02 clock on time: on demand, on schedule and after UTC offset changes."""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Mapping
from datetime import datetime, timedelta
from typing import Any

from bleak.backends.device import BLEDevice
from bleak_retry_connector import BLEAK_RETRY_EXCEPTIONS
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
from homeassistant.util import dt as dt_util
from homeassistant.util.hass_dict import HassKey

from .const import (
    CLOCK_FORMATS,
    CONF_CLOCK_FORMAT,
    CONF_CORRECTION,
    CONF_PROTOCOL,
    CONF_UNIT,
    DOMAIN,
    FORCE_RECONNECT_DELAYS,
    FORCE_TIMEOUT,
    FORMAT_24H,
    ISSUE_NO_CONNECTABLE_ADAPTER,
    ISSUE_PASSIVE_ONLY,
    MAX_RECORDS,
    POST_SYNC_TIMEOUT,
    REPORT_MISSING_AFTER,
    RETRY_DELAYS,
    SEARCH_INTERVAL,
    STATUS_FAILED,
    STATUS_SYNCED,
    STATUS_WAITING,
)
from .discovery import ClockDiscovery
from .protocol import HourlyRecord, record_hour, utc_offset_minutes
from .records import async_import_records
from .schedule import cron_expression, next_run, previous_run
from .storage import ClockSyncStorage
from .transport import ClockSession, ClockTransport

_LOGGER = logging.getLogger(__name__)

# One Bluetooth session at a time keeps proxy connection slots free.
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


def device_settings(options: Mapping[str, Any]) -> dict[str, Any]:
    """Return the display settings written at each sync; None leaves the clock unchanged."""
    return {
        CONF_UNIT: options.get(CONF_UNIT),
        CONF_CLOCK_FORMAT: options.get(CONF_CLOCK_FORMAT),
        CONF_CORRECTION: int(options.get(CONF_CORRECTION, 0)),
    }


class _NotHeard(Exception):
    """No Bluetooth adapter or proxy that can connect hears the clock."""


class _ConnectionFailed(Exception):
    """The connection failed or dropped before the clock was written."""

    def __init__(self, error: Exception) -> None:
        super().__init__(error)
        self.error = error


class ClockSyncManager:
    """Synchronize one clock and share the result with its entities."""

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry, address: str) -> None:
        """Prepare the manager; call async_start to begin."""
        self.hass = hass
        self.entry = entry
        self.address = address
        self.name = entry.title
        self.last_sync: datetime | None = None
        self.last_attempt: datetime | None = None
        self.last_error: str | None = None
        self.next_retry: datetime | None = None
        self.next_sync: datetime | None = None
        self.drift: float | None = None
        # Unit displayed by the clock at the last sync.
        self.unit: str | None = None
        # Read at each sync, after the time is set.
        self.clock_time: datetime | None = None
        self.battery: int | None = None
        self.temperature: float | None = None
        self.humidity: float | None = None
        self._pvvx_hardware: int | None = None
        # Hourly records of the 24 hours before the last sync, by the UTC hour they cover.
        self.recent: dict[datetime, HourlyRecord] = {}
        self._next_record = 0
        self.status = STATUS_WAITING
        self._synced_offset: int | None = None
        self._applied: dict[str, Any] | None = None
        self._expression = cron_expression(entry.options)
        self._pending = False
        self._syncing = 0
        self._failures = 0
        self._missing_since: datetime | None = None
        self._missing_reported = False
        self._stopped = False
        self._issue_id = f"unreachable_{entry.entry_id}"
        self._task: asyncio.Task[None] | None = None
        self._sync_lock = asyncio.Lock()
        self._unsub_schedule: CALLBACK_TYPE | None = None
        self._unsub_retry: CALLBACK_TYPE | None = None
        self._unsub_advertisements: CALLBACK_TYPE | None = None
        self._listeners: list[CALLBACK_TYPE] = []
        self._store = ClockSyncStorage(hass, entry.entry_id)
        self._discovery = ClockDiscovery(hass, entry, address, lambda: self._stopped)
        self._transport = ClockTransport(hass, entry, address, self._async_reachable_device, self._async_clock_written)
        self.clock_verified: bool | None = None
        self._pending_records: dict[datetime, HourlyRecord] = {}
        self._import_task: asyncio.Task[None] | None = None

    @property
    def clock_formats(self) -> list[str]:
        """Offer the PVVX 12-hour flag only on models where it means AM/PM."""
        if self.entry.data.get(CONF_PROTOCOL) == "pvvx" and self._pvvx_hardware not in (9, 12, 49):
            return [FORMAT_24H]
        return list(CLOCK_FORMATS)

    async def async_start(self) -> None:
        """Restore the last sync, then follow the schedule, the settings and the UTC offset."""
        await self._store.async_restore(self)
        self.entry.async_on_unload(
            async_track_time_change(self.hass, self._async_check_sync, second=2)
        )
        self.entry.async_on_unload(self._async_stop)
        self._async_schedule_next()
        missed = self._expression is not None and self.last_sync is not None and (
            previous_run(self._expression, dt_util.now()) > self.last_sync
        )
        # Resume an interrupted retry or settings change after restart.
        if (
            self.last_sync is None
            or missed
            or self.last_error is not None
            or self._applied != device_settings(self.entry.options)
        ):
            self.async_request_sync()
        else:
            self._async_retry_record_import()

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

    async def async_sync(self, force: bool = False) -> None:
        """Write the time and settings; raise HomeAssistantError when the clock cannot be reached.

        Forced, as by the sync button, it searches for a clock that is not heard and reconnects
        after a failed connection, for up to FORCE_TIMEOUT, instead of giving up at once.
        """
        self._pending = True
        self._syncing += 1
        self._async_cancel_retry()
        self._async_listen()
        deadline = self.hass.loop.time() + FORCE_TIMEOUT
        reconnect_delays = iter(FORCE_RECONNECT_DELAYS if force else ())
        try:
            while True:
                try:
                    async with self._sync_lock:
                        # Settings changed during a connection are written by one more connection.
                        while self._pending:
                            await self._async_attempt(deadline if force else None)
                    return
                except _NotHeard:
                    if not force or not await self._async_search(deadline):
                        previous = (self.status, self.last_error)
                        error = self._async_missing()
                        if previous != (self.status, self.last_error):
                            await self._async_save_state()
                        raise error from None
                except _ConnectionFailed as failure:
                    delay = next(reconnect_delays, None)
                    if delay is None or self._stopped or self.hass.loop.time() + delay >= deadline:
                        error = self._async_failed(failure.error)
                        await self._async_save_state()
                        raise error from failure.error
                    _LOGGER.debug("Reconnecting to %s in %s s: %s", self.name, delay, failure.error)
                    await self._discovery.async_retry_delay(delay)
        finally:
            self._syncing -= 1
            self._async_notify()

    async def _async_search(self, deadline: float) -> bool:
        self._async_listen()
        if self.status != STATUS_WAITING:
            self.status = STATUS_WAITING
            self._async_notify()
        return await self._discovery.async_search(deadline)

    @callback
    def _async_reachable_device(self) -> BLEDevice | None:
        return self._discovery.reachable_device()

    async def _async_attempt(self, deadline: float | None = None) -> None:
        try:
            # Only radio work occupies the shared queue. Disk/recorder work is per entry.
            async with self.hass.data.setdefault(SYNC_LOCK, asyncio.Lock()):
                if self._stopped:
                    raise _NotHeard
                if deadline is not None and self.hass.loop.time() >= deadline:
                    raise TimeoutError("The sync deadline expired while waiting for Bluetooth")
                self.last_attempt = dt_util.utcnow()
                ble_device = self._async_reachable_device()
                if ble_device is None:
                    raise _NotHeard
                self._async_found()
                self._async_notify()
                settings = device_settings(self.entry.options)
                session = await self._transport.async_write_clock(
                    ble_device, settings, deadline,
                    next_record=self._next_record, previous_unit=self.unit,
                )
        except _NotHeard:
            raise
        except (*BLEAK_RETRY_EXCEPTIONS, TimeoutError) as err:
            raise _ConnectionFailed(err) from err
        except Exception as err:
            # Bluetooth backends can raise their own errors; the clock must still be retried.
            _LOGGER.exception("Unexpected error while synchronizing %s", self.name)
            raise _ConnectionFailed(err) from err
        now = dt_util.now()
        self.last_sync = session.written_at or now
        self.last_error = None
        self.drift = session.drift
        self.unit = session.unit
        for reading in ("clock_time", "battery", "temperature", "humidity"):
            # A reading that failed this time keeps its last value.
            if (value := getattr(session, reading)) is not None:
                setattr(self, reading, value)
        self._pending_records.update(self._async_place_records(session, now))
        self._synced_offset = utc_offset_minutes(self.last_sync)
        self._applied = settings
        self._failures = 0
        self._pending = settings != device_settings(self.entry.options)
        self.status = STATUS_SYNCED
        if not self._pending:
            self._async_stop_listening()
        self._async_notify()
        await self._async_save_state()
        await self._async_flush_records()

    async def _async_save_state(self) -> None:
        try:
            async with asyncio.timeout(POST_SYNC_TIMEOUT):
                await self._store.async_save_state(self)
        except Exception:
            _LOGGER.exception("Could not save the synchronization state of %s", self.name)

    async def _async_flush_records(self) -> None:
        if not self._pending_records:
            return
        batch = dict(self._pending_records)
        try:
            async with asyncio.timeout(POST_SYNC_TIMEOUT):
                imported = await async_import_records(self.hass, self.address, self.name, batch)
        except Exception:
            _LOGGER.exception("Could not import records for %s; retaining them for retry", self.name)
            return
        if imported is False:
            return
        for hour, record in batch.items():
            if self._pending_records.get(hour) == record:
                del self._pending_records[hour]
        self._async_notify()
        await self._async_save_state()

    @callback
    def _async_retry_record_import(self) -> None:
        if self._stopped or not self._pending_records or self._syncing:
            return
        if self._import_task is not None and not self._import_task.done():
            return

        async def retry() -> None:
            async with self._sync_lock:
                await self._async_flush_records()

        self._import_task = self.entry.async_create_background_task(
            self.hass, retry(), f"{DOMAIN} records {self.address}",
        )

    @callback
    def _async_clock_written(self, session: ClockSession) -> None:
        """Expose the completed write while optional readings are still arriving."""
        self.last_sync = session.written_at
        self.clock_verified = session.verified
        if session.hardware is not None:
            self._pvvx_hardware = session.hardware
        self.drift = session.drift
        self.unit = session.unit
        if session.clock_time is not None:
            self.clock_time = session.clock_time
        self.status = STATUS_SYNCED
        self.last_error = None
        self._async_notify()

    @callback
    def _async_place_records(self, session: ClockSession, now: datetime) -> dict[datetime, HourlyRecord]:
        """Return the new records by the UTC hour they cover, and keep those of the last 24 hours."""
        if session.records:
            self._next_record = max(session.records) + 1
        hours: dict[datetime, HourlyRecord] = {}
        if session.offset is not None:
            # Hours outside this range were recorded by a clock that was not on time then.
            oldest = now - timedelta(hours=MAX_RECORDS + 1)
            for index in sorted(session.records):
                hour = record_hour(session.records[index], session.offset)
                if oldest <= hour <= now:
                    hours[hour] = session.records[index]
        since = dt_util.as_utc(now).replace(minute=0, second=0, microsecond=0) - timedelta(hours=24)
        self.recent = {hour: record for hour, record in (self.recent | hours).items() if hour >= since}
        return hours

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
        self.last_error = reason or "not_in_range"
        if self.status != STATUS_WAITING:
            self.status = STATUS_WAITING
            self._async_notify()
        self._async_listen()
        self._async_request_background_scan()
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
        if bluetooth.async_scanner_devices_by_address(self.hass, self.address, connectable=False):
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
        self.last_error = str(err) or type(err).__name__
        self.status = STATUS_FAILED
        self._async_listen()
        self._async_request_background_scan()
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
        if self._unsub_advertisements is None and not self._stopped:
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
        # A button sync can end after the entry was unloaded.
        if not self._stopped:
            self.next_retry = dt_util.utcnow() + delay
            self._unsub_retry = async_call_later(self.hass, delay, self._async_retry)

    @callback
    def _async_retry(self, _now: datetime) -> None:
        self._unsub_retry = None
        self.next_retry = None
        self._async_start_background_sync()

    @callback
    def _async_cancel_retry(self) -> None:
        self.next_retry = None
        if self._unsub_retry:
            self._unsub_retry()
            self._unsub_retry = None

    @callback
    def _async_start_background_sync(self) -> None:
        if self._stopped or (self._task and not self._task.done()):
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
        self._stopped = True
        self._async_cancel_schedule()
        self._async_cancel_retry()
        self._async_stop_listening()
        self._discovery.stop()
        if self._import_task is not None:
            self._import_task.cancel()
        ir.async_delete_issue(self.hass, DOMAIN, self._issue_id)

    @callback
    def _async_check_sync(self, _now: datetime) -> None:
        """Catch missed runs, lost retry timers and timezone changes once a minute."""
        if self._stopped:
            return
        self._async_retry_record_import()
        now = dt_util.now()
        scheduled_due = (
            self._expression is not None and self.next_sync is not None
            and self.next_sync <= now
            and (self.last_sync is None or self.last_sync < self.next_sync)
        )
        if self._expression is not None and (
            self._unsub_schedule is None or self.next_sync is None or self.next_sync <= now
        ):
            self._async_schedule_next()
            self._async_notify()
        if self._syncing:
            return
        if self._pending:
            # Preserve an intentional retry delay; repair a missing timer/task.
            if self._unsub_retry is None:
                self._async_start_background_sync()
            return
        missed = scheduled_due or (self._expression is not None and (
            self.last_sync is None or previous_run(self._expression, now) > self.last_sync
        ))
        offset_changed = self._synced_offset is not None and utc_offset_minutes(now) != self._synced_offset
        if missed or offset_changed:
            self.async_request_sync()

    @callback
    def _async_request_background_scan(self) -> None:
        self._discovery.request_scan()

    @property
    def sync_diagnostics(self) -> dict[str, Any]:
        """Explain old last-sync values without exposing pairing credentials."""
        return {
            "last_attempt": self.last_attempt.isoformat() if self.last_attempt else None,
            "last_error": self.last_error,
            "next_retry": self.next_retry.isoformat() if self.next_retry else None,
            "pending": self._pending,
            "in_progress": bool(self._syncing),
            "clock_verified": self.clock_verified,
            "pending_record_imports": len(self._pending_records),
            "bluetooth_routes": self._discovery.diagnostics(),
        }

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
