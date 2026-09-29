"""Behavior of a configured LYWSD02 clock."""

from __future__ import annotations

from datetime import timedelta
import struct
from typing import Any

from bleak.exc import BleakError
from freezegun.api import FrozenDateTimeFactory
import pytest

from homeassistant.config_entries import ConfigEntryState
from homeassistant.const import CONF_ADDRESS, STATE_UNKNOWN
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError
from homeassistant.util import dt as dt_util
from pytest_homeassistant_custom_component.common import MockConfigEntry, async_fire_time_changed

from custom_components.lywsd02_sync.const import DEFAULT_OPTIONS, DOMAIN

from .conftest import ADDRESS, TITLE, BluetoothHarness, FakeClock

BUTTON = "button.lywsd02_cdef_sync_clock"
LAST_SYNC = "sensor.lywsd02_cdef_last_sync"
NEXT_SYNC = "sensor.lywsd02_cdef_next_sync"
STATUS = "sensor.lywsd02_cdef_sync_status"
DRIFT = "sensor.lywsd02_cdef_drift_before_last_sync"

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


def last_write(clock: FakeClock) -> tuple[int, int]:
    """Return the timestamp and hour offset of the last time written."""
    return struct.unpack("<Ib", clock.writes[-1])


async def press(hass: HomeAssistant) -> None:
    """Press the sync button."""
    await hass.services.async_call("button", "press", {"entity_id": BUTTON}, blocking=True)


async def test_new_clock_is_synced_at_setup(
    hass: HomeAssistant, freezer: FrozenDateTimeFactory, ble: BluetoothHarness, clock: FakeClock
) -> None:
    """Adding a clock sets it immediately and plans the nightly sync."""
    freezer.move_to("2026-09-29 10:00:00+00:00")
    clock.value = struct.pack("<Ib", int(dt_util.utcnow().timestamp()) - 42, 2)

    await setup_clock(hass)

    assert last_write(clock) == (int(dt_util.utcnow().timestamp()), 2)
    assert clock.disconnects == 1
    assert hass.states.get(STATUS).state == "synced"
    assert hass.states.get(LAST_SYNC).state == "2026-09-29T10:00:00+00:00"
    assert float(hass.states.get(DRIFT).state) == -42
    assert hass.states.get(NEXT_SYNC).state == "2026-09-30T02:00:00+00:00"
    assert hass.states.get(BUTTON) is not None


async def test_clock_out_of_range_is_synced_when_seen_again(
    hass: HomeAssistant, ble: BluetoothHarness, clock: FakeClock
) -> None:
    """A pending sync waits for the clock instead of failing forever."""
    ble.in_range = False
    await setup_clock(hass)
    assert hass.states.get(STATUS).state == "waiting"
    assert clock.writes == []

    with pytest.raises(HomeAssistantError) as error:
        await press(hass)
    assert error.value.translation_key == "not_in_range"

    ble.in_range = True
    ble.advertise()
    await settle(hass)
    assert len(clock.writes) == 1
    assert hass.states.get(STATUS).state == "synced"

    ble.advertise()
    await settle(hass)
    assert len(clock.writes) == 1


async def test_failed_sync_retries_after_a_backoff(
    hass: HomeAssistant, freezer: FrozenDateTimeFactory, ble: BluetoothHarness, clock: FakeClock
) -> None:
    """Connection failures are retried when the clock advertises, without hammering it."""
    ble.connect_error = BleakError("No free connection slot")
    await setup_clock(hass)
    assert ble.connections == 1
    assert hass.states.get(STATUS).state == "failed"

    ble.advertise()
    await settle(hass)
    assert ble.connections == 1

    ble.connect_error = None
    freezer.tick(timedelta(minutes=5))
    ble.advertise()
    await settle(hass)
    assert ble.connections == 2
    assert hass.states.get(STATUS).state == "synced"


async def test_button_reports_a_failed_sync(hass: HomeAssistant, ble: BluetoothHarness, clock: FakeClock) -> None:
    """A manual sync shows why it failed."""
    await setup_clock(hass)
    ble.connect_error = BleakError("No free connection slot")

    with pytest.raises(HomeAssistantError) as error:
        await press(hass)
    assert error.value.translation_key == "sync_failed"
    assert error.value.translation_placeholders == {"name": TITLE, "error": "No free connection slot"}
    assert hass.states.get(STATUS).state == "failed"

    ble.connect_error = None
    await press(hass)
    assert len(clock.writes) == 2
    assert hass.states.get(STATUS).state == "synced"


