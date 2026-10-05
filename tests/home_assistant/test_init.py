"""Behavior of a configured LYWSD02 clock, driven through the real Home Assistant Bluetooth manager."""

from __future__ import annotations

import asyncio
from collections.abc import Callable
from datetime import timedelta
import logging
import struct
from typing import Any
from unittest.mock import AsyncMock, patch

from bleak.exc import BleakError
from freezegun.api import FrozenDateTimeFactory
import pytest

from homeassistant.components import bluetooth
from homeassistant.config_entries import ConfigEntryState
from homeassistant.const import CONF_ADDRESS, STATE_UNKNOWN
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import issue_registry as ir
from homeassistant.util import dt as dt_util
from pytest_homeassistant_custom_component.common import MockConfigEntry, async_fire_time_changed

from custom_components.lywsd02_sync.const import (
    DEFAULT_OPTIONS,
    DOMAIN,
    FORCE_POLL_INTERVAL,
    FORCE_RECONNECT_DELAYS,
    FORCE_TIMEOUT,
    RETRY_DELAYS,
    SEARCH_INTERVAL,
)

from .conftest import ADDRESS, TITLE, BluetoothHarness, FakeClock

BUTTON = "button.lywsd02_cdef_sync_clock"
LAST_SYNC = "sensor.lywsd02_cdef_last_sync"
NEXT_SYNC = "sensor.lywsd02_cdef_next_sync"
STATUS = "sensor.lywsd02_cdef_sync_status"
DRIFT = "sensor.lywsd02_cdef_drift_before_last_sync"
FREQUENCY = "select.lywsd02_cdef_automatic_sync"
WEEKDAY = "select.lywsd02_cdef_weekly_sync_day"
UNIT = "select.lywsd02_cdef_temperature_unit"
FORMAT = "select.lywsd02_cdef_time_format"
DAY = "number.lywsd02_cdef_monthly_sync_day"
CORRECTION = "number.lywsd02_cdef_time_correction"
SYNC_TIME = "time.lywsd02_cdef_sync_time"

pytestmark = pytest.mark.usefixtures("paris")


async def setup_clock(hass: HomeAssistant, options: dict[str, Any] | None = None) -> MockConfigEntry:
    """Add and set up the clock entry."""
    entry = MockConfigEntry(
        domain=DOMAIN,
        unique_id=ADDRESS,
        title=TITLE,
        data={CONF_ADDRESS: ADDRESS},
        options=options or DEFAULT_OPTIONS,
    )
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done(wait_background_tasks=True)
    return entry


async def settle(hass: HomeAssistant) -> None:
    """Let background syncs finish."""
    await hass.async_block_till_done(wait_background_tasks=True)


async def later(hass: HomeAssistant, freezer: FrozenDateTimeFactory, delay: timedelta) -> None:
    """Move time forward and run what was due meanwhile."""
    freezer.tick(delay)
    async_fire_time_changed(hass)
    await settle(hass)


def last_write(clock: FakeClock) -> tuple[int, int]:
    """Return the timestamp and hour offset of the last time written."""
    return struct.unpack("<Ib", clock.writes[-1])


def now_timestamp() -> int:
    """Return the current Unix time."""
    return int(dt_util.utcnow().timestamp())


async def press(hass: HomeAssistant) -> None:
    """Press the sync button."""
    await hass.services.async_call("button", "press", {"entity_id": BUTTON}, blocking=True)


async def run_pending() -> None:
    """Let ready tasks run; settle() would also wait for a press still in progress."""
    for _ in range(10):
        await asyncio.sleep(0)


async def start_press(hass: HomeAssistant) -> asyncio.Task[None]:
    """Press the sync button and return while it searches for the clock or reconnects."""
    pressing = asyncio.create_task(press(hass))
    await run_pending()
    return pressing


async def elapse(hass: HomeAssistant, freezer: FrozenDateTimeFactory, seconds: float) -> None:
    """Move time forward while a press is still in progress."""
    freezer.tick(seconds)
    async_fire_time_changed(hass)
    await run_pending()


