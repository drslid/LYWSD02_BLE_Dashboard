"""Hourly records of the clock as Home Assistant statistics; the recorder starts before Home Assistant."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from functools import partial
import struct
from typing import Any

from freezegun.api import FrozenDateTimeFactory
import pytest

from homeassistant.components.recorder import Recorder, get_instance
from homeassistant.components.recorder.statistics import get_metadata, statistics_during_period
from homeassistant.core import HomeAssistant
from pytest_homeassistant_custom_component.components.recorder.common import async_wait_recording_done

from custom_components.lywsd02_sync.records import record_statistic_id

from .conftest import ADDRESS, TITLE, BluetoothHarness, FakeClock
from .test_init import (
    HUMIDITY_MAX,
    HUMIDITY_MIN,
    TEMPERATURE_MAX,
    TEMPERATURE_MIN,
    hourly_record,
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
    return [{field: row[field] for field in ("start", "min", "max", "mean")} for row in rows.get(statistic_id, [])]


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
        hourly_record(500 + rise, first_hour + timedelta(hours=rise), -7200, rise) for rise in range(30)
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
    assert temperatures[0] == {"start": first_hour.timestamp(), "min": 20, "max": 20.5, "mean": 20.25}
    assert humidities[-1] == {"start": first_hour.timestamp() + 29 * 3600, "min": 69, "max": 79, "mean": 74}
    metadata = await get_instance(hass).async_add_executor_job(
        partial(get_metadata, hass, statistic_ids={record_statistic_id(ADDRESS, "temperature_records")})
    )
    assert [meta["name"] for _id, meta in metadata.values()] == [f"{TITLE} Temperature records"]

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
    assert temperatures[-1]["start"] == datetime(2026, 9, 29, 10, tzinfo=UTC).timestamp()
    assert hass.states.get(TEMPERATURE_MIN).state == "20.7"
