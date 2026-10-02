"""Clock settings entered as numbers: day of the monthly sync and time correction."""

from __future__ import annotations

from dataclasses import dataclass

from homeassistant.components.number import NumberEntity, NumberEntityDescription, NumberMode
from homeassistant.const import EntityCategory, UnitOfTime
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from . import LYWSD02ConfigEntry
from .const import CONF_CORRECTION, CONF_DAY, DEFAULT_DAY, MAX_CORRECTION, MAX_DAY
from .entity import LYWSD02Entity
from .manager import ClockSyncManager


@dataclass(frozen=True, kw_only=True)
class LYWSD02NumberDescription(NumberEntityDescription):
    """Number editing one option of the clock entry."""

    default: int


NUMBERS: tuple[LYWSD02NumberDescription, ...] = (
    LYWSD02NumberDescription(
        key=CONF_DAY,
        translation_key="sync_day",
        native_min_value=1,
        native_max_value=MAX_DAY,
        native_step=1,
        mode=NumberMode.BOX,
        default=DEFAULT_DAY,
    ),
    LYWSD02NumberDescription(
        key=CONF_CORRECTION,
        translation_key="time_correction",
        native_min_value=-MAX_CORRECTION,
        native_max_value=MAX_CORRECTION,
        native_step=1,
        native_unit_of_measurement=UnitOfTime.MINUTES,
        mode=NumberMode.BOX,
        default=0,
    ),
)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: LYWSD02ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Add the clock settings entered as numbers."""
    async_add_entities(LYWSD02Number(entry.runtime_data, description) for description in NUMBERS)


class LYWSD02Number(LYWSD02Entity, NumberEntity):
    """One numeric setting of the clock."""

    entity_description: LYWSD02NumberDescription
    _attr_entity_category = EntityCategory.CONFIG

    def __init__(self, manager: ClockSyncManager, description: LYWSD02NumberDescription) -> None:
        """Describe the setting."""
        super().__init__(manager, description.key)
        self.entity_description = description

    @property
    def native_value(self) -> int:
        """Return the saved value."""
        return int(self._manager.entry.options.get(self.entity_description.key, self.entity_description.default))

    async def async_set_native_value(self, value: float) -> None:
        """Save the value; the clock receives it at once or as soon as it is reached."""
        self._manager.async_update_options(**{self.entity_description.key: round(value)})
