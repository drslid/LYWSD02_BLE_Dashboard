"""Values of the Xiaomi LYWSD02 characteristics."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
import math
import struct

from .const import FORMAT_12H, UNIT_CELSIUS, UNIT_FAHRENHEIT

FAHRENHEIT_BYTE = 0x01
CELSIUS_BYTE = 0xFF
TWELVE_HOUR_BYTE = 0xAA


@dataclass(frozen=True, slots=True)
class HourlyRecord:
    """Extremes of one hour kept by the clock, stamped with the clock's own Unix time."""

    index: int
    timestamp: int
    max_temperature: float
    max_humidity: int
    min_temperature: float
    min_humidity: int


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


def clock_offset(value: bytes | bytearray, now: datetime) -> float:
    """Return how many seconds the Unix time kept by the clock runs ahead of now.

    Hourly records carry that time: corrections, fractional zones and drift all shift it.
    """
    if len(value) < 4:
        raise ValueError("Incomplete time value")
    return struct.unpack_from("<I", value)[0] - now.timestamp()


def decode_measurement(value: bytes | bytearray) -> tuple[float, int]:
    """Return the temperature in °C and the relative humidity in %; the display unit does not apply."""
    if len(value) < 3:
        raise ValueError("Incomplete measurement")
    temperature, humidity = struct.unpack_from("<hB", value)
    return temperature / 100, humidity


def decode_battery(value: bytes | bytearray) -> int:
    """Return the battery level in %."""
    if not value:
        raise ValueError("Empty battery value")
    return value[0]


def decode_record_count(value: bytes | bytearray) -> tuple[int, int]:
    """Return the index of the newest hourly record and how many records the clock keeps."""
    if len(value) < 8:
        raise ValueError("Incomplete record count")
    newest, stored = struct.unpack_from("<II", value)
    return newest, stored


def encode_record_index(index: int) -> bytes:
    """Return the value that makes the clock send its records from this index on."""
    return struct.pack("<I", index)


def decode_record(value: bytes | bytearray) -> HourlyRecord:
    """Return one hourly record: index, clock time, then maximum and minimum values."""
    if len(value) < 14:
        raise ValueError("Incomplete hourly record")
    index, timestamp, max_temperature, max_humidity, min_temperature, min_humidity = struct.unpack_from(
        "<IIhBhB", value
    )
    return HourlyRecord(
        index, timestamp, max_temperature / 100, max_humidity, min_temperature / 100, min_humidity
    )


def record_hour(record: HourlyRecord, offset: float) -> datetime:
    """Return the UTC hour a record covers, from the clock offset measured when it was read.

    The clock stamps each completed hour with its start. Rounding absorbs drift; the hours of
    zones such as UTC+05:30 do not match UTC hours and round up.
    """
    return datetime.fromtimestamp(math.floor((record.timestamp - offset) / 3600 + 0.5) * 3600, UTC)


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
