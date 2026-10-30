"""PVVX and Qingping CGD1 command sessions; no pairing, reset or firmware writes.

Wire specifications and validation scope: docs/DEVICE_SUPPORT.md.
"""
from __future__ import annotations

import asyncio
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from datetime import datetime, timedelta
import struct
from typing import Any

from bleak import BleakClient

from .const import CONF_CLOCK_FORMAT, CONF_CORRECTION, CONF_UNIT, FORMAT_12H, UNIT_FAHRENHEIT
from .protocol import utc_offset_minutes

PVVX_SERVICE = "00001f10-0000-1000-8000-00805f9b34fb"
PVVX_COMMAND = "00001f1f-0000-1000-8000-00805f9b34fb"
CGD1_SERVICE = "22210000-554a-4546-5542-46534450464d"
PVVX_MODELS = {
    0: "LYWSD03MMC", 1: "MHO-C401", 2: "CGG1", 3: "LYWSD03MMC",
    4: "LYWSD03MMC", 5: "LYWSD03MMC", 6: "CGDK2", 7: "CGG1N",
    8: "MHO-C401N", 9: "MJWSD05MMC", 10: "LYWSD03MMC", 11: "MHO-C122",
    12: "MJWSD05MMC", 14: "LYWSD03MMC", 49: "LYWSD02MMC",
}


def uuid(value: int) -> str:
    return f"0000{value:04x}-0000-1000-8000-00805f9b34fb"


def measurement(temperature: float, humidity: float) -> tuple[float, float]:
    if not -80 <= temperature <= 150 or not 0 <= humidity <= 100:
        raise ValueError("Invalid sensor measurement")
    return temperature, humidity


@dataclass
class Reading:
    unit: str | None = None
    drift: float | None = None
    clock_time: datetime | None = None
    temperature: float | None = None
    humidity: float | None = None
    battery: int | None = None


class Channel:
    """Serialize commands, accepting only their matching notification replies."""

    def __init__(self, client: BleakClient, notify: str, write: str | None = None, *, response: bool = True) -> None:
        self.client = client
        self.notify = notify
        self.write = write or notify
        self.response = response
        self.pending: asyncio.Future[bytes] | None = None
        self.accept: Callable[[bytes], bool] = lambda _: False
        self.lock = asyncio.Lock()
        self.started = False

    async def start(self) -> None:
        self.started = True
        await self.client.start_notify(self.notify, self._received)

    def _received(self, _characteristic: Any, value: bytearray) -> None:
        frame = bytes(value)
        if self.pending is not None and not self.pending.done() and self.accept(frame):
            self.pending.set_result(frame)

    async def request(self, payload: bytes, accept: Callable[[bytes], bool]) -> bytes:
        async with self.lock:
            self.pending = asyncio.get_running_loop().create_future()
            self.accept = accept
            try:
                async with asyncio.timeout(8):
                    await self.client.write_gatt_char(self.write, payload, response=self.response)
                    return await self.pending
            finally:
                if not self.pending.done():
                    self.pending.cancel()
                self.pending = None

    async def close(self) -> None:
        if self.pending is not None and not self.pending.done():
            self.pending.cancel()
        if self.started:
            try:
                async with asyncio.timeout(3):
                    await self.client.stop_notify(self.notify)
            except Exception:
                pass


class Pvvx:
    """Clock-capable PVVX climate devices, identified before any settings write."""

    def __init__(self, client: BleakClient) -> None:
        self.client = client
        # The firmware advertises Write Without Response; command replies arrive as notifications.
        self.channel = Channel(client, PVVX_COMMAND, response=False)
        self.hardware = -1
        self.version = 0
        self.model = "PVVX"
        self.services = 0

    async def open(self) -> None:
        await self.channel.start()
        frame = await self.command(b"\x00", lambda f: f[:1] == b"\x00")
        if len(frame) != 12 or frame[1] != 0:
            raise ValueError("Unrecognized PVVX identity frame")
        _, _, self.hardware, self.version, _sensor, self.services = struct.unpack("<BBHHHI", frame)
        if self.hardware not in PVVX_MODELS or not 0x47 <= self.version <= 0x59 or self.version & 15 > 9 or self.services & 0xA0 != 0xA0 or self.services & 0x1000000:
            raise ValueError("Unsupported PVVX climate firmware")
        self.model = PVVX_MODELS[self.hardware]

    async def command(self, payload: bytes, accept: Callable[[bytes], bool] | None = None) -> bytes:
        return await self.channel.request(payload, accept or (lambda f: f[:1] == payload[:1]))

    async def read_time(self) -> int:
        frame = await self.command(b"\x23")
        if len(frame) not in (5, 9):
            raise ValueError("Invalid PVVX time response")
        return struct.unpack_from("<I", frame, 1)[0]

    async def configuration(self) -> bytes:
        frame = await self.command(b"\x55")
        if not 13 <= len(frame) <= 20 or not 0x47 <= self.version <= 0x59 or frame[1] != self.version & 0xFF:
            raise ValueError("Unsupported PVVX settings version")
        return frame

    async def synchronize(self, now: datetime, settings: Mapping[str, Any]) -> Reading:
        result = Reading()
        if settings[CONF_CLOCK_FORMAT] == FORMAT_12H and self.hardware not in (9, 12, 49):
            raise ValueError("This PVVX model has no 12/24-hour switch")
        correction = int(settings[CONF_CORRECTION])
        offset = utc_offset_minutes(now)
        old_time = await self.read_time()
        now = datetime.now(now.tzinfo)
        result.drift = round(old_time - now.timestamp() - (offset + correction) * 60, 1)
        payload = b"\x23" + struct.pack("<I", round(now.timestamp()) + (offset + correction) * 60)
        await self.command(payload)
        after = await self.read_time()
        if abs(after - (now.timestamp() + (offset + correction) * 60)) > 10:
            raise ValueError("PVVX clock read-back verification failed")
        result.clock_time = (now + timedelta(seconds=after - now.timestamp() - offset * 60)).replace(microsecond=0)
        requested_unit = settings[CONF_UNIT]
        requested_format = settings[CONF_CLOCK_FORMAT]
        # Preserve unrelated flags and configuration. Only the first config byte is written.
        if requested_unit is not None or requested_format is not None:
            config = await self.configuration()
            flags = config[2]
            if requested_unit is not None:
                flags = flags | 0x10 if requested_unit == UNIT_FAHRENHEIT else flags & ~0x10
            if requested_format is not None and self.hardware in (9, 12, 49):
                flags = flags | 0x20 if requested_format == FORMAT_12H else flags & ~0x20
            if flags != config[2]:
                reply = await self.command(bytes([0x55, flags]))
                if len(reply) < 3 or reply[2] != flags:
                    raise ValueError("PVVX settings verification failed")
            result.unit = UNIT_FAHRENHEIT if flags & 0x10 else "celsius"
        else:
            try:
                result.unit = UNIT_FAHRENHEIT if (await self.configuration())[2] & 0x10 else "celsius"
            except (ValueError, TimeoutError):
                pass
        return result

    async def readings(self, result: Reading) -> None:
        try:
            frame = await self.command(b"\x33\x01", lambda f: f[:1] == b"\x33" and len(f) >= 9)
            temp, humidity = struct.unpack_from("<hh", frame, 3)
            result.temperature, result.humidity = measurement(temp / 100, humidity / 100)
        except Exception:
            pass
        try:
            value = await self.client.read_gatt_char(uuid(0x2A19))
            if value and value[0] <= 100:
                result.battery = value[0]
        except Exception:
            pass

    async def close(self) -> None:
        await self.channel.close()


