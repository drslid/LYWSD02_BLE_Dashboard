"""Values written to and read from the LYWSD02."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
import struct
from zoneinfo import ZoneInfo

import pytest

from custom_components.lywsd02_sync.protocol import (
    HourlyRecord,
    clock_drift,
    clock_offset,
    decode_battery,
    decode_measurement,
    decode_record,
    decode_record_count,
    encode_record_index,
    encode_time,
    record_hour,
    utc_offset_minutes,
)

UTC_NOON = datetime(2026, 7, 1, 12, 0, tzinfo=ZoneInfo("UTC"))


@pytest.mark.parametrize(
    ("zone", "hours", "extra_minutes"),
    [
        ("UTC", 0, 0),
        ("Europe/Paris", 2, 0),
        ("America/New_York", -4, 0),
        ("Asia/Kolkata", 5, 30),
        ("Asia/Kathmandu", 5, 45),
        ("America/St_Johns", -3, 30),
        ("Pacific/Chatham", 12, 45),
    ],
)
def test_encode_time_keeps_whole_hours_in_the_offset_byte(zone: str, hours: int, extra_minutes: int) -> None:
    """Fractional zones carry their minutes in the timestamp, like the web dashboard."""
    now = UTC_NOON.astimezone(ZoneInfo(zone))
    timestamp, offset = struct.unpack("<Ib", encode_time(now))
    assert offset == hours
    assert timestamp == int(UTC_NOON.timestamp()) + extra_minutes * 60
    assert clock_drift(encode_time(now), now) == 0


def test_negative_offsets_use_a_signed_byte() -> None:
    """UTC-4 is written as 0xFC, not as a wrapped positive hour."""
    assert encode_time(UTC_NOON.astimezone(ZoneInfo("America/New_York")))[4] == 0xFC


def test_clock_drift_reports_a_clock_behind_and_four_byte_values() -> None:
    """Negative drift means the display is late; four bytes mean UTC."""
    now = UTC_NOON.astimezone(ZoneInfo("Europe/Paris"))
    behind = struct.pack("<Ib", int(UTC_NOON.timestamp()) - 42, 2)
    assert clock_drift(behind, now) == -42
    assert clock_drift(struct.pack("<I", int(UTC_NOON.timestamp()) + 7200), now) == 0
    assert utc_offset_minutes(now) == 120


def test_clock_drift_rejects_incomplete_values() -> None:
    """A truncated read is an error, not a wrong measurement."""
    with pytest.raises(ValueError):
        clock_drift(b"\x01\x02\x03", UTC_NOON)


def test_clock_offset_is_how_far_the_clock_unix_time_runs_ahead() -> None:
    """Fractional zones and corrections move the Unix time the clock keeps, not only its display."""
    india = UTC_NOON.astimezone(ZoneInfo("Asia/Kolkata"))
    assert clock_offset(encode_time(india), india) == 1800
    assert clock_offset(encode_time(india, 5), india) == 2100
    assert clock_offset(struct.pack("<I", int(UTC_NOON.timestamp()) - 42), UTC_NOON) == -42
    with pytest.raises(ValueError):
        clock_offset(b"\x01\x02\x03", UTC_NOON)


def test_measurements_are_celsius_whatever_the_display() -> None:
    """Hundredths of a degree Celsius, signed, then the humidity; longer values are accepted."""
    assert decode_measurement(struct.pack("<hB", 2240, 48)) == (22.4, 48)
    assert decode_measurement(struct.pack("<hBH", -512, 91, 3008)) == (-5.12, 91)
    assert decode_battery(b"\x57") == 87
    with pytest.raises(ValueError):
        decode_measurement(b"\xc0\x08")
    with pytest.raises(ValueError):
        decode_battery(b"")


def test_hourly_records_and_their_count() -> None:
    """The count gives the newest index first; a record is its index, clock time, maximum then minimum."""
    value = struct.pack("<IIhBhB", 6, 1789318800, 2250, 48, 2205, 47)
    assert decode_record(value) == HourlyRecord(6, 1789318800, 22.5, 48, 22.05, 47)
    assert decode_record_count(struct.pack("<II", 330, 167)) == (330, 167)
    assert encode_record_index(164) == b"\xa4\x00\x00\x00"
    with pytest.raises(ValueError):
        decode_record(value[:13])
    with pytest.raises(ValueError):
        decode_record_count(bytes(7))


def test_records_are_placed_on_the_utc_hour_they_cover() -> None:
    """Records carry the clock's own time: its offset is removed, then the hour is rounded."""
    start = datetime(2026, 9, 13, 17, tzinfo=UTC)
    stamp = int(start.timestamp())

    def placed(clock_ahead: float, clock_stamp: int = stamp) -> datetime:
        return record_hour(HourlyRecord(6, clock_stamp, 22.5, 48, 22.05, 47), clock_ahead)

    assert placed(0) == start
    # Drift and corrections of a few minutes do not move a record to another hour.
    assert placed(170) == placed(-170) == placed(300) == start
    # A clock two hours behind stamped 15:00 the hour that began at 17:00.
    assert placed(-7200, stamp - 7200) == start
    # UTC+05:30 clocks begin their hours at half past: the hour from 17:30 counts as 18:00.
    assert placed(1800, stamp + 3600) == start + timedelta(hours=1)
