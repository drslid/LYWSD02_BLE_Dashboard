"""Shared fixtures for the LYWSD02 Clock Sync tests."""

from __future__ import annotations

from collections.abc import AsyncGenerator, Callable
from typing import Any
from unittest.mock import AsyncMock, patch

from bleak.backends.client import BaseBleakClient
from bleak.backends.device import BLEDevice
from bleak.backends.scanner import AdvertisementData
from bleak.exc import BleakError
from bluetooth_data_tools import monotonic_time_coarse
from habluetooth import BaseHaRemoteScanner, HaBluetoothConnector
import pytest

from homeassistant.components import bluetooth
from homeassistant.components.bluetooth import BluetoothServiceInfoBleak
from homeassistant.core import HomeAssistant
from homeassistant.setup import async_setup_component

from custom_components.lywsd02_sync.const import TIME_CHARACTERISTIC, UNIT_CHARACTERISTIC

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
    """GATT values of a plain LYWSD02; set mmc for the LYWSD02MMC and its 12/24 h command."""

    def __init__(self) -> None:
        self.mmc = False
        self.value = bytes(5)
        self.unit = bytes([0xFF])
        self.writes: list[bytes] = []
        self.units: list[bytes] = []
        self.formats: list[bytes] = []
        self.disconnects = 0
        self.on_time_write: Callable[[], None] | None = None

    async def read_gatt_char(self, uuid: str) -> bytearray:
        return bytearray(self.unit if uuid == UNIT_CHARACTERISTIC else self.value)

    async def write_gatt_char(self, uuid: str, data: bytes, response: bool) -> None:
        assert response is True
        if uuid == UNIT_CHARACTERISTIC:
            self.units.append(bytes(data))
            self.unit = bytes(data)
            return
        assert uuid == TIME_CHARACTERISTIC
        if len(data) == 7 and self.mmc:
            self.formats.append(bytes(data))
            return
        if len(data) != 5:
            raise BleakError("Invalid attribute length")
        self.writes.append(bytes(data))
        self.value = bytes(data)
        if self.on_time_write:
            self.on_time_write()

    async def disconnect(self) -> None:
        self.disconnects += 1


class Proxy(BaseHaRemoteScanner):
    """Bluetooth proxy; only connectable ones (ESPHome active: true) can reach the clock."""

    def hear(self, address: str = ADDRESS, name: str = "LYWSD02") -> None:
        """Deliver one advertisement, always identical, as a real clock does."""
        self._async_on_advertisement(address, -60, name, [], {}, {}, None, {}, monotonic_time_coarse())


class BluetoothHarness:
    """Real Home Assistant Bluetooth manager fed by fake proxies; connections reach the fake clock."""

    def __init__(self, hass: HomeAssistant, clock: FakeClock) -> None:
        self.hass = hass
        self.clock = clock
        self.connect_error: Exception | None = None
        self.connections = 0
        self._cleanups: list[Callable[[], None]] = []

    def proxy(self, connectable: bool = True) -> Proxy:
        """Add a Bluetooth proxy to Home Assistant."""
        source = f"proxy-{len(self._cleanups)}"
        connector = HaBluetoothConnector(BaseBleakClient, source, lambda: True) if connectable else None
        scanner = Proxy(source, source, connector, connectable)
        self._cleanups.append(scanner.async_setup())
        self._cleanups.append(
            bluetooth.async_register_scanner(self.hass, scanner, connection_slots=3 if connectable else None)
        )
        return scanner

    async def connect(self, client_class: Any, device: BLEDevice, name: str, **kwargs: Any) -> FakeClock:
        assert device.address == ADDRESS
        self.connections += 1
        if self.connect_error:
            raise self.connect_error
        return self.clock

    def close(self) -> None:
        for cleanup in reversed(self._cleanups):
            cleanup()


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
async def ble(hass: HomeAssistant, clock: FakeClock) -> AsyncGenerator[BluetoothHarness]:
    """Run the real Bluetooth integration; only the final connection is simulated."""
    assert await async_setup_component(hass, "bluetooth", {})
    harness = BluetoothHarness(hass, clock)
    with (
        patch("custom_components.lywsd02_sync.manager.establish_connection", side_effect=harness.connect),
        patch("custom_components.lywsd02_sync.manager.close_stale_connections_by_address", AsyncMock()),
    ):
        yield harness
    harness.close()
