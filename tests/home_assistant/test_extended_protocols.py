"""Published BLE command traces exercised through adapters and real HA setup."""
from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
import struct
from typing import Any

from freezegun.api import FrozenDateTimeFactory
import pytest
from homeassistant.const import CONF_ADDRESS, CONF_MODEL
from homeassistant.core import HomeAssistant
from homeassistant.util import dt as dt_util
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.lywsd02_sync.const import (
    CONF_CLOCK_FORMAT, CONF_CORRECTION, CONF_PAIRING_TOKEN, CONF_PROTOCOL, CONF_UNIT,
    DEFAULT_OPTIONS, DOMAIN,
)
from custom_components.lywsd02_sync.extended_protocols import Cgd1, Pvvx, uuid
from .conftest import ADDRESS, BluetoothHarness


class ExtendedClock:
    def __init__(self, kind: str = "pvvx", hardware: int = 0, version: int = 0x59, services: int = 0xB0) -> None:
        self.kind = kind
        self.hardware = hardware
        self.version = version
        self.services = services
        self.callbacks: dict[str, Any] = {}
        self.writes: list[tuple[str, bytes]] = []
        self.time = 1700000000
        self.flags = 0xC7
        self.config = bytes([0x13, 2, 6, 0x91, 0xB2, 0x91, 80, 5, 0x62, 22, 0, 6, 0, 1, 1, 0xC7, 1, 2, 3, 4])
        self.reject_token = False
        self.reject_time = False
        self.drop_readings = False
        self.disconnects = 0

    def send(self, characteristic: str, data: bytes) -> None:
        if characteristic in self.callbacks:
            self.callbacks[characteristic](None, bytearray(data))

    async def start_notify(self, characteristic: str, callback: Any) -> None:
        self.callbacks[characteristic] = callback
        if self.kind == "cgd1" and characteristic == uuid(0x100):
            asyncio.get_running_loop().call_soon(callback, None, bytearray(struct.pack("<Bhh", 0, -325, 5212)))

    async def stop_notify(self, characteristic: str) -> None:
        self.callbacks.pop(characteristic, None)

    async def read_gatt_char(self, characteristic: str) -> bytearray:
        assert characteristic == uuid(0x2A19)
        return bytearray([87])

    async def write_gatt_char(self, characteristic: str, payload: bytes, response: bool) -> None:
        assert response is (self.kind != "pvvx"), "PVVX advertises Write Without Response"
        payload = bytes(payload)
        self.writes.append((characteristic, payload))
        if self.kind == "pvvx":
            command = payload[0]
            if command == 0:
                self.send(characteristic, struct.pack("<BBHHHI", 0, 0, self.hardware, self.version, 1, self.services))
            elif command == 0x23:
                if len(payload) == 5:
                    self.time = struct.unpack_from("<I", payload, 1)[0]
                self.send(characteristic, struct.pack("<BI", 0x23, self.time))
            elif command == 0x55:
                if len(payload) == 2:
                    self.flags = payload[1]
                self.send(characteristic, bytes([0x55, self.version, self.flags, 0xE0, 0x80, 0x11, 40, 4, 0xA9, 0x10, 3, 7, 2, 0]))
            elif command == 0x33:
                if self.drop_readings:
                    raise ValueError("Measurement unavailable")
                self.send(characteristic, bytes([0x33, 1]))
                self.send(characteristic, struct.pack("<BHhhH", 0x33, 3012, -325, 5212, 1))
        else:
            if characteristic == uuid(1):
                command = payload[1]
                if payload[0] == 0x11:
                    assert command == 2, "Never provision a token"
                    assert payload[2:] == bytes.fromhex("12" * 16)
                self.send(uuid(2), bytes([4, 0xFF, command, 0, int(self.reject_token if command == 2 else self.reject_time)]))
            elif characteristic == uuid(0xB):
                if payload[0] == 1:
                    self.send(uuid(0xC), self.config)
                else:
                    assert len(payload) == 20
                    self.config = payload
                    self.send(uuid(0xC), bytes([4, 0xFF, 1, 0, 0]))
            else:
                raise AssertionError(characteristic)

    async def disconnect(self) -> None:
        self.disconnects += 1


def settings(**overrides: Any) -> dict[str, Any]:
    return {CONF_CORRECTION: 0, CONF_UNIT: None, CONF_CLOCK_FORMAT: None} | overrides


@pytest.mark.parametrize("offset", [345, -210, 60, 0])
async def test_pvvx_clock_writes_local_epoch_and_verifies_readback(offset: int, freezer: FrozenDateTimeFactory) -> None:
    clock = ExtendedClock()
    adapter = Pvvx(clock)
    now = datetime.now(timezone(timedelta(minutes=offset)))
    try:
        await adapter.open()
        result = await adapter.synchronize(now, settings(time_correction=-2))
        payload = next(frame for _, frame in clock.writes if len(frame) == 5 and frame[0] == 0x23)
        assert struct.unpack_from("<I", payload, 1)[0] == round(now.timestamp()) + (offset - 2) * 60
        assert result.clock_time == datetime.fromtimestamp(round(now.timestamp()) - 120, now.tzinfo)
        assert result.drift is not None
        assert not any("ebe0" in characteristic for characteristic, _ in clock.writes)
    finally:
        await adapter.close()
    assert not clock.callbacks