async def change(hass: HomeAssistant, entity_id: str, value: Any) -> None:
    """Change a setting from the device page."""
    domain = entity_id.split(".")[0]
    service, field = {
        "select": ("select_option", "option"),
        "number": ("set_value", "value"),
        "time": ("set_value", "time"),
    }[domain]
    await hass.services.async_call(domain, service, {"entity_id": entity_id, field: value}, blocking=True)
    await settle(hass)


def issue(hass: HomeAssistant, entry: MockConfigEntry) -> ir.IssueEntry | None:
    """Return the repair issue of the clock, if any."""
    return ir.async_get(hass).async_get_issue(DOMAIN, f"unreachable_{entry.entry_id}")


async def test_new_clock_is_synced_at_setup(
    hass: HomeAssistant, freezer: FrozenDateTimeFactory, ble: BluetoothHarness, clock: FakeClock
) -> None:
    """Adding a clock in range sets it at once, keeps its display and plans the nightly sync."""
    freezer.move_to("2026-09-29 10:00:00+00:00")
    ble.proxy().hear()
    clock.value = struct.pack("<Ib", now_timestamp() - 42, 2)
    clock.unit = b"\x01"

    await setup_clock(hass)

    assert last_write(clock) == (now_timestamp(), 2)
    assert clock.disconnects == 1
    assert hass.states.get(STATUS).state == "synced"
    assert hass.states.get(LAST_SYNC).state == "2026-09-29T10:00:00+00:00"
    assert float(hass.states.get(DRIFT).state) == -42
    assert hass.states.get(NEXT_SYNC).state == "2026-09-30T02:00:00+00:00"
    assert hass.states.get(BUTTON) is not None
    # Display settings stay as they are until chosen in Home Assistant.
    assert (clock.units, clock.formats) == ([], [])
    assert hass.states.get(UNIT).state == "fahrenheit"
    assert hass.states.get(FORMAT).state == STATE_UNKNOWN
    assert hass.states.get(CORRECTION).state == "0"
    assert hass.states.get(SYNC_TIME).state == "04:00:00"
    assert hass.states.get(FREQUENCY).state == "daily"
    assert hass.states.get(FREQUENCY).attributes["options"] == ["daily", "weekly", "monthly", "manual"]


async def test_clock_found_later_is_synced_at_once(
    hass: HomeAssistant, ble: BluetoothHarness, clock: FakeClock
) -> None:
    """A clock out of range is synchronized as soon as Home Assistant hears it."""
    proxy = ble.proxy()
    modes: list[bluetooth.BluetoothScanningMode] = []
    stopped: list[bool] = []
    original = bluetooth.async_register_callback

    def register(*args: Any) -> Callable[[], None]:
        modes.append(args[3])
        cancel = original(*args)

        def stop() -> None:
            stopped.append(True)
            cancel()

        return stop

    with patch("homeassistant.components.bluetooth.async_register_callback", side_effect=register):
        await setup_clock(hass)
        assert hass.states.get(STATUS).state == "waiting"
        assert clock.writes == []
        # Active mode lets automatic scanners look for the missing clock.
        assert modes == [bluetooth.BluetoothScanningMode.ACTIVE]

        proxy.hear()
        await settle(hass)
        assert len(clock.writes) == 1
        assert hass.states.get(STATUS).state == "synced"
        # Found: no more active scanning for this clock.
        assert stopped == [True]

        proxy.hear()
        await settle(hass)
        assert len(clock.writes) == 1


async def test_clock_made_reachable_silently_is_found_by_the_retry_timer(
    hass: HomeAssistant, freezer: FrozenDateTimeFactory, ble: BluetoothHarness, clock: FakeClock
) -> None:
    """The 1.0.0 bug: a passive proxy owns the clock, so Home Assistant adds the connectable
    route without calling the integration back. The search must not depend on that call."""
    passive, active = ble.proxy(connectable=False), ble.proxy()
    passive.hear()
    await setup_clock(hass)
    assert hass.states.get(STATUS).state == "waiting"

    active.hear()
    await later(hass, freezer, SEARCH_INTERVAL)
    assert len(clock.writes) == 1
    assert hass.states.get(STATUS).state == "synced"


