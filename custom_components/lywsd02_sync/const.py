"""Constants for the LYWSD02 Clock Sync integration."""

from __future__ import annotations

from datetime import timedelta
from typing import Final

DOMAIN: Final = "lywsd02_sync"

LOCAL_NAME_PREFIX: Final = "LYWSD02"
TIME_CHARACTERISTIC: Final = "ebe0ccb7-7a0a-4b0c-8a1a-6ff2997da3a6"

CONF_SCHEDULE: Final = "schedule"
CONF_TIME: Final = "time"
CONF_WEEKDAY: Final = "weekday"
CONF_CRON: Final = "cron"

SCHEDULE_DAILY: Final = "daily"
SCHEDULE_WEEKLY: Final = "weekly"
SCHEDULE_MANUAL: Final = "manual"
SCHEDULE_CRON: Final = "cron"
SCHEDULES: Final = [SCHEDULE_DAILY, SCHEDULE_WEEKLY, SCHEDULE_MANUAL, SCHEDULE_CRON]

# Cron day-of-week numbers (Sunday is 0).
WEEKDAYS: Final = {"mon": 1, "tue": 2, "wed": 3, "thu": 4, "fri": 5, "sat": 6, "sun": 0}

DEFAULT_TIME: Final = "04:00:00"
DEFAULT_WEEKDAY: Final = "sun"
DEFAULT_OPTIONS: Final = {
    CONF_SCHEDULE: SCHEDULE_DAILY,
    CONF_TIME: DEFAULT_TIME,
    CONF_WEEKDAY: DEFAULT_WEEKDAY,
}

# Each connection costs coin-cell energy, so custom schedules may not run more often.
MIN_CRON_INTERVAL: Final = timedelta(hours=1)
RETRY_DELAYS: Final = (
    timedelta(minutes=5),
    timedelta(minutes=15),
    timedelta(minutes=30),
    timedelta(hours=1),
)
SYNC_TIMEOUT: Final = 60

STATUS_SYNCED: Final = "synced"
STATUS_WAITING: Final = "waiting"
STATUS_FAILED: Final = "failed"
STATUSES: Final = [STATUS_SYNCED, STATUS_WAITING, STATUS_FAILED]
