"""Constants for the LYWSD02 Clock Sync integration."""

from __future__ import annotations

from datetime import timedelta
from typing import Final

DOMAIN: Final = "lywsd02_sync"

LOCAL_NAME_PREFIX: Final = "LYWSD02"
TIME_CHARACTERISTIC: Final = "ebe0ccb7-7a0a-4b0c-8a1a-6ff2997da3a6"
UNIT_CHARACTERISTIC: Final = "ebe0ccbe-7a0a-4b0c-8a1a-6ff2997da3a6"
MEASUREMENT_CHARACTERISTIC: Final = "ebe0ccc1-7a0a-4b0c-8a1a-6ff2997da3a6"
BATTERY_CHARACTERISTIC: Final = "ebe0ccc4-7a0a-4b0c-8a1a-6ff2997da3a6"
RECORD_COUNT_CHARACTERISTIC: Final = "ebe0ccb9-7a0a-4b0c-8a1a-6ff2997da3a6"
RECORD_INDEX_CHARACTERISTIC: Final = "ebe0ccba-7a0a-4b0c-8a1a-6ff2997da3a6"
RECORDS_CHARACTERISTIC: Final = "ebe0ccbc-7a0a-4b0c-8a1a-6ff2997da3a6"

CONF_SCHEDULE: Final = "schedule"
CONF_TIME: Final = "time"
CONF_WEEKDAY: Final = "weekday"
CONF_DAY: Final = "day"
CONF_CRON: Final = "cron"
CONF_UNIT: Final = "temperature_unit"
CONF_CLOCK_FORMAT: Final = "clock_format"
CONF_CORRECTION: Final = "time_correction"

SCHEDULE_DAILY: Final = "daily"
SCHEDULE_WEEKLY: Final = "weekly"
SCHEDULE_MONTHLY: Final = "monthly"
SCHEDULE_MANUAL: Final = "manual"
SCHEDULE_CRON: Final = "cron"
SCHEDULES: Final = [SCHEDULE_DAILY, SCHEDULE_WEEKLY, SCHEDULE_MONTHLY, SCHEDULE_MANUAL, SCHEDULE_CRON]

# Cron day-of-week numbers (Sunday is 0).
WEEKDAYS: Final = {"mon": 1, "tue": 2, "wed": 3, "thu": 4, "fri": 5, "sat": 6, "sun": 0}
# Every month has these days.
MAX_DAY: Final = 28

UNIT_CELSIUS: Final = "celsius"
UNIT_FAHRENHEIT: Final = "fahrenheit"
UNITS: Final = [UNIT_CELSIUS, UNIT_FAHRENHEIT]
FORMAT_24H: Final = "24h"
FORMAT_12H: Final = "12h"
CLOCK_FORMATS: Final = [FORMAT_24H, FORMAT_12H]
# Same range as the one-time correction of the web dashboard.
MAX_CORRECTION: Final = 120

DEFAULT_TIME: Final = "04:00:00"
DEFAULT_WEEKDAY: Final = "sun"
DEFAULT_DAY: Final = 1
DEFAULT_OPTIONS: Final = {
    CONF_SCHEDULE: SCHEDULE_DAILY,
    CONF_TIME: DEFAULT_TIME,
    CONF_WEEKDAY: DEFAULT_WEEKDAY,
}

# Each connection costs coin-cell energy, so custom schedules may not run more often.
MIN_CRON_INTERVAL: Final = timedelta(hours=1)
# Looking the clock up costs no radio time; connecting does, so failures back off.
SEARCH_INTERVAL: Final = timedelta(minutes=1)
RETRY_DELAYS: Final = (
    timedelta(minutes=5),
    timedelta(minutes=15),
    timedelta(minutes=30),
    timedelta(hours=1),
)
# Proxies can take a few minutes to report the clock after Home Assistant starts.
REPORT_MISSING_AFTER: Final = timedelta(minutes=5)
SYNC_TIMEOUT: Final = 60
# The sync button searches for the clock and reconnects for this long (seconds) before giving up.
FORCE_TIMEOUT: Final = 60
# Pauses (seconds) of the sync button before reconnecting after a failed or dropped connection.
FORCE_RECONNECT_DELAYS: Final = (2, 5, 10)
# How often (seconds) the sync button looks the clock up while searching for it.
FORCE_POLL_INTERVAL: Final = 1
# Reading the clock after its time is set may take this long (seconds), a week of records included.
READINGS_TIMEOUT: Final = 60
# Once notifications are on, the clock sends a measurement every few seconds.
MEASUREMENT_TIMEOUT: Final = 10
# The clock is done sending records when it stays silent this long (seconds).
RECORD_IDLE_TIMEOUT: Final = 5
# Hourly records read per connection at most: one week.
MAX_RECORDS: Final = 168

STATUS_SYNCED: Final = "synced"
STATUS_WAITING: Final = "waiting"
STATUS_FAILED: Final = "failed"
STATUSES: Final = [STATUS_SYNCED, STATUS_WAITING, STATUS_FAILED]

# Why no Bluetooth adapter can reach a clock that is heard.
ISSUE_NO_CONNECTABLE_ADAPTER: Final = "no_connectable_adapter"
ISSUE_PASSIVE_ONLY: Final = "passive_only"
