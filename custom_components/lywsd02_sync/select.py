"""Clock settings chosen from a list: sync frequency and day, temperature unit, time format."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

from homeassistant.components.select import SelectEntity, SelectEntityDescription
from homeassistant.const import EntityCategory
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from . import LYWSD02ConfigEntry
from .const import (
    CLOCK_FORMATS,
    CONF_CLOCK_FORMAT,
    CONF_SCHEDULE,
    CONF_UNIT,
    CONF_WEEKDAY,
    DEFAULT_WEEKDAY,
    SCHEDULE_CRON,
    SCHEDULE_DAILY,
    SCHEDULES,
    UNITS,
    WEEKDAYS,
)
from .entity import LYWSD02Entity
from .manager import ClockSyncManager


def _frequencies(manager: ClockSyncManager) -> list[str]:
    # A cron expression is entered with Configure; the list only shows it once it exists.
    if manager.entry.options.get(CONF_SCHEDULE) == SCHEDULE_CRON:
        return list(SCHEDULES)
    return [schedule for schedule in SCHEDULES if schedule != SCHEDULE_CRON]


@dataclass(frozen=True, kw_only=True)
class LYWSD02SelectDescription(SelectEntityDescription):
    """Select editing one option of the clock entry."""

    options_fn: Callable[[ClockSyncManager], list[str]]
    value_fn: Callable[[ClockSyncManager], str | None]


SELECTS: tuple[LYWSD02SelectDescription, ...] = (
    LYWSD02SelectDescription(
        key=CONF_SCHEDULE,
        translation_key="sync_frequency",
        options_fn=_frequencies,
        value_fn=lambda manager: manager.entry.options.get(CONF_SCHEDULE, SCHEDULE_DAILY),
    ),
    LYWSD02SelectDescription(
        key=CONF_WEEKDAY,
        translation_key="sync_weekday",
        options_fn=lambda manager: list(WEEKDAYS),
        value_fn=lambda manager: manager.entry.options.get(CONF_WEEKDAY, DEFAULT_WEEKDAY),
    ),
    LYWSD02SelectDescription(
        key=CONF_UNIT,
        translation_key="temperature_unit",
        options_fn=lambda manager: list(UNITS),
        # Until a unit is chosen here, show the one read from the clock.
        value_fn=lambda manager: manager.entry.options.get(CONF_UNIT) or manager.unit,
    ),
    LYWSD02SelectDescription(
        key=CONF_CLOCK_FORMAT,
        translation_key="clock_format",
        options_fn=lambda manager: list(CLOCK_FORMATS),
        value_fn=lambda manager: manager.entry.options.get(CONF_CLOCK_FORMAT),
    ),
)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: LYWSD02ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Add the clock settings chosen from a list."""
    async_add_entities(LYWSD02Select(entry.runtime_data, description) for description in SELECTS)


class LYWSD02Select(LYWSD02Entity, SelectEntity):
    """One setting of the clock."""

    entity_description: LYWSD02SelectDescription
    _attr_entity_category = EntityCategory.CONFIG

    def __init__(self, manager: ClockSyncManager, description: LYWSD02SelectDescription) -> None:
        """Describe the setting."""
        super().__init__(manager, description.key)
        self.entity_description = description

    @property
    def options(self) -> list[str]:
        """Return the choices."""
        return self.entity_description.options_fn(self._manager)

    @property
    def current_option(self) -> str | None:
        """Return the current choice."""
        return self.entity_description.value_fn(self._manager)

    async def async_select_option(self, option: str) -> None:
        """Save the choice; the clock receives it at once or as soon as it is reached."""
        self._manager.async_update_options(**{self.entity_description.key: option})
