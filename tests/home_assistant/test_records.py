"""Hourly records of the clock as Home Assistant statistics; the recorder starts before Home Assistant."""

from __future__ import annotations

import struct
from datetime import UTC, datetime, timedelta
from functools import partial
from typing import Any
from unittest.mock import AsyncMock, patch

import pytest
from freezegun.api import FrozenDateTimeFactory
from homeassistant.components.recorder import Recorder, get_instance
from homeassistant.components.recorder.statistics import (
    get_metadata,
    statistics_during_period,
)
from homeassistant.core import HomeAssistant
from pytest_homeassistant_custom_component.components.recorder.common import (
    async_wait_recording_done,
)

from custom_components.lywsd02_sync.records import (
    async_import_records,
    record_statistic_id,
)

from .conftest import ADDRESS, TITLE, BluetoothHarness, FakeClock
from .test_init import (
    HUMIDITY_MAX,
    HUMIDITY_MIN,
    TEMPERATURE_MAX,
    TEMPERATURE_MIN,
    hourly_record,
    later,
    now_timestamp,
    press,
    setup_clock,
)

pytestmark = pytest.mark.usefixtures("paris")


@pytest.fixture(autouse=True)
def mock_recorder_before_hass(async_setup_recorder_instance: Any) -> None:
    """Prepare the recorder database before Home Assistant is created."""


async def hourly_statistics(hass: HomeAssistant, key: str) -> list[dict[str, float]]:
    """Return the hourly statistic imported from the records of the clock."""
    statistic_id = record_statistic_id(ADDRESS, key)
    rows = await get_instance(hass).async_add_executor_job(
        statistics_during_period,
        hass,
        datetime(2026, 9, 1, tzinfo=UTC),
        None,
        {statistic_id},
        "hour",
        None,
        {"min", "max", "mean"},
    )
    return [
        {field: row[field] for field in ("start", "min", "max", "mean")}
        for row in rows.get(statistic_id, [])
    ]


async def test_hourly_records_give_24_hour_extremes_and_statistics(
    recorder_mock: Recorder,
    hass: HomeAssistant,
    freezer: FrozenDateTimeFactory,
    ble: BluetoothHarness,
    clock: FakeClock,
) -> None:
    """Records are placed with the time the clock kept before the sync, then read only once."""
    freezer.move_to("2026-09-29 10:59:59+00:00")
    proxy = ble.proxy()
    proxy.hear()
    # Two hours behind, the clock kept the 30 hours before the current one.
    first_hour = datetime(2026, 9, 28, 4, tzinfo=UTC)
    clock.value = struct.pack("<Ib", now_timestamp() - 7200, 2)
    clock.records = [
        hourly_record(500 + rise, first_hour + timedelta(hours=rise), -7200, rise)
        for rise in range(30)
    ]
    # An hour that ends while the time is set is stamped with the new time: it waits for the next sync.
    late_hour = hourly_record(530, first_hour + timedelta(hours=30), 0, 30)
    clock.on_time_write = lambda: clock.records.append(late_hour)
    await setup_clock(hass)
    await async_wait_recording_done(hass)

    # The 24 hours before the sync begin at 10:00 the day before.
    assert hass.states.get(TEMPERATURE_MIN).state == "20.6"
    assert hass.states.get(TEMPERATURE_MAX).state == "23.4"
    assert hass.states.get(HUMIDITY_MIN).state == "46"
    assert hass.states.get(HUMIDITY_MAX).state == "79"
    temperatures = await hourly_statistics(hass, "temperature_records")
    humidities = await hourly_statistics(hass, "humidity_records")
    assert len(temperatures) == len(humidities) == 30
    assert temperatures[0] == {
        "start": first_hour.timestamp(),
        "min": 20,
        "max": 20.5,
        "mean": 20.25,
    }
    assert humidities[-1] == {
        "start": first_hour.timestamp() + 29 * 3600,
        "min": 69,
        "max": 79,
        "mean": 74,
    }
    metadata = await get_instance(hass).async_add_executor_job(
        partial(
            get_metadata,
            hass,
            statistic_ids={record_statistic_id(ADDRESS, "temperature_records")},
        )
    )
    assert [meta["name"] for _id, meta in metadata.values()] == [
        f"{TITLE} Temperature records"
    ]

    # Set at the first sync, the clock now keeps the right time; the hour left aside is read alone.
    freezer.move_to("2026-09-29 11:20:00+00:00")
    clock.on_time_write = None
    clock.value = struct.pack("<Ib", now_timestamp(), 2)
    proxy.hear()
    await press(hass)
    await async_wait_recording_done(hass)

    assert clock.first_record_sent == 530
    temperatures = await hourly_statistics(hass, "temperature_records")
    assert len(temperatures) == 31
    assert (
        temperatures[-1]["start"] == datetime(2026, 9, 29, 10, tzinfo=UTC).timestamp()
    )
    assert hass.states.get(TEMPERATURE_MIN).state == "20.7"


@pytest.mark.parametrize("restart", [False, True])
async def test_failed_statistics_import_is_recovered_without_another_ble_connection(
    recorder_mock,
    hass,
    freezer,
    ble,
    clock,
    restart,
):
    freezer.move_to("2026-09-29 10:00:00+00:00")
    ble.proxy().hear()
    clock.value = struct.pack("<Ib", now_timestamp(), 2)
    hour = datetime(2026, 9, 29, 9, tzinfo=UTC)
    clock.records = [hourly_record(10, hour, 0, 0)]
    with patch(
        "custom_components.lywsd02_sync.manager.async_import_records",
        AsyncMock(side_effect=RuntimeError("Recorder unavailable")),
    ):
        entry = await setup_clock(hass)
    assert entry.runtime_data._next_record == 11
    assert entry.runtime_data.sync_diagnostics["pending_record_imports"] == 1
    with patch(
        "custom_components.lywsd02_sync.manager.async_import_records",
        wraps=async_import_records,
    ) as importing:
        if restart:
            assert await hass.config_entries.async_unload(entry.entry_id)
            assert await hass.config_entries.async_setup(entry.entry_id)
            await hass.async_block_till_done(wait_background_tasks=True)
        else:
            await later(hass, freezer, timedelta(minutes=1, seconds=2))
    assert len(importing.call_args.args[-1]) == 1
    assert ble.connections == 1
    assert entry.runtime_data.sync_diagnostics["pending_record_imports"] == 0
    assert (
        hass.states.get("sensor.lywsd02_cdef_sync_status").attributes[
            "pending_record_imports"
        ]
        == 0
    )
    await async_wait_recording_done(hass)
    statistics = await hourly_statistics(hass, "temperature_records")
    assert len(statistics) == 1
    assert statistics[0]["start"] == hour.timestamp()