async def test_daily_schedule_syncs_and_moves_to_the_next_day(
    hass: HomeAssistant, freezer: FrozenDateTimeFactory, ble: BluetoothHarness, clock: FakeClock
) -> None:
    """The nightly sync runs at 04:00 local time, then plans the next night."""
    freezer.move_to("2026-09-29 10:00:00+00:00")
    await setup_clock(hass)
    assert len(clock.writes) == 1

    freezer.move_to("2026-09-30 02:00:00+00:00")
    async_fire_time_changed(hass)
    await settle(hass)
    assert len(clock.writes) == 2
    assert hass.states.get(NEXT_SYNC).state == "2026-10-01T02:00:00+00:00"


async def test_daylight_saving_change_is_corrected_without_schedule(
    hass: HomeAssistant, freezer: FrozenDateTimeFactory, ble: BluetoothHarness, clock: FakeClock
) -> None:
    """Even without a schedule, the clock follows the October change within the hour."""
    freezer.move_to("2026-10-24 22:00:00+00:00")
    await setup_clock(hass, {**DEFAULT_OPTIONS, "schedule": "manual"})
    assert last_write(clock)[1] == 2
    assert hass.states.get(NEXT_SYNC).state == STATE_UNKNOWN

    freezer.move_to("2026-10-25 00:02:00+00:00")
    async_fire_time_changed(hass)
    await settle(hass)
    assert len(clock.writes) == 1

    freezer.move_to("2026-10-25 01:02:00+00:00")
    async_fire_time_changed(hass)
    await settle(hass)
    assert len(clock.writes) == 2
    assert last_write(clock) == (int(dt_util.utcnow().timestamp()), 1)


@pytest.mark.parametrize(
    ("last_sync", "expected_writes"),
    [("2026-09-27T12:00:00+02:00", 1), ("2026-09-29T05:00:00+02:00", 0)],
)
async def test_restart_restores_state_and_catches_up_missed_runs(
    hass: HomeAssistant,
    freezer: FrozenDateTimeFactory,
    hass_storage: dict[str, Any],
    ble: BluetoothHarness,
    clock: FakeClock,
    last_sync: str,
    expected_writes: int,
) -> None:
    """A restart keeps the history and only syncs when a scheduled run was missed."""
    freezer.move_to("2026-09-29 10:00:00+00:00")
    entry = MockConfigEntry(
        domain=DOMAIN, unique_id=ADDRESS, title=TITLE, data={CONF_ADDRESS: ADDRESS}, options=DEFAULT_OPTIONS
    )
    hass_storage[f"{DOMAIN}.{entry.entry_id}"] = {
        "version": 1,
        "minor_version": 1,
        "key": f"{DOMAIN}.{entry.entry_id}",
        "data": {"last_sync": last_sync, "drift": 3.0, "offset": 120},
    }
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await settle(hass)

    assert len(clock.writes) == expected_writes
    assert hass.states.get(STATUS).state == "synced"
    if not expected_writes:
        assert hass.states.get(LAST_SYNC).state == "2026-09-29T03:00:00+00:00"
        assert float(hass.states.get(DRIFT).state) == 3


async def test_new_options_reschedule_and_removal_forgets_history(
    hass: HomeAssistant, hass_storage: dict[str, Any], ble: BluetoothHarness, clock: FakeClock
) -> None:
    """Changing options reloads the schedule; removing the clock deletes its saved state."""
    entry = await setup_clock(hass)
    key = f"{DOMAIN}.{entry.entry_id}"
    assert hass_storage[key]["data"]["offset"] == utc_offset(hass)

    hass.config_entries.async_update_entry(entry, options={**DEFAULT_OPTIONS, "schedule": "manual"})
    await settle(hass)
    assert entry.state is ConfigEntryState.LOADED
    assert hass.states.get(NEXT_SYNC).state == STATE_UNKNOWN
    assert ble.listening

    assert await hass.config_entries.async_remove(entry.entry_id)
    await settle(hass)
    assert key not in hass_storage
    assert not ble.listening


def utc_offset(hass: HomeAssistant) -> int:
    """Return the current Home Assistant UTC offset in minutes."""
    return round(dt_util.now().utcoffset().total_seconds() / 60)
