"""Live Bluetooth routes and bounded active discovery through Home Assistant."""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Callable
from datetime import datetime
from typing import Any

from bleak.backends.device import BLEDevice
from homeassistant.components import bluetooth
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.util import dt as dt_util

from .const import (
    BACKGROUND_SCAN_DURATION,
    BACKGROUND_SCAN_INTERVAL,
    CLEANUP_TIMEOUT,
    DOMAIN,
    FORCE_POLL_INTERVAL,
)

_LOGGER = logging.getLogger(__name__)


def _can_connect(route: Any) -> bool:
    if not route.scanner.connectable:
        return False
    connector = getattr(route.scanner, "connector", None)
    return connector is None or connector.can_connect()


class ClockDiscovery:
    """Look up current scanner routes instead of trusting advertisement history."""

    def __init__(
        self,
        hass: HomeAssistant,
        entry: ConfigEntry,
        address: str,
        stopped: Callable[[], bool],
    ) -> None:
        self.hass = hass
        self.entry = entry
        self.address = address
        self.stopped = stopped
        self._scan_task: asyncio.Task[None] | None = None
        self._last_scan: datetime | None = None

    def reachable_device(self) -> BLEDevice | None:
        routes = bluetooth.async_scanner_devices_by_address(
            self.hass, self.address, connectable=True
        )
        if not routes:
            return None
        # A busy proxy may still advertise the strongest RSSI. Prefer a route
        # with a connection slot; HA's client performs the final backend selection.
        candidates = [route for route in routes if _can_connect(route)] or routes
        preferred = bluetooth.async_ble_device_from_address(
            self.hass, self.address, connectable=True
        )
        if any(route.ble_device is preferred for route in candidates):
            return preferred
        return max(candidates, key=lambda route: route.advertisement.rssi).ble_device

    async def _async_scan(self, duration: float) -> None:
        if request := getattr(bluetooth, "async_request_active_scan", None):
            try:
                async with asyncio.timeout(duration + CLEANUP_TIMEOUT):
                    await request(self.hass, duration)
            except Exception as err:
                _LOGGER.debug(
                    "Active discovery unavailable for %s: %s", self.address, err
                )

    async def async_search(self, deadline: float) -> bool:
        loop = self.hass.loop
        if (
            loop.time() >= deadline
            or self.stopped()
            or not bluetooth.async_scanner_count(self.hass, connectable=True)
        ):
            return False
        scan = self.entry.async_create_background_task(
            self.hass,
            self._async_scan(deadline - loop.time()),
            f"{DOMAIN} search {self.address}",
        )
        try:
            while self.reachable_device() is None:
                remaining = deadline - loop.time()
                if remaining <= 0 or self.stopped():
                    return False
                await asyncio.sleep(min(remaining, FORCE_POLL_INTERVAL))
            return not self.stopped()
        finally:
            scan.cancel()

    def request_scan(self) -> None:
        now = dt_util.utcnow()
        if (
            self.stopped()
            or not hasattr(bluetooth, "async_request_active_scan")
            or not bluetooth.async_scanner_count(self.hass, connectable=True)
            or (self._scan_task is not None and not self._scan_task.done())
            or (
                self._last_scan is not None
                and now - self._last_scan < BACKGROUND_SCAN_INTERVAL
            )
        ):
            return
        self._last_scan = now
        self._scan_task = self.entry.async_create_background_task(
            self.hass,
            self._async_scan(BACKGROUND_SCAN_DURATION),
            f"{DOMAIN} discovery {self.address}",
        )

    def stop(self) -> None:
        if self._scan_task is not None:
            self._scan_task.cancel()

    def diagnostics(self) -> list[dict[str, Any]]:
        return [
            {
                "source": route.scanner.source,
                "name": route.scanner.name,
                "rssi": route.advertisement.rssi,
                "connectable": route.scanner.connectable,
                "can_connect": _can_connect(route),
            }
            for route in bluetooth.async_scanner_devices_by_address(
                self.hass, self.address, connectable=False
            )
        ]
