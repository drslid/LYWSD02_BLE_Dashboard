"""Bluetooth sessions and bounded GATT operations, independent of scheduling and storage."""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Callable, Mapping
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any

from bleak import BleakClient
from bleak.backends.characteristic import BleakGATTCharacteristic
from bleak.backends.device import BLEDevice
from bleak.exc import BleakError
from bleak_retry_connector import (
    BLEAK_RETRY_EXCEPTIONS,
    BleakClientWithServiceCache,
    close_stale_connections_by_address,
    establish_connection,
)
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.util import dt as dt_util

from .const import (
    BATTERY_CHARACTERISTIC,
    CLEANUP_TIMEOUT,
    CONF_CLOCK_FORMAT,
    CONF_CORRECTION,
    CONF_PAIRING_TOKEN,
    CONF_PROTOCOL,
    CONF_UNIT,
    CONNECT_TIMEOUT,
    GATT_READ_TIMEOUT,
    MAX_RECORDS,
    MEASUREMENT_CHARACTERISTIC,
    MEASUREMENT_TIMEOUT,
    READINGS_TIMEOUT,
    RECORD_COUNT_CHARACTERISTIC,
    RECORD_IDLE_TIMEOUT,
    RECORD_INDEX_CHARACTERISTIC,
    RECORDS_CHARACTERISTIC,
    SYNC_TIMEOUT,
    TIME_CHARACTERISTIC,
    UNIT_CHARACTERISTIC,
)
from .extended_protocols import Cgd1, Pvvx
from .protocol import (
    HourlyRecord,
    clock_drift,
    clock_offset,
    decode_battery,
    decode_measurement,
    decode_record,
    decode_record_count,
    decode_unit,
    encode_clock_format,
    encode_record_index,
    encode_time,
    encode_unit,
)

_LOGGER = logging.getLogger(__name__)


@dataclass
class ClockSession:
    """What one connection wrote to the clock and read from it."""

    unit: str | None
    written_at: datetime | None = None
    verified: bool = False
    hardware: int | None = None
    drift: float | None = None
    offset: float | None = None
    newest_record: int | None = None
    stored_records: int = 0
    clock_time: datetime | None = None
    battery: int | None = None
    temperature: float | None = None
    humidity: float | None = None
    records: dict[int, HourlyRecord] = field(default_factory=dict)


