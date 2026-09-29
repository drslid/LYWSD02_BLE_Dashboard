"""Sensors describing the clock sync of an LYWSD02."""

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
from homeassistant.const import EntityCategory, UnitOfTime
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.typing import StateType

from . import LYWSD02ConfigEntry
from .const import STATUSES
from .entity import LYWSD02Entity
from .manager import ClockSyncManager


@dataclass(frozen=True, kw_only=True)
class LYWSD02SensorDescription(SensorEntityDescription):
    """Sensor reading one value of the clock manager."""

    value_fn: Callable[[ClockSyncManager], StateType | datetime]


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
