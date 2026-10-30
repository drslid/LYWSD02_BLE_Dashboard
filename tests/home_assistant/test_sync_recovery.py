"""Regressions for unattended syncs, stuck backends and clocks due together."""

from __future__ import annotations

import asyncio
from datetime import timedelta
from unittest.mock import AsyncMock, patch

from bleak.exc import BleakError
from freezegun.api import FrozenDateTimeFactory
import pytest

from homeassistant.const import CONF_ADDRESS
from homeassistant.core import HomeAssistant
from pytest_homeassistant_custom_component.common import MockConfigEntry, async_fire_time_changed

from custom_components.lywsd02_sync.const import DEFAULT_OPTIONS, DOMAIN, RETRY_DELAYS

from .conftest import BluetoothHarness, FakeClock
from .test_init import LAST_SYNC, STATUS, later, setup_clock, settle

pytestmark = pytest.mark.usefixtures("paris")


async def test_stuck_disconnect_does_not_block_other_clocks(
    hass: HomeAssistant, ble: BluetoothHarness, clock: FakeClock,
    freezer: FrozenDateTimeFactory,
) -> None:
    freezer.move_to("2026-09-29 10:00:00+00:00")
    second_address = "E7:2E:01:00:00:02"
    second_clock = FakeClock()
    ble.clocks[second_address] = second_clock
    proxy = ble.proxy()
    proxy.hear()
    proxy.hear(address=second_address)
    first = await setup_clock(hass)
    second = MockConfigEntry(
        domain=DOMAIN, unique_id=second_address, title="Bedroom",
        data={CONF_ADDRESS: second_address}, options=DEFAULT_OPTIONS,
    )
    second.add_to_hass(hass)
    assert await hass.config_entries.async_setup(second.entry_id)
    await settle(hass)
    disconnecting = asyncio.Event()

    async def hang() -> None:
        disconnecting.set()
        await asyncio.Event().wait()

    clock.disconnect = AsyncMock(side_effect=hang)
    freezer.tick(timedelta(minutes=1))
    with patch("custom_components.lywsd02_sync.manager.CLEANUP_TIMEOUT", 0):
        one = asyncio.create_task(first.runtime_data.async_sync())
        await asyncio.wait_for(disconnecting.wait(), 1)
        two = asyncio.create_task(second.runtime_data.async_sync())
        await asyncio.wait_for(asyncio.gather(one, two), 0.3)
    assert len(clock.writes) == len(second_clock.writes) == 2
    assert first.runtime_data.status == second.runtime_data.status == "synced"
    assert hass.states.get(LAST_SYNC).state == "2026-09-29T10:01:00+00:00"


async def test_failed_disconnect_does_not_erase_an_acknowledged_sync(
    hass: HomeAssistant, ble: BluetoothHarness, clock: FakeClock,
) -> None:
    ble.proxy().hear()
    entry = await setup_clock(hass)
    clock.disconnect = AsyncMock(side_effect=BleakError("Proxy disconnected during cleanup"))
    await entry.runtime_data.async_sync()
    assert len(clock.writes) == 2
    assert entry.runtime_data.status == "synced"


async def test_notifications_cleanup_is_bounded_after_the_readings_deadline(
    hass: HomeAssistant, ble: BluetoothHarness, clock: FakeClock,
) -> None:
    ble.proxy().hear()
    entry = await setup_clock(hass)
    clock.measurement = None
    async def hang(_uuid: str) -> None:
        await asyncio.Event().wait()
    clock.stop_notify = AsyncMock(side_effect=hang)
    with (
        patch("custom_components.lywsd02_sync.manager.CLEANUP_TIMEOUT", 0),
        patch("custom_components.lywsd02_sync.manager.READINGS_TIMEOUT", 0),
    ):
        await asyncio.wait_for(entry.runtime_data.async_sync(), 0.3)
    assert entry.runtime_data.status == "synced"
    assert clock.disconnects == 2


async def test_watchdog_recovers_a_missed_scheduled_callback(
    hass: HomeAssistant, ble: BluetoothHarness, clock: FakeClock,
    freezer: FrozenDateTimeFactory,
) -> None:
    freezer.move_to("2026-09-29 10:00:00+00:00")
    proxy = ble.proxy()
    proxy.hear()
    entry = await setup_clock(hass)
    manager = entry.runtime_data
    manager._async_cancel_schedule()
    freezer.move_to("2026-09-30 02:01:02+00:00")
    proxy.hear()
    async_fire_time_changed(hass)
    await settle(hass)
    assert len(clock.writes) == 2
    assert manager.next_sync.isoformat() == "2026-10-01T04:00:00+02:00"


async def test_watchdog_rearms_a_pending_sync_without_a_retry_timer(
    hass: HomeAssistant, ble: BluetoothHarness, clock: FakeClock,
    freezer: FrozenDateTimeFactory,
) -> None:
    freezer.move_to("2026-09-29 10:00:00+00:00")
    ble.proxy().hear()
    ble.connect_error = BleakError("No free connection slot")
    entry = await setup_clock(hass)
    entry.runtime_data._async_cancel_retry()
    ble.connect_error = None
    await later(hass, freezer, timedelta(minutes=1, seconds=2))
    assert clock.writes
    assert hass.states.get(STATUS).state == "synced"


async def test_background_discovery_requests_a_short_active_scan_and_limits_repetition(
    hass: HomeAssistant, ble: BluetoothHarness,
    freezer: FrozenDateTimeFactory,
) -> None:
    freezer.move_to("2026-09-29 10:00:00+00:00")
    ble.proxy()
    with patch("homeassistant.components.bluetooth.async_request_active_scan", new_callable=AsyncMock, create=True) as scan:
        entry = await setup_clock(hass)
        assert scan.await_count == 1
        await later(hass, freezer, timedelta(minutes=1))
        assert scan.await_count == 1
        await later(hass, freezer, timedelta(minutes=4))
        assert scan.await_count == 2
    assert entry.runtime_data.status == "waiting"


async def test_recorder_work_does_not_hold_the_bluetooth_queue(
    hass: HomeAssistant, ble: BluetoothHarness, clock: FakeClock,
) -> None:
    ble.proxy().hear()
    entry = await setup_clock(hass)
    from custom_components.lywsd02_sync.manager import SYNC_LOCK
    observed = []

    async def record(*_args) -> None:
        observed.append(hass.data[SYNC_LOCK].locked())

    with patch("custom_components.lywsd02_sync.manager.async_import_records", side_effect=record):
        await entry.runtime_data.async_sync()
    assert observed == [False]


async def test_status_explains_an_old_last_sync_and_clears_errors_after_recovery(
    hass: HomeAssistant, ble: BluetoothHarness,
    freezer: FrozenDateTimeFactory,
) -> None:
    freezer.move_to("2026-09-29 10:00:00+00:00")
    ble.proxy().hear()
    ble.connect_error = BleakError("No free connection slot")
    entry = await setup_clock(hass)
    attributes = hass.states.get(STATUS).attributes
    assert attributes["last_attempt"] == "2026-09-29T10:00:00+00:00"
    assert attributes["last_error"] == "No free connection slot"
    assert attributes["next_retry"] == "2026-09-29T10:05:00+00:00"
    assert attributes["pending"] is True
    assert attributes["in_progress"] is False
    assert entry.runtime_data._pending
    ble.connect_error = None
    await later(hass, freezer, RETRY_DELAYS[0])
    attributes = hass.states.get(STATUS).attributes
    assert attributes["last_error"] is attributes["next_retry"] is None
    assert attributes["pending"] is attributes["in_progress"] is False
