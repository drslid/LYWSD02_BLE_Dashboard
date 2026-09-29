"""Keep Xiaomi LYWSD02 clocks on time from Home Assistant."""

from __future__ import annotations

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import CONF_ADDRESS, Platform
from homeassistant.core import HomeAssistant

from .manager import ClockSyncManager, async_remove_storage

PLATFORMS: list[Platform] = [Platform.BUTTON, Platform.SENSOR]

type LYWSD02ConfigEntry = ConfigEntry[ClockSyncManager]


async def async_setup_entry(hass: HomeAssistant, entry: LYWSD02ConfigEntry) -> bool:
    """Set up one LYWSD02 clock."""
    manager = ClockSyncManager(hass, entry, entry.data[CONF_ADDRESS])
    await manager.async_start()
    entry.runtime_data = manager
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    entry.async_on_unload(entry.add_update_listener(_async_options_updated))
    return True


async def _async_options_updated(hass: HomeAssistant, entry: LYWSD02ConfigEntry) -> None:
    await hass.config_entries.async_reload(entry.entry_id)


async def async_unload_entry(hass: HomeAssistant, entry: LYWSD02ConfigEntry) -> bool:
    """Unload a config entry."""
    return await hass.config_entries.async_unload_platforms(entry, PLATFORMS)


async def async_remove_entry(hass: HomeAssistant, entry: LYWSD02ConfigEntry) -> None:
    """Forget the sync history of a removed clock."""
    await async_remove_storage(hass, entry.entry_id)
