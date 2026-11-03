"""Downloadable sync and routing diagnostics without pairing credentials."""

from __future__ import annotations

from typing import Any

from homeassistant.components.diagnostics import async_redact_data
from homeassistant.const import CONF_ADDRESS
from homeassistant.core import HomeAssistant

from . import LYWSD02ConfigEntry
from .const import CONF_PAIRING_TOKEN


async def async_get_config_entry_diagnostics(
    hass: HomeAssistant, entry: LYWSD02ConfigEntry
) -> dict[str, Any]:
    """Keep the protocol/settings and current routing state, hiding credentials."""
    return {
        "entry": async_redact_data(
            entry.as_dict(), {CONF_PAIRING_TOKEN, CONF_ADDRESS, "unique_id"}
        ),
        "sync": entry.runtime_data.sync_diagnostics,
    }