async def test_failed_sync_retries_on_a_growing_delay(
    hass: HomeAssistant, freezer: FrozenDateTimeFactory, ble: BluetoothHarness, clock: FakeClock
) -> None:
    """Connection failures are retried on a timer, even when the advertisements never change."""
    proxy = ble.proxy()
    proxy.hear()
    ble.connect_error = BleakError("No free connection slot")
    await setup_clock(hass)
    assert ble.connections == 1
    assert hass.states.get(STATUS).state == "failed"

    proxy.hear()
    await later(hass, freezer, timedelta(minutes=4, seconds=59))
    assert ble.connections == 1
    await later(hass, freezer, timedelta(seconds=1))
    assert ble.connections == 2
    await later(hass, freezer, timedelta(minutes=14, seconds=59))
    assert ble.connections == 2

    ble.connect_error = None
    await later(hass, freezer, timedelta(seconds=1))
    assert ble.connections == 3
    assert hass.states.get(STATUS).state == "synced"


async def test_button_searches_for_a_clock_that_is_not_heard(
    hass: HomeAssistant, freezer: FrozenDateTimeFactory, ble: BluetoothHarness, clock: FakeClock
) -> None:
    """The button looks for the clock instead of trusting what Home Assistant remembers, then syncs it."""
    freezer.move_to("2026-09-29 10:00:00+00:00")
    proxy = ble.proxy()
    proxy.hear()
    await setup_clock(hass)
    # Last heard four minutes ago: the proxy forgets the clock, Home Assistant still remembers it.
    proxy.hear(ago=240)
    await later(hass, freezer, timedelta(seconds=30))
    assert bluetooth.async_ble_device_from_address(hass, ADDRESS, connectable=True) is not None

    with patch(
        "homeassistant.components.bluetooth.async_request_active_scan", AsyncMock(), create=True
    ) as request_active_scan:
        pressing = await start_press(hass)
        await elapse(hass, freezer, 30)
        assert not pressing.done()
        assert ble.connections == 1
        assert hass.states.get(STATUS).state == "waiting"

        proxy.hear()
        await elapse(hass, freezer, FORCE_POLL_INTERVAL)
        await pressing

    # Adapters in automatic mode scan actively during the search.
    request_active_scan.assert_awaited_once_with(hass, FORCE_TIMEOUT)
    assert ble.connections == 2
    assert len(clock.writes) == 2
    assert hass.states.get(STATUS).state == "synced"


@pytest.mark.parametrize(
    ("heard", "reason"),
    [
        ("never", "not_in_range"),
        # Long enough ago for the proxy to forget the clock, not Home Assistant.
        ("long ago", "not_in_range"),
        ("by a passive proxy", "passive_only"),
    ],
)
async def test_button_gives_up_after_a_minute_and_keeps_searching(
    hass: HomeAssistant,
    freezer: FrozenDateTimeFactory,
    ble: BluetoothHarness,
    clock: FakeClock,
    heard: str,
    reason: str,
) -> None:
    """A clock that no adapter able to connect hears is searched for one minute, then in the background."""
    proxy = ble.proxy()
    if heard == "long ago":
        proxy.hear(ago=240)
        await later(hass, freezer, timedelta(seconds=30))
    elif heard == "by a passive proxy":
        ble.proxy(connectable=False).hear()
    await setup_clock(hass)

    pressing = await start_press(hass)
    await elapse(hass, freezer, FORCE_TIMEOUT - 1)
    assert not pressing.done()
    await elapse(hass, freezer, 1)
    with pytest.raises(HomeAssistantError) as error:
        await pressing
    assert error.value.translation_key == reason
    assert ble.connections == 0
    assert hass.states.get(STATUS).state == "waiting"

    proxy.hear()
    await later(hass, freezer, SEARCH_INTERVAL)
    assert len(clock.writes) == 1
    assert hass.states.get(STATUS).state == "synced"


async def test_button_fails_at_once_without_an_adapter_that_can_connect(
    hass: HomeAssistant, ble: BluetoothHarness, clock: FakeClock
) -> None:
    """Searching cannot help when no adapter or proxy of Home Assistant can connect."""
    ble.proxy(connectable=False).hear()
    await setup_clock(hass)

    with pytest.raises(HomeAssistantError) as error:
        await press(hass)
    assert error.value.translation_key == "no_connectable_adapter"