@pytest.mark.parametrize(("hardware", "version", "services"), [(999, 0x59, 0xB0), (0, 0x60, 0xB0), (0, 0x59, 0x80), (0, 0x59, 0x10000A0)])
async def test_pvvx_rejects_unverified_firmware_before_time_or_settings(hardware: int, version: int, services: int) -> None:
    clock = ExtendedClock(hardware=hardware, version=version, services=services)
    adapter = Pvvx(clock)
    try:
        with pytest.raises(ValueError):
            await adapter.open()
    finally:
        await adapter.close()
    assert [frame for _, frame in clock.writes] == [b"\x00"]


async def test_pvvx_preserves_other_config_bits_and_decodes_fractional_readings(freezer: FrozenDateTimeFactory) -> None:
    clock = ExtendedClock(hardware=49)
    adapter = Pvvx(clock)
    try:
        await adapter.open()
        result = await adapter.synchronize(dt_util.now(), settings(temperature_unit="fahrenheit", clock_format="12h"))
        await adapter.readings(result)
        assert b"\x55\xf7" in [frame for _, frame in clock.writes]
        assert result.temperature == -3.25
        assert result.humidity == 52.12
        assert result.battery == 87
        assert result.unit == "fahrenheit"
    finally:
        await adapter.close()


async def test_cgd1_existing_token_preserves_settings_and_does_not_invent_drift(freezer: FrozenDateTimeFactory) -> None:
    clock = ExtendedClock("cgd1")
    before = clock.config
    adapter = Cgd1(clock, "12" * 16)
    now = datetime.now(timezone(timedelta(minutes=-210)))
    try:
        await adapter.open()
        result = await adapter.synchronize(now, settings(clock_format="12h"))
        await adapter.readings(result)
        for index in range(2, 20):
            if index not in (5, 6, 13):
                assert clock.config[index] == before[index]
        assert clock.config[6] == 35 and clock.config[13] == 0
        assert result.drift is None and result.clock_time is None
        assert result.temperature == -3.25 and result.humidity == 52.12
        assert result.battery is None
        assert not any(frame[:2] == b"\x11\x01" for _, frame in clock.writes)
    finally:
        await adapter.close()
    assert not clock.callbacks


async def test_cgd1_rejects_credentials_without_writing_time() -> None:
    clock = ExtendedClock("cgd1")
    clock.reject_token = True
    adapter = Cgd1(clock, "12" * 16)
    try:
        with pytest.raises(ValueError, match="rejected"):
            await adapter.open()
    finally:
        await adapter.close()
    assert len(clock.writes) == 1


async def test_cgd1_does_not_round_an_unrepresentable_timezone() -> None:
    clock = ExtendedClock("cgd1")
    adapter = Cgd1(clock, "12" * 16)
    try:
        await adapter.open()
        count = len(clock.writes)
        with pytest.raises(ValueError, match="six-minute"):
            await adapter.synchronize(datetime.now(timezone(timedelta(minutes=345))), settings())
        assert len(clock.writes) == count
    finally:
        await adapter.close()


@pytest.mark.parametrize(("protocol", "hardware"), [("pvvx", 0), ("pvvx", 49), ("cgd1", 0)])
async def test_extended_clock_through_home_assistant_setup(
    hass: HomeAssistant, ble: BluetoothHarness, protocol: str, hardware: int
) -> None:
    clock = ExtendedClock(protocol, hardware=hardware)
    ble.clock = clock
    name = "ATC_TEST" if protocol == "pvvx" else "CGD1"
    ble.proxy().hear(name=name)
    data = {CONF_ADDRESS: ADDRESS, CONF_MODEL: "PVVX" if protocol == "pvvx" else "CGD1", CONF_PROTOCOL: protocol}
    if protocol == "cgd1":
        data[CONF_PAIRING_TOKEN] = "12" * 16
    entry = MockConfigEntry(domain=DOMAIN, unique_id=ADDRESS, title=name, data=data, options=DEFAULT_OPTIONS)
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done(wait_background_tasks=True)
    manager = entry.runtime_data
    assert manager.status == "synced"
    assert manager.temperature == -3.25 and manager.humidity == 52.12
    assert manager.recent == {}, "PVVX samples are not stock hourly minimum/maximum records"
    assert clock.disconnects == 1
    format_entity = hass.states.get("select." + ("atc_test" if protocol == "pvvx" else "cgd1") + "_time_format")
    assert manager.clock_formats == (["24h"] if protocol == "pvvx" and hardware == 0 else ["24h", "12h"])
    assert format_entity is not None
    assert format_entity.attributes["options"] == manager.clock_formats
    entity_prefix = "sensor." + ("atc_test" if protocol == "pvvx" else "cgd1")
    assert hass.states.get(entity_prefix + "_minimum_temperature_24_h") is None
    if protocol == "cgd1":
        assert manager.drift is None and manager.clock_time is None
        assert hass.states.get(entity_prefix + "_clock_time") is None
        assert hass.states.get(entity_prefix + "_battery") is None
