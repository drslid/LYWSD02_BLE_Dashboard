"""Regressions for unattended syncs, stuck backends and clocks due together."""

from __future__ import annotations

import asyncio
import struct
from datetime import timedelta
from unittest.mock import AsyncMock, patch

import pytest
from bleak.exc import BleakError
from freezegun.api import FrozenDateTimeFactory
from homeassistant.components import bluetooth
from homeassistant.const import CONF_ADDRESS
from homeassistant.core import HomeAssistant
from homeassistant.util import dt as dt_util
from pytest_homeassistant_custom_component.common import (
    MockConfigEntry,
    async_fire_time_changed,
)

from custom_components.lywsd02_sync.const import (
    BATTERY_CHARACTERISTIC,
    DEFAULT_OPTIONS,
    DOMAIN,
    RECORD_COUNT_CHARACTERISTIC,
    RETRY_DELAYS,
    TIME_CHARACTERISTIC,
    UNIT_CHARACTERISTIC,
)
from custom_components.lywsd02_sync.diagnostics import (
    async_get_config_entry_diagnostics,
)

from .conftest import BluetoothHarness, FakeClock
from .test_init import (
    FORCE_RECONNECT_DELAYS,
    LAST_SYNC,
    STATUS,
    elapse,
    hourly_record,
    later,
    now_timestamp,
    settle,
    setup_clock,
    start_press,
)

pytestmark = pytest.mark.usefixtures("paris")