async def test_button_reconnects_when_the_clock_drops_the_connection(
    hass: HomeAssistant, freezer: FrozenDateTimeFactory, ble: BluetoothHarness, clock: FakeClock
) -> None:
    """The clock can drop a connection before the time is written: the button connects again."""
    ble.proxy().hear()
    await setup_clock(hass)
    clock.drops = 2

    pressing = await start_press(hass)
    assert ble.connections == 2
    await elapse(hass, freezer, FORCE_RECONNECT_DELAYS[0])
    assert ble.connections == 3
    await elapse(hass, freezer, FORCE_RECONNECT_DELAYS[1])
    await pressing

    assert ble.connections == 4
    assert clock.disconnects == 4
    assert len(clock.writes) == 2
    assert hass.states.get(STATUS).state == "synced"


async def test_button_reports_a_failed_sync(
    hass: HomeAssistant, freezer: FrozenDateTimeFactory, ble: BluetoothHarness, clock: FakeClock
) -> None:
    """After its reconnections, a manual sync shows why it failed, as a single failure."""
    ble.proxy().hear()
    await setup_clock(hass)
    ble.connect_error = BleakError("No free connection slot")

    pressing = await start_press(hass)
    for delay in FORCE_RECONNECT_DELAYS:
        await elapse(hass, freezer, delay)
    with pytest.raises(HomeAssistantError) as error:
        await pressing
    assert error.value.translation_key == "sync_failed"
    assert error.value.translation_placeholders == {"name": TITLE, "error": "No free connection slot"}
    assert ble.connections == 2 + len(FORCE_RECONNECT_DELAYS)
    assert hass.states.get(STATUS).state == "failed"

    # The automatic retries start over with their first delay.
    ble.connect_error = None
    await later(hass, freezer, RETRY_DELAYS[0] - timedelta(seconds=1))
    assert ble.connections == 2 + len(FORCE_RECONNECT_DELAYS)
    await later(hass, freezer, timedelta(seconds=1))
    assert len(clock.writes) == 2
    assert hass.states.get(STATUS).state == "synced"


async def test_unloading_ends_the_search_of_the_button(
    hass: HomeAssistant, freezer: FrozenDateTimeFactory, ble: BluetoothHarness, clock: FakeClock
) -> None:
    """A clock reloaded or removed while the button searches for it is left alone afterwards."""
    proxy = ble.proxy()
    entry = await setup_clock(hass)
    pressing = await start_press(hass)

    assert await hass.config_entries.async_unload(entry.entry_id)
    await elapse(hass, freezer, FORCE_POLL_INTERVAL)
    with pytest.raises(HomeAssistantError):
        await pressing

    proxy.hear()
    await later(hass, freezer, SEARCH_INTERVAL)
    assert ble.connections == 0


def warnings(caplog: pytest.LogCaptureFixture) -> list[str]:
    """Return the warnings logged by the integration."""
    return [
        record.getMessage()
        for record in caplog.records
        if record.levelno == logging.WARNING and record.name.startswith("custom_components.lywsd02_sync")
    ]


@pytest.mark.parametrize(
    ("connectable_proxy", "reason", "message"),
    [
        (True, "passive_only", "only heard by Bluetooth proxies that cannot connect"),
        (False, "no_connectable_adapter", "no Bluetooth adapter or proxy of Home Assistant can connect"),
    ],
)
async def test_unreachable_clock_explains_how_to_fix_it(
    hass: HomeAssistant,
    freezer: FrozenDateTimeFactory,
    ble: BluetoothHarness,
    clock: FakeClock,
    caplog: pytest.LogCaptureFixture,
    connectable_proxy: bool,
    reason: str,
    message: str,
) -> None:
    """A clock heard only by passive proxies gets a repair issue, then syncs once reachable."""
    active = ble.proxy() if connectable_proxy else None
    ble.proxy(connectable=False).hear()
    entry = await setup_clock(hass)

    # Proxies can take a few minutes to report the clock after a restart.
    await later(hass, freezer, timedelta(minutes=4))
    assert issue(hass, entry) is None
    assert warnings(caplog) == []

    await later(hass, freezer, timedelta(minutes=1))
    assert issue(hass, entry).translation_key == reason
    assert issue(hass, entry).translation_placeholders == {"name": TITLE}
    await later(hass, freezer, timedelta(minutes=1))
    assert len(warnings(caplog)) == 1
    assert message in warnings(caplog)[0]

    (active or ble.proxy()).hear()
    await later(hass, freezer, SEARCH_INTERVAL)
    assert len(clock.writes) == 1
    assert issue(hass, entry) is None


