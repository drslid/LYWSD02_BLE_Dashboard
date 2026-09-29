"""Time values of the Xiaomi LYWSD02 clock characteristic."""

from __future__ import annotations

from datetime import datetime, timedelta
import math
import struct


def utc_offset_minutes(moment: datetime) -> int:
    """Return the UTC offset of an aware datetime in whole minutes."""
    return round((moment.utcoffset() or timedelta()).total_seconds() / 60)


def encode_time(now: datetime) -> bytes:
    """Return the 5-byte value: Unix time (uint32 LE) and whole-hour UTC offset (int8)."""
    offset = utc_offset_minutes(now)
    hours = math.floor(offset / 60)
    # Fractional zones such as UTC+05:30 carry their remaining minutes in the timestamp.
    return struct.pack("<Ib", round(now.timestamp()) + (offset - hours * 60) * 60, hours)


def clock_drift(value: bytes | bytearray, now: datetime) -> float:
    """Return how many seconds the displayed time is ahead of now (negative when behind)."""
    if len(value) < 4:
        raise ValueError("Incomplete time value")
    timestamp = struct.unpack_from("<I", value)[0]
    hours = struct.unpack_from("<b", value, 4)[0] if len(value) >= 5 else 0
    return timestamp + hours * 3600 - now.timestamp() - utc_offset_minutes(now) * 60