class Cgd1:
    """Use an existing pairing token; do not bind or reset a CGD1 clock."""

    def __init__(self, client: BleakClient, token: str) -> None:
        if len(token) != 32:
            raise ValueError("CGD1 requires its existing pairing token")
        try:
            self.token = bytes.fromhex(token)
        except ValueError as error:
            raise ValueError("Invalid CGD1 pairing token") from error
        if len(self.token) != 16:
            raise ValueError("Invalid CGD1 pairing token")
        self.client = client
        self.auth = Channel(client, uuid(2), uuid(1))
        self.data = Channel(client, uuid(0xC), uuid(0xB))
        self.model = "CGD1"

    async def ack(self, channel: Channel, payload: bytes, command: int) -> None:
        frame = await channel.request(payload, lambda f: len(f) == 5 and f[:4] == bytes([4, 0xFF, command, 0]))
        if frame[4] != 0:
            raise ValueError("CGD1 rejected command or pairing token")

    async def open(self) -> None:
        await self.auth.start()
        await self.data.start()
        await self.ack(self.auth, b"\x11\x02" + self.token, 2)
        # A privileged read is required even when the token was acknowledged.
        await self.settings()

    async def settings(self) -> bytes:
        return await self.data.request(b"\x01\x02", lambda f: len(f) == 20 and f[0] == 0x13 and f[1] in (1, 2))

    async def synchronize(self, now: datetime, settings: Mapping[str, Any]) -> Reading:
        offset = utc_offset_minutes(now)
        if offset % 6 or not -720 <= offset <= 840:
            raise ValueError("CGD1 requires a timezone in exact six-minute increments")
        before = await self.settings()
        config = bytearray(before)
        config[1] = 1
        config[6] = abs(offset) // 6
        config[13] = int(offset >= 0)
        if (unit := settings[CONF_UNIT]) is not None:
            config[5] = config[5] | 4 if unit == UNIT_FAHRENHEIT else config[5] & ~4
        if (mode := settings[CONF_CLOCK_FORMAT]) is not None:
            config[5] = config[5] | 2 if mode == FORMAT_12H else config[5] & ~2
        if config[2:] != before[2:]:
            await self.ack(self.data, bytes(config), 1)
            if (await self.settings())[2:] != config[2:]:
                raise ValueError("CGD1 settings verification failed")
        correction = int(settings[CONF_CORRECTION])
        await self.ack(self.auth, b"\x05\x09" + struct.pack("<I", round(datetime.now(now.tzinfo).timestamp()) + correction * 60), 9)
        # No verified clock-time read command exists; never fabricate a drift or read-back.
        return Reading(unit=UNIT_FAHRENHEIT if config[5] & 4 else "celsius")

    async def readings(self, result: Reading) -> None:
        measured: asyncio.Future[bytes] = asyncio.get_running_loop().create_future()

        def receive(_char: Any, value: bytearray) -> None:
            if len(value) >= 5 and value[0] == 0 and not measured.done():
                measured.set_result(bytes(value))

        try:
            await self.client.start_notify(uuid(0x100), receive)
            async with asyncio.timeout(8):
                frame = await measured
            temperature, humidity = struct.unpack_from("<hh", frame, 1)
            result.temperature, result.humidity = measurement(temperature / 100, humidity / 100)
        except Exception:
            pass
        finally:
            if not measured.done():
                measured.cancel()
            try:
                async with asyncio.timeout(3):
                    await self.client.stop_notify(uuid(0x100))
            except Exception:
                pass
        # Known CGD1 standard battery reads are unreliable; leave that reading unknown.

    async def close(self) -> None:
        await self.auth.close()
        await self.data.close()
