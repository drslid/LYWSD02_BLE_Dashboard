"""Sensors of an LYWSD02: its sync and what it measured."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime

from homeassistant.components.sensor import (
    SensorDeviceClass,
    SensorEntity,
    SensorEntityDescription,
    SensorStateClass,
)
from homeassistant.const import PERCENTAGE, EntityCategory, UnitOfTemperature, UnitOfTime
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.typing import StateType

from . import LYWSD02ConfigEntry
from .const import STATUSES
from .entity import LYWSD02Entity
from .manager import ClockSyncManager
from .protocol import HourlyRecord


@dataclass(frozen=True, kw_only=True)
class LYWSD02SensorDescription(SensorEntityDescription):
    """Sensor reading one value of the clock manager."""

    value_fn: Callable[[ClockSyncManager], StateType | datetime]


def _extreme(
    pick: Callable[..., float], value_fn: Callable[[HourlyRecord], float]
) -> Callable[[ClockSyncManager], float | None]:
    """Return the lowest or highest value of the hourly records of the last 24 hours."""
    return lambda manager: pick((value_fn(record) for record in manager.recent.values()), default=None)


SENSORS: tuple[LYWSD02SensorDescription, ...] = (
    LYWSD02SensorDescription(
        key="last_sync",
        translation_key="last_sync",
        device_class=SensorDeviceClass.TIMESTAMP,
        value_fn=lambda manager: manager.last_sync,
    ),
    LYWSD02SensorDescription(
        key="next_sync",
        translation_key="next_sync",
        device_class=SensorDeviceClass.TIMESTAMP,
        value_fn=lambda manager: manager.next_sync,
    ),
    LYWSD02SensorDescription(
        key="sync_status",
        translation_key="sync_status",
        device_class=SensorDeviceClass.ENUM,
        options=STATUSES,
        value_fn=lambda manager: manager.status,
    ),
    LYWSD02SensorDescription(
        key="clock_drift",
        translation_key="clock_drift",
        native_unit_of_measurement=UnitOfTime.SECONDS,
        state_class=SensorStateClass.MEASUREMENT,
        suggested_display_precision=0,
        entity_category=EntityCategory.DIAGNOSTIC,
        value_fn=lambda manager: manager.drift,
    ),
    LYWSD02SensorDescription(
        key="clock_time",
        translation_key="clock_time",
        device_class=SensorDeviceClass.TIMESTAMP,
        entity_category=EntityCategory.DIAGNOSTIC,
        value_fn=lambda manager: manager.clock_time,
    ),
    LYWSD02SensorDescription(
        key="temperature",
        device_class=SensorDeviceClass.TEMPERATURE,
        native_unit_of_measurement=UnitOfTemperature.CELSIUS,
        state_class=SensorStateClass.MEASUREMENT,
        suggested_display_precision=1,
        value_fn=lambda manager: manager.temperature,
    ),
    LYWSD02SensorDescription(
        key="humidity",
        device_class=SensorDeviceClass.HUMIDITY,
        native_unit_of_measurement=PERCENTAGE,
        state_class=SensorStateClass.MEASUREMENT,
        value_fn=lambda manager: manager.humidity,
    ),
    LYWSD02SensorDescription(
        key="battery",
        device_class=SensorDeviceClass.BATTERY,
        native_unit_of_measurement=PERCENTAGE,
        state_class=SensorStateClass.MEASUREMENT,
        entity_category=EntityCategory.DIAGNOSTIC,
        value_fn=lambda manager: manager.battery,
    ),
    *(
        LYWSD02SensorDescription(
            key=key,
            translation_key=key,
            device_class=SensorDeviceClass.TEMPERATURE,
            native_unit_of_measurement=UnitOfTemperature.CELSIUS,
            state_class=SensorStateClass.MEASUREMENT,
            suggested_display_precision=1,
            value_fn=_extreme(pick, value_fn),
        )
        for key, pick, value_fn in (
            ("temperature_min_24h", min, lambda record: record.min_temperature),
            ("temperature_max_24h", max, lambda record: record.max_temperature),
        )
    ),
    *(
        LYWSD02SensorDescription(
            key=key,
            translation_key=key,
            device_class=SensorDeviceClass.HUMIDITY,
            native_unit_of_measurement=PERCENTAGE,
            state_class=SensorStateClass.MEASUREMENT,
            value_fn=_extreme(pick, value_fn),
        )
        for key, pick, value_fn in (
            ("humidity_min_24h", min, lambda record: record.min_humidity),
            ("humidity_max_24h", max, lambda record: record.max_humidity),
        )
    ),
)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: LYWSD02ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Add the sync sensors."""
    async_add_entities(LYWSD02Sensor(entry.runtime_data, description) for description in SENSORS)


class LYWSD02Sensor(LYWSD02Entity, SensorEntity):
    """Sync information of one clock."""

    entity_description: LYWSD02SensorDescription

    def __init__(self, manager: ClockSyncManager, description: LYWSD02SensorDescription) -> None:
        """Describe the sensor."""
        super().__init__(manager, description.key)
        self.entity_description = description

    @property
    def native_value(self) -> StateType | datetime:
        """Return the current value."""
        return self.entity_description.value_fn(self._manager)