async def test_clock_nobody_hears_is_logged_once(
    hass: HomeAssistant,
    freezer: FrozenDateTimeFactory,
    ble: BluetoothHarness,
    clock: FakeClock,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Out of range is not a setup problem: one warning, no repair issue."""
    ble.proxy()
    entry = await setup_clock(hass)
    for _ in range(7):
        await later(hass, freezer, SEARCH_INTERVAL)

    assert len(warnings(caplog)) == 1
    assert "has not been heard by any Bluetooth adapter or proxy" in warnings(caplog)[0]
    assert issue(hass, entry) is None
    assert hass.states.get(STATUS).state == "waiting"


async def test_daily_schedule_syncs_and_moves_to_the_next_day(
    hass: HomeAssistant, freezer: FrozenDateTimeFactory, ble: BluetoothHarness, clock: FakeClock
) -> None:
    """The nightly sync runs at 04:00 local time, then plans the next night."""
    freezer.move_to("2026-09-29 10:00:00+00:00")
    proxy = ble.proxy()
    proxy.hear()
    await setup_clock(hass)
    assert len(clock.writes) == 1

    freezer.move_to("2026-09-30 02:00:00+00:00")
    proxy.hear()
    async_fire_time_changed(hass)
    await settle(hass)
    assert len(clock.writes) == 2
    assert hass.states.get(NEXT_SYNC).state == "2026-10-01T02:00:00+00:00"


async def test_schedule_is_chosen_on_the_device_page(
    hass: HomeAssistant, freezer: FrozenDateTimeFactory, ble: BluetoothHarness, clock: FakeClock
) -> None:
    """Frequency, day and time entities plan the next sync without connecting to the clock."""
    freezer.move_to("2026-09-29 10:00:00+00:00")
    proxy = ble.proxy()
    proxy.hear()
    entry = await setup_clock(hass)
    manager = entry.runtime_data

    await change(hass, FREQUENCY, "monthly")
    await change(hass, DAY, 15)
    await change(hass, SYNC_TIME, "03:30:00")
    assert entry.options == {**DEFAULT_OPTIONS, "schedule": "monthly", "day": 15, "time": "03:30:00"}
    assert hass.states.get(DAY).state == "15"
    assert hass.states.get(NEXT_SYNC).state == "2026-10-15T01:30:00+00:00"

    await change(hass, FREQUENCY, "weekly")
    await change(hass, WEEKDAY, "fri")
    assert hass.states.get(NEXT_SYNC).state == "2026-10-02T01:30:00+00:00"
    assert len(clock.writes) == 1
    # Applied in place: no reload interrupts a sync.
    assert entry.state is ConfigEntryState.LOADED
    assert entry.runtime_data is manager

    freezer.move_to("2026-10-02 01:30:00+00:00")
    proxy.hear()
    async_fire_time_changed(hass)
    await settle(hass)
    assert len(clock.writes) == 2
    assert hass.states.get(NEXT_SYNC).state == "2026-10-09T01:30:00+00:00"


async def test_monthly_schedule_follows_local_time(
    hass: HomeAssistant, freezer: FrozenDateTimeFactory, ble: BluetoothHarness, clock: FakeClock
) -> None:
    """The monthly sync keeps its local time across the change to winter time."""
    freezer.move_to("2026-10-14 10:00:00+00:00")
    proxy = ble.proxy()
    proxy.hear()
    await setup_clock(hass, {**DEFAULT_OPTIONS, "schedule": "monthly", "day": 15, "time": "03:30:00"})
    assert hass.states.get(NEXT_SYNC).state == "2026-10-15T01:30:00+00:00"

    freezer.move_to("2026-10-15 01:30:00+00:00")
    proxy.hear()
    async_fire_time_changed(hass)
    await settle(hass)
    assert len(clock.writes) == 2
    assert hass.states.get(NEXT_SYNC).state == "2026-11-15T02:30:00+00:00"


async def test_custom_schedule_appears_in_the_frequency_list(
    hass: HomeAssistant, ble: BluetoothHarness, clock: FakeClock
) -> None:
    """A cron expression set with Configure is shown, other clocks keep the simple list."""
    ble.proxy().hear()
    await setup_clock(hass, {**DEFAULT_OPTIONS, "schedule": "cron", "cron": "0 */6 * * *"})

    state = hass.states.get(FREQUENCY)
    assert state.state == "cron"
    assert state.attributes["options"] == ["daily", "weekly", "monthly", "manual", "cron"]


async def test_display_settings_reach_the_clock_at_once_and_at_every_sync(
    hass: HomeAssistant, freezer: FrozenDateTimeFactory, ble: BluetoothHarness, clock: FakeClock
) -> None:
    """Unit, 12/24 h format and correction are written right away on a LYWSD02MMC."""
    freezer.move_to("2026-09-29 10:00:00+00:00")
    clock.mmc = True
    ble.proxy().hear()
    await setup_clock(hass)

    await change(hass, UNIT, "fahrenheit")
    assert clock.units == [b"\x01"]
    assert len(clock.writes) == 2
    assert hass.states.get(UNIT).state == "fahrenheit"

    await change(hass, FORMAT, "12h")
    assert clock.formats == [bytes(6) + b"\xaa"]
    assert hass.states.get(FORMAT).state == "12h"

    await change(hass, CORRECTION, 5)
    assert last_write(clock) == (now_timestamp() + 300, 2)
    assert hass.states.get(CORRECTION).state == "5"

    await press(hass)
    # Drift is measured against the corrected time.
    assert float(hass.states.get(DRIFT).state) == 0
    assert ble.connections == 5
    assert clock.units[-1] == b"\x01"
    assert clock.formats[-1] == bytes(6) + b"\xaa"

    await change(hass, UNIT, "celsius")
    assert clock.units[-1] == b"\xff"


async def test_plain_lywsd02_stays_on_time_when_it_refuses_12h(
    hass: HomeAssistant, ble: BluetoothHarness, clock: FakeClock, caplog: pytest.LogCaptureFixture
) -> None:
    """Only the LYWSD02MMC knows the 12/24 h command; the time is still set."""
    ble.proxy().hear()
    await setup_clock(hass)

    await change(hass, FORMAT, "12h")
    await press(hass)

    assert hass.states.get(STATUS).state == "synced"
    assert len(clock.writes) == 3
    assert clock.formats == []
    assert len(warnings(caplog)) == 1
    assert "only the LYWSD02MMC supports it" in warnings(caplog)[0]


async def test_settings_wait_for_a_clock_out_of_range(
    hass: HomeAssistant, ble: BluetoothHarness, clock: FakeClock
) -> None:
    """A setting changed while the clock is away is written when it comes back."""
    proxy = ble.proxy()
    await setup_clock(hass)

    await change(hass, UNIT, "fahrenheit")
    assert clock.units == []
    assert hass.states.get(UNIT).state == "fahrenheit"

    proxy.hear()
    await settle(hass)
    assert clock.units == [b"\x01"]
    assert len(clock.writes) == 1


async def test_setting_changed_during_a_sync_gets_one_more_connection(
    hass: HomeAssistant, ble: BluetoothHarness, clock: FakeClock
) -> None:
    """A connection in progress used the old settings, so the clock is reached once more."""
    ble.proxy().hear()
    entry = MockConfigEntry(
        domain=DOMAIN, unique_id=ADDRESS, title=TITLE, data={CONF_ADDRESS: ADDRESS}, options=DEFAULT_OPTIONS
    )
    entry.add_to_hass(hass)

    def choose_fahrenheit() -> None:
        clock.on_time_write = None
        hass.config_entries.async_update_entry(entry, options={**entry.options, "temperature_unit": "fahrenheit"})

    clock.on_time_write = choose_fahrenheit
    assert await hass.config_entries.async_setup(entry.entry_id)
    await settle(hass)

    assert ble.connections == 2
    assert clock.units == [b"\x01"]
    assert hass.states.get(STATUS).state == "synced"


async def test_daylight_saving_change_is_corrected_without_schedule(
    hass: HomeAssistant, freezer: FrozenDateTimeFactory, ble: BluetoothHarness, clock: FakeClock
) -> None:
    """Even without a schedule, the clock follows the October change within the hour."""
    freezer.move_to("2026-10-24 22:00:00+00:00")
    proxy = ble.proxy()
    proxy.hear()
    await setup_clock(hass, {**DEFAULT_OPTIONS, "schedule": "manual"})
    assert last_write(clock)[1] == 2
    assert hass.states.get(NEXT_SYNC).state == STATE_UNKNOWN

    freezer.move_to("2026-10-25 00:02:00+00:00")
    proxy.hear()
    async_fire_time_changed(hass)
    await settle(hass)
    assert len(clock.writes) == 1

    freezer.move_to("2026-10-25 01:02:00+00:00")
    proxy.hear()
    async_fire_time_changed(hass)
    await settle(hass)
    assert len(clock.writes) == 2
    assert last_write(clock) == (now_timestamp(), 1)


DEFAULT_APPLIED = {"temperature_unit": None, "clock_format": None, "time_correction": 0}


@pytest.mark.parametrize(
    ("last_sync", "applied", "expected_writes"),
    [
        ("2026-09-27T12:00:00+02:00", DEFAULT_APPLIED, 1),
        ("2026-09-29T05:00:00+02:00", DEFAULT_APPLIED, 0),
        # Saved by version 1.0.0, which never wrote any setting.
        ("2026-09-29T05:00:00+02:00", None, 1),
        ("2026-09-29T05:00:00+02:00", {**DEFAULT_APPLIED, "time_correction": 3}, 1),
    ],
)
async def test_restart_restores_state_and_catches_up(
    hass: HomeAssistant,
    freezer: FrozenDateTimeFactory,
    hass_storage: dict[str, Any],
    ble: BluetoothHarness,
    clock: FakeClock,
    last_sync: str,
    applied: dict[str, Any] | None,
    expected_writes: int,
) -> None:
    """A restart keeps the history and syncs only for a missed run or unwritten settings."""
    freezer.move_to("2026-09-29 10:00:00+00:00")
    ble.proxy().hear()
    entry = MockConfigEntry(
        domain=DOMAIN, unique_id=ADDRESS, title=TITLE, data={CONF_ADDRESS: ADDRESS}, options=DEFAULT_OPTIONS
    )
    data: dict[str, Any] = {"last_sync": last_sync, "drift": 3.0, "offset": 120, "unit": "fahrenheit"}
    if applied is not None:
        data["applied"] = applied
    hass_storage[f"{DOMAIN}.{entry.entry_id}"] = {
        "version": 1,
        "minor_version": 1,
        "key": f"{DOMAIN}.{entry.entry_id}",
        "data": data,
    }
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await settle(hass)

    assert len(clock.writes) == expected_writes
    assert hass.states.get(STATUS).state == "synced"
    if not expected_writes:
        assert hass.states.get(LAST_SYNC).state == "2026-09-29T03:00:00+00:00"
        assert float(hass.states.get(DRIFT).state) == 3
        assert hass.states.get(UNIT).state == "fahrenheit"


async def test_removal_forgets_history_and_repair_issue(
    hass: HomeAssistant,
    freezer: FrozenDateTimeFactory,
    hass_storage: dict[str, Any],
    ble: BluetoothHarness,
    clock: FakeClock,
) -> None:
    """Removing the clock deletes its saved state and its repair issue."""
    freezer.move_to("2026-09-29 10:00:00+00:00")
    ble.proxy()
    ble.proxy(connectable=False).hear()
    entry = MockConfigEntry(
        domain=DOMAIN, unique_id=ADDRESS, title=TITLE, data={CONF_ADDRESS: ADDRESS}, options=DEFAULT_OPTIONS
    )
    key = f"{DOMAIN}.{entry.entry_id}"
    hass_storage[key] = {
        "version": 1,
        "minor_version": 1,
        "key": key,
        "data": {"last_sync": "2026-09-29T05:00:00+02:00", "offset": 120, "applied": DEFAULT_APPLIED},
    }
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await settle(hass)

    await change(hass, CORRECTION, 1)
    await later(hass, freezer, timedelta(minutes=5))
    assert issue(hass, entry).translation_key == "passive_only"

    assert await hass.config_entries.async_remove(entry.entry_id)
    await settle(hass)
    assert key not in hass_storage
    assert issue(hass, entry) is None
