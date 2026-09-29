"""Base entity of an LYWSD02 clock."""

from __future__ import annotations

from homeassistant.helpers.device_registry import CONNECTION_BLUETOOTH, DeviceInfo
from homeassistant.helpers.entity import Entity

from .manager import ClockSyncManager


class LYWSD02Entity(Entity):
    """Entity refreshed by its clock manager."""

    _attr_has_entity_name = True
    _attr_should_poll = False

    def __init__(self, manager: ClockSyncManager, key: str) -> None:
        """Attach the entity to the clock device."""
        self._manager = manager
        self._attr_unique_id = f"{manager.address}_{key}"
        self._attr_device_info = DeviceInfo(
            connections={(CONNECTION_BLUETOOTH, manager.address)},
            name=manager.name,
            manufacturer="Xiaomi",
            model="LYWSD02",
        )

    async def async_added_to_hass(self) -> None:
        """Follow sync state changes."""
        self.async_on_remove(self._manager.async_add_listener(self.async_write_ha_state))
