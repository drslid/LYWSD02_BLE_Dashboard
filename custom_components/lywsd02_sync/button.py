"""Button that sets an LYWSD02 clock right away."""

from __future__ import annotations

from homeassistant.components.button import ButtonEntity
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from . import LYWSD02ConfigEntry
from .entity import LYWSD02Entity


async def async_setup_entry(
    hass: HomeAssistant,
    entry: LYWSD02ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Add the sync button."""
    async_add_entities([SyncClockButton(entry.runtime_data, "sync_clock")])


class SyncClockButton(LYWSD02Entity, ButtonEntity):
    """Write the Home Assistant time to the clock."""

    _attr_translation_key = "sync_clock"

    async def async_press(self) -> None:
        """Sync now, searching for the clock and reconnecting if needed; report failures in the interface."""
        await self._manager.async_sync(force=True)
