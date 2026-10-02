"""Values of the Xiaomi LYWSD02 time and unit characteristics."""

from __future__ import annotations

from datetime import datetime, timedelta
import math
import struct

from .const import FORMAT_12H, UNIT_CELSIUS, UNIT_FAHRENHEIT

FAHRENHEIT_BYTE = 0x01
CELSIUS_BYTE = 0xFF
TWELVE_HOUR_BYTE = 0xAA


def utc_offset_minutes(moment: datetime) -> int:
    """Return the UTC offset of an aware datetime in whole minutes."""
    return round((moment.utcoffset() or timedelta()).total_seconds() / 60)


def encode_time(now: datetime, correction_minutes: int = 0) -> bytes:
    """Return the 5-byte value: Unix time (uint32 LE) and whole-hour UTC offset (int8).

    The correction moves the displayed time without changing the time zone.
    """
    offset = utc_offset_minutes(now)
    hours = math.floor(offset / 60)
    # Fractional zones such as UTC+05:30 carry their remaining minutes in the timestamp.
    shift = (offset - hours * 60 + correction_minutes) * 60
    return struct.pack("<Ib", round(now.timestamp()) + shift, hours)


def clock_drift(value: bytes | bytearray, now: datetime) -> float:
    """Return how many seconds the displayed time is ahead of now (negative when behind)."""
    if len(value) < 4:
        raise ValueError("Incomplete time value")
    timestamp = struct.unpack_from("<I", value)[0]
    hours = struct.unpack_from("<b", value, 4)[0] if len(value) >= 5 else 0
    return timestamp + hours * 3600 - now.timestamp() - utc_offset_minutes(now) * 60


def encode_clock_format(clock_format: str) -> bytes:
    """Return the 7-byte 12/24 h command, written to the time characteristic.

    Only the LYWSD02MMC accepts it; the plain LYWSD02 rejects the value length.
    """
    return bytes(6) + bytes([TWELVE_HOUR_BYTE if clock_format == FORMAT_12H else 0])


def encode_unit(unit: str) -> bytes:
    """Return the temperature unit value."""
    return bytes([FAHRENHEIT_BYTE if unit == UNIT_FAHRENHEIT else CELSIUS_BYTE])


def decode_unit(value: bytes | bytearray) -> str:
    """Return the displayed temperature unit; Celsius reads as 0xFF or 0x00 depending on the model."""
    if not value:
        raise ValueError("Empty unit value")
    return UNIT_FAHRENHEIT if value[0] == FAHRENHEIT_BYTE else UNIT_CELSIUS