async def test_stuck_disconnect_does_not_block_other_clocks(
    hass: HomeAssistant,
    ble: BluetoothHarness,
    clock: FakeClock,
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
        domain=DOMAIN,
        unique_id=second_address,
        title="Bedroom",
        data={CONF_ADDRESS: second_address},
        options=DEFAULT_OPTIONS,
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
    with patch("custom_components.lywsd02_sync.transport.CLEANUP_TIMEOUT", 0):
        one = asyncio.create_task(first.runtime_data.async_sync())
        await asyncio.wait_for(disconnecting.wait(), 1)
        two = asyncio.create_task(second.runtime_data.async_sync())
        await asyncio.wait_for(asyncio.gather(one, two), 0.3)
    assert len(clock.writes) == len(second_clock.writes) == 2
    assert first.runtime_data.status == second.runtime_data.status == "synced"
    assert hass.states.get(LAST_SYNC).state == "2026-09-29T10:01:00+00:00"


async def test_failed_disconnect_does_not_erase_an_acknowledged_sync(
    hass: HomeAssistant,
    ble: BluetoothHarness,
    clock: FakeClock,
) -> None:
    ble.proxy().hear()
    entry = await setup_clock(hass)
    clock.disconnect = AsyncMock(
        side_effect=BleakError("Proxy disconnected during cleanup")
    )
    await entry.runtime_data.async_sync()
    assert len(clock.writes) == 2
    assert entry.runtime_data.status == "synced"


async def test_notifications_cleanup_is_bounded_after_the_readings_deadline(
    hass: HomeAssistant,
    ble: BluetoothHarness,
    clock: FakeClock,
) -> None:
    ble.proxy().hear()
    entry = await setup_clock(hass)
    clock.measurement = None

    async def hang(_uuid: str) -> None:
        await asyncio.Event().wait()

    clock.stop_notify = AsyncMock(side_effect=hang)
    with (
        patch("custom_components.lywsd02_sync.transport.CLEANUP_TIMEOUT", 0),
        patch("custom_components.lywsd02_sync.transport.READINGS_TIMEOUT", 0),
    ):
        await asyncio.wait_for(entry.runtime_data.async_sync(), 0.3)
    assert entry.runtime_data.status == "synced"
    assert clock.disconnects == 2


async def test_watchdog_recovers_a_missed_scheduled_callback(
    hass: HomeAssistant,
    ble: BluetoothHarness,
    clock: FakeClock,
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
    hass: HomeAssistant,
    ble: BluetoothHarness,
    clock: FakeClock,
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
    hass: HomeAssistant,
    ble: BluetoothHarness,
    freezer: FrozenDateTimeFactory,
) -> None:
    freezer.move_to("2026-09-29 10:00:00+00:00")
    ble.proxy()
    with patch(
        "homeassistant.components.bluetooth.async_request_active_scan",
        new_callable=AsyncMock,
        create=True,
    ) as scan:
        entry = await setup_clock(hass)
        assert scan.await_count == 1
        await later(hass, freezer, timedelta(minutes=1))
        assert scan.await_count == 1
        await later(hass, freezer, timedelta(minutes=4))
        assert scan.await_count == 2
    assert entry.runtime_data.status == "waiting"


async def test_recorder_work_does_not_hold_the_bluetooth_queue(
    hass: HomeAssistant,
    ble: BluetoothHarness,
    clock: FakeClock,
) -> None:
    ble.proxy().hear()
    entry = await setup_clock(hass)
    from custom_components.lywsd02_sync.manager import SYNC_LOCK

    observed = []

    async def record(*_args) -> None:
        observed.append(hass.data[SYNC_LOCK].locked())

    with patch(
        "custom_components.lywsd02_sync.manager.async_import_records",
        side_effect=record,
    ):
        entry.runtime_data._pending_records = {
            dt_util.utcnow(): hourly_record(1, dt_util.utcnow(), 0, 0)
        }
        await entry.runtime_data.async_sync()
    assert observed == [False]


async def test_status_explains_an_old_last_sync_and_clears_errors_after_recovery(
    hass: HomeAssistant,
    ble: BluetoothHarness,
    freezer: FrozenDateTimeFactory,
) -> None:
    freezer.move_to("2026-09-29 10:00:00+00:00")
    ble.proxy().hear()
    ble.connect_error = BleakError("No free connection slot")
    entry = await setup_clock(hass)
    attributes = hass.states.get(STATUS).attributes
    assert attributes["last_attempt"] == "2026-09-29T10:00:00+00:00"
    assert attributes["last_error"] == "No free connection slot"
    assert attributes["next_retry"] == "2026-09-29T10:00:30+00:00"
    assert attributes["pending"] is True
    assert attributes["in_progress"] is False
    assert entry.runtime_data._pending
    ble.connect_error = None
    await later(hass, freezer, RETRY_DELAYS[0])
    attributes = hass.states.get(STATUS).attributes
    assert attributes["last_error"] is attributes["next_retry"] is None
    assert attributes["pending"] is attributes["in_progress"] is False


@pytest.mark.parametrize(
    "characteristic",
    [TIME_CHARACTERISTIC, RECORD_COUNT_CHARACTERISTIC, UNIT_CHARACTERISTIC],
)
async def test_stuck_optional_read_cannot_prevent_the_time_write(
    hass, ble, clock, characteristic
):
    ble.proxy().hear()
    original = clock.read_gatt_char

    async def read(uuid):
        if uuid == characteristic:
            await asyncio.Event().wait()
        return await original(uuid)

    clock.read_gatt_char = read
    with patch("custom_components.lywsd02_sync.transport.GATT_READ_TIMEOUT", 0):
        entry = await asyncio.wait_for(setup_clock(hass), 5)
        # HA's idle helper can return while this background sync is suspended.
        # Keep the timeout patch active until the transport actually completes.
        if task := entry.runtime_data._task:
            await asyncio.wait_for(task, 2)
    assert len(clock.writes) == 1
    assert entry.runtime_data.status == "synced"
    assert entry.runtime_data.clock_verified is (characteristic != TIME_CHARACTERISTIC)


async def test_ignored_time_write_is_retried_instead_of_reported_as_success(
    hass, ble, clock, freezer
):
    freezer.move_to("2026-09-29 10:00:00+00:00")
    ble.proxy().hear()
    entry = await setup_clock(hass)
    previous_sync = entry.runtime_data.last_sync
    stale_time = struct.pack("<Ib", now_timestamp() - 3600, 2)

    def ignore_once():
        clock.value = stale_time
        clock.on_time_write = None

    clock.on_time_write = ignore_once
    pressing = await start_press(hass)
    assert entry.runtime_data.last_sync == previous_sync
    await elapse(hass, freezer, FORCE_RECONNECT_DELAYS[0])
    await pressing
    assert len(clock.writes) == 3
    assert entry.runtime_data.clock_verified is True
    assert entry.runtime_data.status == "synced"


async def test_success_is_visible_before_optional_readings_finish(
    hass, ble, clock, freezer
):
    freezer.move_to("2026-09-29 10:00:00+00:00")
    ble.proxy().hear()
    entry = await setup_clock(hass)
    freezer.tick(timedelta(minutes=1))
    reading, finish = asyncio.Event(), asyncio.Event()
    original = clock.read_gatt_char

    async def read(uuid):
        if uuid == BATTERY_CHARACTERISTIC:
            reading.set()
            await finish.wait()
        return await original(uuid)

    clock.read_gatt_char = read
    syncing = asyncio.create_task(entry.runtime_data.async_sync())
    await asyncio.wait_for(reading.wait(), 0.5)
    assert not syncing.done()
    assert hass.states.get(LAST_SYNC).state == dt_util.utcnow().isoformat()
    assert entry.runtime_data.clock_verified is True
    finish.set()
    await syncing


async def test_busy_preferred_proxy_does_not_hide_a_free_route(hass, ble):
    busy, free = ble.proxy(), ble.proxy()
    busy.hear()
    free.hear()
    busy.connector.can_connect = lambda: False
    entry = await setup_clock(hass)
    device = entry.runtime_data._async_reachable_device()
    assert (
        device
        is free.get_discovered_device_advertisement_data(entry.runtime_data.address)[0]
    )
    assert len(entry.runtime_data.sync_diagnostics["bluetooth_routes"]) == 2


async def test_scan_failure_keeps_the_callback_and_polling_fallback(
    hass, ble, clock, freezer
):
    proxy = ble.proxy()
    with patch(
        "homeassistant.components.bluetooth.async_request_active_scan",
        AsyncMock(side_effect=RuntimeError("Scan unavailable")),
        create=True,
    ):
        await setup_clock(hass)
        pressing = await start_press(hass)
        await elapse(hass, freezer, 1)
        proxy.hear()
        await elapse(hass, freezer, 1)
        await pressing
    assert len(clock.writes) == 1


async def test_downloadable_diagnostics_redact_pairing_credentials(hass, ble):
    ble.proxy().hear()
    entry = await setup_clock(hass)
    secret = "12" * 16
    hass.config_entries.async_update_entry(
        entry, data={**entry.data, "pairing_token": secret}
    )
    diagnostics = await async_get_config_entry_diagnostics(hass, entry)
    assert secret not in str(diagnostics)
    assert diagnostics["sync"]["clock_verified"] is True
    assert diagnostics["sync"]["bluetooth_routes"]


async def test_setup_loads_the_bluetooth_dependency_before_requesting_sync(hass):
    entry = await setup_clock(hass)
    assert "bluetooth" in hass.config.components
    assert entry.runtime_data.last_error == "no_connectable_adapter"
    assert entry.runtime_data.status == "waiting"


async def test_manual_search_works_without_the_active_scan_api(
    hass, ble, clock, freezer, monkeypatch
):
    proxy = ble.proxy()
    proxy.hear()
    await setup_clock(hass)
    monkeypatch.delattr(bluetooth, "async_request_active_scan", raising=False)
    proxy.hear(ago=240)
    await later(hass, freezer, timedelta(seconds=30))
    pressing = await start_press(hass)
    await elapse(hass, freezer, 1)
    proxy.hear()
    await elapse(hass, freezer, 1)
    await pressing
    assert len(clock.writes) == 2


async def test_dst_change_during_optional_readings_is_corrected_on_the_next_check(
    hass, ble, clock, freezer
):
    freezer.move_to("2026-10-25 00:59:59+00:00")
    ble.proxy().hear()
    original = clock.read_gatt_char
    changed = False

    async def read(uuid):
        nonlocal changed
        if uuid == BATTERY_CHARACTERISTIC and not changed:
            changed = True
            freezer.move_to("2026-10-25 01:00:01+00:00")
        return await original(uuid)

    clock.read_gatt_char = read
    entry = await setup_clock(hass)
    assert entry.runtime_data._synced_offset == 120
    await later(hass, freezer, timedelta(minutes=1, seconds=2))
    assert len(clock.writes) == 2
    assert entry.runtime_data._synced_offset == 60
