"""Time of day of the automatic sync."""

from __future__ import annotations

from datetime import time

from homeassistant.components.time import TimeEntity
from homeassistant.const import EntityCategory
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.util import dt as dt_util

from . import LYWSD02ConfigEntry
from .const import CONF_TIME, DEFAULT_TIME
from .entity import LYWSD02Entity


async def async_setup_entry(
    hass: HomeAssistant,
    entry: LYWSD02ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Add the sync time."""
    async_add_entities([SyncTime(entry.runtime_data, CONF_TIME)])


class SyncTime(LYWSD02Entity, TimeEntity):
    """Time of the daily, weekly or monthly sync."""

    _attr_entity_category = EntityCategory.CONFIG
    _attr_translation_key = "sync_time"

    @property
    def native_value(self) -> time | None:
        """Return the saved time."""
        return dt_util.parse_time(self._manager.entry.options.get(CONF_TIME, DEFAULT_TIME))

    async def async_set_value(self, value: time) -> None:
        """Save the time and plan the next sync."""
        self._manager.async_update_options(**{CONF_TIME: value.strftime("%H:%M:%S")})
