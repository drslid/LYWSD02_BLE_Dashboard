"""Add an LYWSD02 clock, then choose when it is synchronized."""

from __future__ import annotations

from typing import Any

from bluetooth_data_tools import human_readable_name
import voluptuous as vol

from homeassistant.components.bluetooth import (
    BluetoothServiceInfoBleak,
    async_discovered_service_info,
)
from homeassistant.config_entries import ConfigEntry, ConfigFlow, ConfigFlowResult, OptionsFlow
from homeassistant.const import CONF_ADDRESS
from homeassistant.core import callback
from homeassistant.helpers.selector import (
    SelectSelector,
    SelectSelectorConfig,
    SelectSelectorMode,
    TextSelector,
    TimeSelector,
)
from homeassistant.util import dt as dt_util

from .const import (
    CONF_CRON,
    CONF_SCHEDULE,
    CONF_TIME,
    CONF_WEEKDAY,
    DEFAULT_OPTIONS,
    DEFAULT_TIME,
    DEFAULT_WEEKDAY,
    DOMAIN,
    LOCAL_NAME_PREFIX,
    SCHEDULE_CRON,
    SCHEDULE_DAILY,
    SCHEDULE_WEEKLY,
    SCHEDULES,
    WEEKDAYS,
)
from .schedule import cron_error


def _title(info: BluetoothServiceInfoBleak) -> str:
    return human_readable_name(None, info.name, info.address)


class LYWSD02ConfigFlow(ConfigFlow, domain=DOMAIN):
    """Add a clock found by Home Assistant Bluetooth."""

    VERSION = 1

    def __init__(self) -> None:
        """Start without a selected clock."""
        self._discovery: BluetoothServiceInfoBleak | None = None
        self._discovered: dict[str, BluetoothServiceInfoBleak] = {}

    @staticmethod
    @callback
    def async_get_options_flow(config_entry: ConfigEntry) -> LYWSD02OptionsFlow:
        """Return the schedule options flow."""
        return LYWSD02OptionsFlow()

    async def async_step_bluetooth(
        self, discovery_info: BluetoothServiceInfoBleak
    ) -> ConfigFlowResult:
        """Offer a discovered clock."""
        await self.async_set_unique_id(discovery_info.address)
        self._abort_if_unique_id_configured()
        self._discovery = discovery_info
        self.context["title_placeholders"] = {"name": _title(discovery_info)}
        return await self.async_step_bluetooth_confirm()

    async def async_step_bluetooth_confirm(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Confirm the discovered clock."""
        assert self._discovery is not None
        if user_input is not None:
            return self._async_create(self._discovery)
        self._set_confirm_only()
        return self.async_show_form(
            step_id="bluetooth_confirm",
            description_placeholders={"name": _title(self._discovery)},
        )

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Pick one of the clocks currently in range."""
        if user_input is not None:
            info = self._discovered[user_input[CONF_ADDRESS]]
            await self.async_set_unique_id(info.address, raise_on_progress=False)
            self._abort_if_unique_id_configured()
            return self._async_create(info)

        configured = self._async_current_ids(include_ignore=False)
        for info in async_discovered_service_info(self.hass, connectable=True):
            if info.address not in configured and info.name.startswith(LOCAL_NAME_PREFIX):
                self._discovered[info.address] = info
        if not self._discovered:
            return self.async_abort(reason="no_devices_found")
        return self.async_show_form(
            step_id="user",
            data_schema=vol.Schema(
                {
                    vol.Required(CONF_ADDRESS): vol.In(
                        {address: _title(info) for address, info in self._discovered.items()}
                    )
                }
            ),
        )

    @callback
    def _async_create(self, info: BluetoothServiceInfoBleak) -> ConfigFlowResult:
        return self.async_create_entry(
            title=_title(info),
            data={CONF_ADDRESS: info.address},
            options=dict(DEFAULT_OPTIONS),
        )


class LYWSD02OptionsFlow(OptionsFlow):
    """Choose a frequency first, then only the settings it needs."""

    def __init__(self) -> None:
        """Start from the saved options."""
        self._options: dict[str, Any] = {}

    async def async_step_init(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        """Choose how often the clock is synchronized."""
        if user_input is not None:
            self._options = {**self.config_entry.options, **user_input}
            schedule = user_input[CONF_SCHEDULE]
            if schedule == SCHEDULE_DAILY:
                return await self.async_step_daily()
            if schedule == SCHEDULE_WEEKLY:
                return await self.async_step_weekly()
            if schedule == SCHEDULE_CRON:
                return await self.async_step_cron()
            return self.async_create_entry(data=self._options)

        current = self.config_entry.options.get(CONF_SCHEDULE, SCHEDULE_DAILY)
        return self.async_show_form(
            step_id="init",
            data_schema=vol.Schema(
                {
                    vol.Required(CONF_SCHEDULE, default=current): SelectSelector(
                        SelectSelectorConfig(
                            options=SCHEDULES,
                            translation_key=CONF_SCHEDULE,
                            mode=SelectSelectorMode.LIST,
                        )
                    )
                }
            ),
        )

    async def async_step_daily(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        """Choose the time of the daily sync."""
        if user_input is not None:
            return self.async_create_entry(data={**self._options, **user_input})
        return self.async_show_form(
            step_id="daily",
            data_schema=vol.Schema({vol.Required(CONF_TIME, default=self._time()): TimeSelector()}),
        )

    async def async_step_weekly(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        """Choose the day and time of the weekly sync."""
        if user_input is not None:
            return self.async_create_entry(data={**self._options, **user_input})
        return self.async_show_form(
            step_id="weekly",
            data_schema=vol.Schema(
                {
                    vol.Required(
                        CONF_WEEKDAY, default=self._options.get(CONF_WEEKDAY, DEFAULT_WEEKDAY)
                    ): SelectSelector(
                        SelectSelectorConfig(options=list(WEEKDAYS), translation_key=CONF_WEEKDAY)
                    ),
                    vol.Required(CONF_TIME, default=self._time()): TimeSelector(),
                }
            ),
        )

    async def async_step_cron(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        """Enter a cron expression."""
        errors: dict[str, str] = {}
        if user_input is not None:
            expression = user_input[CONF_CRON].strip()
            if error := cron_error(expression, dt_util.now()):
                errors[CONF_CRON] = error
            else:
                return self.async_create_entry(data={**self._options, CONF_CRON: expression})
        return self.async_show_form(
            step_id="cron",
            data_schema=vol.Schema(
                {vol.Required(CONF_CRON, default=self._options.get(CONF_CRON, "0 4 * * *")): TextSelector()}
            ),
            errors=errors,
        )

    def _time(self) -> str:
        return self._options.get(CONF_TIME, DEFAULT_TIME)
