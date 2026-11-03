"""Versioned sync snapshots, including records awaiting a statistics import."""

from __future__ import annotations

from dataclasses import astuple
from datetime import datetime
from typing import TYPE_CHECKING, Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

from .const import DOMAIN, STATUS_SYNCED
from .protocol import HourlyRecord

if TYPE_CHECKING:
    from .manager import ClockSyncManager

STORAGE_VERSION = 1


def _store(hass: HomeAssistant, entry_id: str) -> Store[dict[str, Any]]:
    return Store(hass, STORAGE_VERSION, f"{DOMAIN}.{entry_id}")


async def async_remove_storage(hass: HomeAssistant, entry_id: str) -> None:
    """Remove the snapshot when a clock is deleted."""
    await _store(hass, entry_id).async_remove()


def _records(values: list[list[Any]]) -> dict[datetime, HourlyRecord]:
    return {
        datetime.fromisoformat(hour): HourlyRecord(*record) for hour, *record in values
    }


def _serialize(records: dict[datetime, HourlyRecord]) -> list[list[Any]]:
    return [[hour.isoformat(), *astuple(record)] for hour, record in records.items()]


class ClockSyncStorage:
    """Keep the existing storage key and accept snapshots from earlier releases."""

    def __init__(self, hass: HomeAssistant, entry_id: str) -> None:
        self._store = _store(hass, entry_id)

    async def async_restore(self, manager: ClockSyncManager) -> None:
        if not (stored := await self._store.async_load()):
            return
        manager.last_sync = (
            dt_util.parse_datetime(stored["last_sync"])
            if stored.get("last_sync")
            else None
        )
        for name in (
            "drift",
            "unit",
            "battery",
            "temperature",
            "humidity",
            "clock_verified",
        ):
            setattr(manager, name, stored.get(name))
        if clock_time := stored.get("clock_time"):
            manager.clock_time = dt_util.parse_datetime(clock_time)
        manager.recent = _records(stored.get("recent", []))
        manager._pending_records = _records(stored.get("pending_records", []))
        manager._next_record = stored.get("next_record", 0)
        manager._synced_offset = stored.get("offset")
        manager._applied = stored.get("applied")
        if manager.last_sync is not None:
            manager.status = STATUS_SYNCED

    async def async_save_state(self, manager: ClockSyncManager) -> None:
        await self._store.async_save(
            {
                "last_sync": manager.last_sync.isoformat()
                if manager.last_sync
                else None,
                "drift": manager.drift,
                "offset": manager._synced_offset,
                "unit": manager.unit,
                "applied": manager._applied,
                "clock_time": manager.clock_time.isoformat()
                if manager.clock_time
                else None,
                "battery": manager.battery,
                "temperature": manager.temperature,
                "humidity": manager.humidity,
                "recent": _serialize(manager.recent),
                "pending_records": _serialize(manager._pending_records),
                "next_record": manager._next_record,
                "clock_verified": manager.clock_verified,
            }
        )
