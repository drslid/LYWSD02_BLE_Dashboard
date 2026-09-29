"""Friendly schedules and cron validation."""

from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo

import pytest

from custom_components.lywsd02_sync.schedule import cron_error, cron_expression, next_run, previous_run

PARIS = ZoneInfo("Europe/Paris")


@pytest.mark.parametrize(
    ("options", "expected"),
    [
        ({}, "0 4 * * *"),
        ({"schedule": "daily", "time": "05:30:00"}, "30 5 * * *"),
        ({"schedule": "weekly", "weekday": "mon", "time": "03:15:00"}, "15 3 * * 1"),
        ({"schedule": "weekly", "weekday": "sun", "time": "04:00:00"}, "0 4 * * 0"),
        ({"schedule": "cron", "cron": " 0 */6 * * * "}, "0 */6 * * *"),
        ({"schedule": "manual", "time": "04:00:00"}, None),
    ],
)
def test_cron_expression(options: dict[str, str], expected: str | None) -> None:
    """Presets become cron expressions; manual has none."""
    assert cron_expression(options) == expected


@pytest.mark.parametrize(
    ("expression", "error"),
    [
        ("0 4 * * *", None),
        ("0 * * * *", None),
        ("*/30 * * * *", "too_frequent"),
        ("0,30 4 * * *", "too_frequent"),
        ("0 4 * *", "invalid_cron"),
        ("0 0 30 2 *", "invalid_cron"),
        ("every day", "invalid_cron"),
    ],
)
def test_cron_error(expression: str, error: str | None) -> None:
    """Invalid or battery-hungry expressions are refused."""
    assert cron_error(expression, datetime(2026, 9, 29, 12, tzinfo=PARIS)) == error


def test_daily_run_follows_local_time_across_daylight_saving() -> None:
    """04:00 stays 04:00 on the wall clock when Europe falls back."""
    before = datetime(2026, 10, 24, 12, tzinfo=PARIS)
    first = next_run("0 4 * * *", before)
    assert first.isoformat() == "2026-10-25T04:00:00+01:00"
    assert next_run("0 4 * * *", first).isoformat() == "2026-10-26T04:00:00+01:00"
    assert previous_run("0 4 * * *", before).isoformat() == "2026-10-24T04:00:00+02:00"
