"""Hourly records of a clock imported as Home Assistant long-term statistics."""

from __future__ import annotations

from collections.abc import Callable
from datetime import datetime
from typing import Any, cast

from homeassistant.components.recorder.models import StatisticData, StatisticMetaData
from homeassistant.components.recorder.statistics import async_add_external_statistics
from homeassistant.const import PERCENTAGE, UnitOfTemperature
from homeassistant.core import HomeAssistant
from homeassistant.helpers.translation import async_get_translations
from homeassistant.util import slugify
from homeassistant.util.unit_conversion import TemperatureConverter

from .const import DOMAIN
from .protocol import HourlyRecord

try:
    from homeassistant.components.recorder.models import StatisticMeanType
except ImportError:  # Home Assistant 2025.3 and older only know has_mean.
    StatisticMeanType = None  # type: ignore[assignment,misc]

# Unit, unit class and extremes of a record, by the translation key naming each statistic.
RECORD_STATISTICS: dict[str, tuple[str, str | None, Callable[[HourlyRecord], tuple[float, float]]]] = {
    "temperature_records": (
        UnitOfTemperature.CELSIUS,
        TemperatureConverter.UNIT_CLASS,
        lambda record: (record.min_temperature, record.max_temperature),
    ),
    "humidity_records": (PERCENTAGE, None, lambda record: (record.min_humidity, record.max_humidity)),
}
_METADATA_KEYS = StatisticMetaData.__required_keys__ | StatisticMetaData.__optional_keys__


def record_statistic_id(address: str, key: str) -> str:
    """Return the statistic id of a clock, such as lywsd02_sync:e7_2e_01_ab_cd_ef_temperature_records."""
    return f"{DOMAIN}:{slugify(address)}_{key}"


async def async_import_records(
    hass: HomeAssistant, address: str, name: str, hours: dict[datetime, HourlyRecord]
) -> None:
    """Add each hour's minimum and maximum; their midpoint stands for the mean the clock does not keep."""
    if not hours or "recorder" not in hass.config.components:
        return
    translations = await async_get_translations(hass, hass.config.language, "entity", {DOMAIN})
    for key, (unit, unit_class, extremes) in RECORD_STATISTICS.items():
        metadata: dict[str, Any] = {
            "has_sum": False,
            "name": f"{name} {translations.get(f'component.{DOMAIN}.entity.sensor.{key}.name', key)}",
            "source": DOMAIN,
            "statistic_id": record_statistic_id(address, key),
            "unit_of_measurement": unit,
        }
        if StatisticMeanType is None:
            metadata["has_mean"] = True
        else:
            metadata["mean_type"] = StatisticMeanType.ARITHMETIC
        if "unit_class" in _METADATA_KEYS:
            metadata["unit_class"] = unit_class
        statistics = []
        for hour, record in sorted(hours.items()):
            low, high = extremes(record)
            statistics.append(StatisticData(start=hour, min=low, max=high, mean=(low + high) / 2))
        async_add_external_statistics(hass, cast(StatisticMetaData, metadata), statistics)
