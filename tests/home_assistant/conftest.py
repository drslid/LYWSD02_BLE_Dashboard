"""Shared fixtures for the LYWSD02 Clock Sync tests."""

from __future__ import annotations

from collections.abc import Callable, Generator
from typing import Any
from unittest.mock import patch

from bleak.backends.device import BLEDevice
from bleak.backends.scanner import AdvertisementData
from bleak.exc import BleakError
import pytest

from homeassistant.components.bluetooth import BluetoothChange, BluetoothServiceInfoBleak
from homeassistant.core import HomeAssistant

ADDRESS = "E7:2E:01:AB:CD:EF"
TITLE = "LYWSD02 (CDEF)"


def service_info(address: str = ADDRESS, name: str = "LYWSD02") -> BluetoothServiceInfoBleak:
    """Return an advertisement as delivered by Home Assistant Bluetooth."""
    return BluetoothServiceInfoBleak(
        name=name,
        address=address,
        rssi=-60,
        manufacturer_data={},
        service_data={},
        service_uuids=[],
        source="local",
        device=BLEDevice(address, name, None),
        advertisement=AdvertisementData(name, {}, {}, [], None, -60, ()),
        connectable=True,
        time=0,
        tx_power=None,
    )


class FakeClock:
    """Time characteristic of a plain LYWSD02: 5-byte values only."""

    def __init__(self) -> None:
        self.value = bytes(5)
        self.writes: list[bytes] = []
        self.disconnects = 0

    async def read_gatt_char(self, uuid: str) -> bytearray:
        return bytearray(self.value)

    async def write_gatt_char(self, uuid: str, data: bytes, response: bool) -> None:
        assert response is True
        if len(data) != 5:
            raise BleakError("Invalid attribute length")
        self.writes.append(bytes(data))
        self.value = bytes(data)

    async def disconnect(self) -> None:
        self.disconnects += 1


class BluetoothHarness:
    """Controls whether the clock is in range and delivers its advertisements."""

    def __init__(self, clock: FakeClock) -> None:
        self.clock = clock
        self.in_range = True
        self.connect_error: Exception | None = None
        self.connections = 0
        self._callbacks: list[Callable[[BluetoothServiceInfoBleak, BluetoothChange], None]] = []

    def device(self, hass: HomeAssistant, address: str, connectable: bool = True) -> BLEDevice | None:
        return BLEDevice(address, "LYWSD02", None) if self.in_range else None

    def present(self, hass: HomeAssistant, address: str, connectable: bool = True) -> bool:
        return self.in_range

    async def connect(self, client_class: Any, device: BLEDevice, name: str, **kwargs: Any) -> FakeClock:
        self.connections += 1
        if self.connect_error:
            raise self.connect_error
        return self.clock

    def register(self, hass: HomeAssistant, callback: Any, matcher: Any, mode: Any, **kwargs: Any) -> Callable[[], None]:
        assert matcher["address"] == ADDRESS and matcher["connectable"] is True
        self._callbacks.append(callback)
        return lambda: self._callbacks.remove(callback)

    @property
    def listening(self) -> bool:
        return bool(self._callbacks)

    def advertise(self) -> None:
        for callback in list(self._callbacks):
            callback(service_info(), BluetoothChange.ADVERTISEMENT)


@pytest.fixture(autouse=True)
def auto_enable_custom_integrations(enable_custom_integrations: None) -> None:
    """Load the integration from custom_components."""


@pytest.fixture(autouse=True)
def bluetooth_mocked(mock_bluetooth: None) -> None:
    """Keep the real Bluetooth stack from touching adapters."""


@pytest.fixture
async def paris(hass: HomeAssistant) -> None:
    """Use a time zone with daylight saving time."""
    await hass.config.async_set_time_zone("Europe/Paris")


@pytest.fixture
def clock() -> FakeClock:
    """Return the simulated clock."""
    return FakeClock()


@pytest.fixture
def ble(clock: FakeClock) -> Generator[BluetoothHarness]:
    """Route Bluetooth calls of the integration to the simulated clock."""
    harness = BluetoothHarness(clock)
    with (
        patch("custom_components.lywsd02_sync.manager.establish_connection", side_effect=harness.connect),
        patch("homeassistant.components.bluetooth.async_ble_device_from_address", side_effect=harness.device),
        patch("homeassistant.components.bluetooth.async_address_present", side_effect=harness.present),
        patch("homeassistant.components.bluetooth.async_register_callback", side_effect=harness.register),
    ):
        yield harness
