"""Adding a clock and choosing its schedule."""

from __future__ import annotations

from unittest.mock import patch

import pytest

from homeassistant.config_entries import SOURCE_BLUETOOTH, SOURCE_USER
from homeassistant.const import CONF_ADDRESS
from homeassistant.core import HomeAssistant
from homeassistant.data_entry_flow import FlowResultType
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.lywsd02_sync.const import DEFAULT_OPTIONS, DOMAIN

from .conftest import ADDRESS, TITLE, service_info

SETUP = "custom_components.lywsd02_sync.async_setup_entry"
DISCOVERED = "custom_components.lywsd02_sync.config_flow.async_discovered_service_info"


async def test_bluetooth_discovery_needs_one_confirmation(hass: HomeAssistant) -> None:
    """A discovered clock is added with the recommended daily schedule."""
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": SOURCE_BLUETOOTH}, data=service_info()
    )
    assert result["type"] is FlowResultType.FORM
    assert result["step_id"] == "bluetooth_confirm"
    assert result["description_placeholders"] == {"name": TITLE}

    with patch(SETUP, return_value=True):
        result = await hass.config_entries.flow.async_configure(result["flow_id"], {})
    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert result["title"] == TITLE
    assert result["data"] == {CONF_ADDRESS: ADDRESS}
    assert result["options"] == DEFAULT_OPTIONS
    assert result["result"].unique_id == ADDRESS


async def test_bluetooth_discovery_ignores_configured_clock(hass: HomeAssistant) -> None:
    """The same clock cannot be added twice."""
    MockConfigEntry(domain=DOMAIN, unique_id=ADDRESS, data={CONF_ADDRESS: ADDRESS}).add_to_hass(hass)
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": SOURCE_BLUETOOTH}, data=service_info()
    )
    assert result["type"] is FlowResultType.ABORT
    assert result["reason"] == "already_configured"


async def test_user_picks_among_clocks_in_range(hass: HomeAssistant) -> None:
    """Only new LYWSD02 clocks are offered."""
    configured = "E7:2E:01:00:00:01"
    MockConfigEntry(domain=DOMAIN, unique_id=configured, data={CONF_ADDRESS: configured}).add_to_hass(hass)
    nearby = [service_info(), service_info(configured), service_info("AA:BB:CC:DD:EE:FF", "Other")]
    with patch(DISCOVERED, return_value=nearby):
        result = await hass.config_entries.flow.async_init(DOMAIN, context={"source": SOURCE_USER})
    assert result["type"] is FlowResultType.FORM
    assert result["step_id"] == "user"
    assert list(result["data_schema"].schema[CONF_ADDRESS].container) == [ADDRESS]

    with patch(SETUP, return_value=True):
        result = await hass.config_entries.flow.async_configure(result["flow_id"], {CONF_ADDRESS: ADDRESS})
    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert result["title"] == TITLE


async def test_user_flow_without_clock_explains_how_to_fix(hass: HomeAssistant) -> None:
    """No clock in range aborts with a helpful reason."""
    with patch(DISCOVERED, return_value=[]):
        result = await hass.config_entries.flow.async_init(DOMAIN, context={"source": SOURCE_USER})
    assert result["type"] is FlowResultType.ABORT
    assert result["reason"] == "no_devices_found"


@pytest.fixture
async def entry(hass: HomeAssistant) -> MockConfigEntry:
    """Return a clock entry that is not set up."""
    config_entry = MockConfigEntry(
        domain=DOMAIN, unique_id=ADDRESS, title=TITLE, data={CONF_ADDRESS: ADDRESS}, options=DEFAULT_OPTIONS
    )
    config_entry.add_to_hass(hass)
    return config_entry


@pytest.mark.parametrize(
    ("schedule", "step", "user_input", "expected"),
    [
        ("daily", "daily", {"time": "05:30:00"}, {"schedule": "daily", "time": "05:30:00", "weekday": "sun"}),
        (
            "weekly",
            "weekly",
            {"weekday": "mon", "time": "03:15:00"},
            {"schedule": "weekly", "time": "03:15:00", "weekday": "mon"},
        ),
        (
            "monthly",
            "monthly",
            {"day": 15.0, "time": "02:45:00"},
            {"schedule": "monthly", "time": "02:45:00", "weekday": "sun", "day": 15},
        ),
        (
            "cron",
            "cron",
            {"cron": " 0 */6 * * * "},
            {"schedule": "cron", "time": "04:00:00", "weekday": "sun", "cron": "0 */6 * * *"},
        ),
    ],
)
async def test_options_ask_only_for_the_chosen_frequency(
    hass: HomeAssistant,
    entry: MockConfigEntry,
    schedule: str,
    step: str,
    user_input: dict[str, str],
    expected: dict[str, str],
) -> None:
    """Each frequency shows its own short form."""
    result = await hass.config_entries.options.async_init(entry.entry_id)
    assert result["step_id"] == "init"
    result = await hass.config_entries.options.async_configure(result["flow_id"], {"schedule": schedule})
    assert result["type"] is FlowResultType.FORM
    assert result["step_id"] == step
    assert set(result["data_schema"].schema) == set(user_input)

    result = await hass.config_entries.options.async_configure(result["flow_id"], user_input)
    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert entry.options == expected


async def test_manual_schedule_needs_no_other_setting(hass: HomeAssistant, entry: MockConfigEntry) -> None:
    """Choosing no schedule saves immediately."""
    result = await hass.config_entries.options.async_init(entry.entry_id)
    result = await hass.config_entries.options.async_configure(result["flow_id"], {"schedule": "manual"})
    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert entry.options["schedule"] == "manual"


async def test_options_keep_settings_changed_on_the_device_page(
    hass: HomeAssistant, entry: MockConfigEntry
) -> None:
    """A setting saved by an entity while the form is open is kept."""
    result = await hass.config_entries.options.async_init(entry.entry_id)
    result = await hass.config_entries.options.async_configure(result["flow_id"], {"schedule": "daily"})
    hass.config_entries.async_update_entry(entry, options={**entry.options, "temperature_unit": "fahrenheit"})

    result = await hass.config_entries.options.async_configure(result["flow_id"], {"time": "05:00:00"})
    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert entry.options == {**DEFAULT_OPTIONS, "time": "05:00:00", "temperature_unit": "fahrenheit"}


@pytest.mark.parametrize(("expression", "error"), [("every day", "invalid_cron"), ("*/10 * * * *", "too_frequent")])
async def test_cron_step_rejects_bad_expressions(
    hass: HomeAssistant, entry: MockConfigEntry, expression: str, error: str
) -> None:
    """Invalid or too frequent cron expressions stay on the form."""
    result = await hass.config_entries.options.async_init(entry.entry_id)
    result = await hass.config_entries.options.async_configure(result["flow_id"], {"schedule": "cron"})
    result = await hass.config_entries.options.async_configure(result["flow_id"], {"cron": expression})
    assert result["type"] is FlowResultType.FORM
    assert result["errors"] == {"cron": error}
    assert entry.options == DEFAULT_OPTIONS
