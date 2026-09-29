"""Time values written to and read from the LYWSD02."""

from __future__ import annotations

from datetime import datetime
import struct
from zoneinfo import ZoneInfo

import pytest

from custom_components.lywsd02_sync.protocol import clock_drift, encode_time, utc_offset_minutes

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