class ClockTransport:
    """Connect, set and verify the clock before collecting optional measurements."""

    def __init__(
        self,
        hass: HomeAssistant,
        entry: ConfigEntry,
        address: str,
        get_device: Callable[[], BLEDevice | None],
        on_written: Callable[[ClockSession], None],
    ) -> None:
        self.hass = hass
        self.entry = entry
        self.address = address
        self.name = entry.title
        self._async_reachable_device = get_device
        self._on_written = on_written
        self._format_warned = False
        self._next_record = 0
        self.unit: str | None = None

    async def async_write_clock(
        self,
        ble_device: BLEDevice,
        settings: Mapping[str, Any],
        deadline: float | None = None,
        *,
        next_record: int = 0,
        previous_unit: str | None = None,
    ) -> ClockSession:
        """Connect once to set the time and display settings, then read what the clock measured."""
        forced = deadline is not None
        self._next_record = next_record
        self.unit = previous_unit
        deadline = min(deadline or float("inf"), self.hass.loop.time() + SYNC_TIMEOUT)
        try:
            async with asyncio.timeout(CLEANUP_TIMEOUT):
                await close_stale_connections_by_address(self.address)
        except Exception as err:
            _LOGGER.debug(
                "Stale connection cleanup unavailable for %s: %s", self.name, err
            )
        try:
            async with asyncio.timeout_at(
                min(deadline, self.hass.loop.time() + CONNECT_TIMEOUT)
            ):
                client = await establish_connection(
                    BleakClientWithServiceCache,
                    ble_device,
                    self.name,
                    max_attempts=1 if forced else 3,
                    ble_device_callback=lambda: (
                        self._async_reachable_device() or ble_device
                    ),
                )
        except TimeoutError as err:
            raise TimeoutError("Timed out opening the Bluetooth connection") from err
        try:
            protocol = self.entry.data.get(CONF_PROTOCOL, "stock")
            if protocol != "stock":
                if protocol not in ("pvvx", "cgd1"):
                    raise ValueError("Unsupported device protocol")
                adapter = (
                    Pvvx(client)
                    if protocol == "pvvx"
                    else Cgd1(client, self.entry.data.get(CONF_PAIRING_TOKEN, ""))
                )
                try:
                    async with asyncio.timeout_at(deadline):
                        await adapter.open()
                        reading = await adapter.synchronize(dt_util.now(), settings)
                    session = ClockSession(**vars(reading))
                    if isinstance(adapter, Pvvx):
                        session.hardware = adapter.hardware
                    session.verified = protocol == "pvvx"
                    session.written_at = dt_util.now()
                    self._on_written(session)
                    try:
                        async with asyncio.timeout(READINGS_TIMEOUT):
                            await adapter.readings(reading)
                    except Exception:
                        _LOGGER.debug("Optional readings unavailable for %s", self.name)
                    for key in ("temperature", "humidity", "battery"):
                        setattr(session, key, getattr(reading, key))
                    return session
                finally:
                    await adapter.close()
            async with asyncio.timeout_at(deadline):
                session = await self._async_set_clock(client, settings)
            session.written_at = dt_util.now()
            self._on_written(session)
            await self._async_read_clock(client, session)
        except TimeoutError as err:
            raise TimeoutError("Bluetooth connected, but the clock operation timed out") from err
        finally:
            try:
                async with asyncio.timeout(CLEANUP_TIMEOUT):
                    await client.disconnect()
            except Exception as err:
                _LOGGER.warning(
                    "%s Bluetooth disconnect did not complete; continuing the queue: %s",
                    self.name,
                    err or type(err).__name__,
                )
        return session

    async def _async_set_clock(
        self, client: BleakClient, settings: Mapping[str, Any]
    ) -> ClockSession:
        """Write the time and display settings; return what was read on the way."""
        session = ClockSession(unit=settings[CONF_UNIT])
        correction = settings[CONF_CORRECTION]
        try:
            async with asyncio.timeout(GATT_READ_TIMEOUT):
                value = await client.read_gatt_char(TIME_CHARACTERISTIC)
            now = dt_util.now()
            session.drift = round(clock_drift(value, now) - correction * 60, 1)
            # Records carry the time the clock kept before this sync.
            session.offset = clock_offset(value, now)
        except (*BLEAK_RETRY_EXCEPTIONS, ValueError, TimeoutError):
            # The write below still corrects a clock whose value cannot be read.
            pass
        if session.offset is not None:
            try:
                async with asyncio.timeout(GATT_READ_TIMEOUT):
                    session.newest_record, session.stored_records = decode_record_count(
                        await client.read_gatt_char(RECORD_COUNT_CHARACTERISTIC)
                    )
            except (*BLEAK_RETRY_EXCEPTIONS, ValueError, TimeoutError):
                pass
        await client.write_gatt_char(
            TIME_CHARACTERISTIC, encode_time(dt_util.now(), correction), response=True
        )
        if session.unit is not None:
            await client.write_gatt_char(
                UNIT_CHARACTERISTIC, encode_unit(session.unit), response=True
            )
        else:
            try:
                async with asyncio.timeout(GATT_READ_TIMEOUT):
                    session.unit = decode_unit(
                        await client.read_gatt_char(UNIT_CHARACTERISTIC)
                    )
            except (*BLEAK_RETRY_EXCEPTIONS, ValueError, TimeoutError):
                # Only shown in Home Assistant; the clock is already on time.
                session.unit = self.unit
        if settings[CONF_CLOCK_FORMAT] is not None:
            await self._async_write_clock_format(client, settings[CONF_CLOCK_FORMAT])
        try:
            async with asyncio.timeout(GATT_READ_TIMEOUT):
                value = await client.read_gatt_char(TIME_CHARACTERISTIC)
                now = dt_util.now()
                drift = clock_drift(value, now)
        except (*BLEAK_RETRY_EXCEPTIONS, ValueError, TimeoutError):
            # Some stock firmware only acknowledges the write. Expose that fact.
            _LOGGER.debug(
                "%s acknowledged its time write; read-back is unavailable", self.name
            )
        else:
            if abs(drift - correction * 60) > 5:
                raise BleakError(
                    f"Clock verification failed: {drift - correction * 60:.0f} seconds from the requested time"
                )
            session.verified = True
            session.clock_time = (now + timedelta(seconds=round(drift))).replace(
                microsecond=0
            )
        return session

    async def _async_read_clock(
        self, client: BleakClient, session: ClockSession
    ) -> None:
        """Read the time shown, battery, measurement and new records; failures only cost readings."""
        try:
            async with asyncio.timeout(READINGS_TIMEOUT):
                for read in (
                    self._async_read_battery,
                    self._async_read_measurement,
                    self._async_read_records,
                ):
                    try:
                        if read == self._async_read_battery:
                            async with asyncio.timeout(GATT_READ_TIMEOUT):
                                await read(client, session)
                        else:
                            await read(client, session)
                    except (*BLEAK_RETRY_EXCEPTIONS, ValueError, TimeoutError) as err:
                        _LOGGER.debug(
                            "%s could not complete %s: %s",
                            self.name,
                            read.__name__,
                            err,
                        )
                    except Exception:
                        _LOGGER.exception(
                            "Unexpected error while reading %s", self.name
                        )
        except TimeoutError:
            _LOGGER.debug(
                "%s took more than %s s to send its readings",
                self.name,
                READINGS_TIMEOUT,
            )

    async def _async_read_battery(
        self, client: BleakClient, session: ClockSession
    ) -> None:
        session.battery = decode_battery(
            await client.read_gatt_char(BATTERY_CHARACTERISTIC)
        )

    async def _async_read_measurement(
        self, client: BleakClient, session: ClockSession
    ) -> None:
        measured: asyncio.Future[bytearray] = self.hass.loop.create_future()

        def _measured(
            _characteristic: BleakGATTCharacteristic, data: bytearray
        ) -> None:
            if not measured.done():
                measured.set_result(data)

        await client.start_notify(MEASUREMENT_CHARACTERISTIC, _measured)
        try:
            async with asyncio.timeout(MEASUREMENT_TIMEOUT):
                session.temperature, session.humidity = decode_measurement(
                    await measured
                )
        finally:
            await self._async_stop_notify(client, MEASUREMENT_CHARACTERISTIC)

    async def _async_stop_notify(
        self, client: BleakClient, characteristic: str
    ) -> None:
        """A stuck notification cleanup must not extend an expired readings deadline."""
        try:
            async with asyncio.timeout(CLEANUP_TIMEOUT):
                await client.stop_notify(characteristic)
        except Exception as err:
            _LOGGER.debug(
                "%s could not stop notifications on %s: %s",
                self.name,
                characteristic,
                err,
            )

    async def _async_read_records(
        self, client: BleakClient, session: ClockSession
    ) -> None:
        if session.offset is None or session.newest_record is None:
            return
        newest = session.newest_record
        # A clock whose numbering went back, after a reset, is read from its oldest record again.
        first = self._next_record if self._next_record <= newest + 1 else 0
        first = max(first, newest - min(session.stored_records, MAX_RECORDS) + 1)
        if first > newest:
            return
        received = asyncio.Event()

        def _recorded(
            _characteristic: BleakGATTCharacteristic, data: bytearray
        ) -> None:
            try:
                record = decode_record(data)
            except ValueError:
                return
            # Records after the newest one were stamped after this sync set the time.
            if first <= record.index <= newest:
                session.records[record.index] = record
            received.set()

        await client.write_gatt_char(
            RECORD_INDEX_CHARACTERISTIC, encode_record_index(first), response=True
        )
        await client.start_notify(RECORDS_CHARACTERISTIC, _recorded)
        try:
            # The clock sends them oldest first and stops after the newest one.
            while newest not in session.records:
                received.clear()
                async with asyncio.timeout(RECORD_IDLE_TIMEOUT):
                    await received.wait()
        finally:
            await self._async_stop_notify(client, RECORDS_CHARACTERISTIC)

    async def _async_write_clock_format(
        self, client: BleakClient, clock_format: str
    ) -> None:
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
