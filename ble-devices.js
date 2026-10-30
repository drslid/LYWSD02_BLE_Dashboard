/* Protocol implementations based on published wire specifications. See docs/DEVICE_SUPPORT.md. */
(function (root) {
  'use strict';
  const uuid = (value) => `0000${value.toString(16).padStart(4, '0')}-0000-1000-8000-00805f9b34fb`;
  const PVVX_SERVICE = uuid(0x1f10);
  const QINGPING_SERVICE = '22210000-554a-4546-5542-46534450464d';
  const PVVX_MODELS = { 0: 'LYWSD03MMC', 1: 'MHO-C401', 2: 'CGG1', 3: 'LYWSD03MMC', 4: 'LYWSD03MMC', 5: 'LYWSD03MMC', 6: 'CGDK2', 7: 'CGG1N', 8: 'MHO-C401N', 9: 'MJWSD05MMC', 10: 'LYWSD03MMC', 11: 'MHO-C122', 12: 'MJWSD05MMC', 14: 'LYWSD03MMC', 49: 'LYWSD02MMC' };
  const asBytes = (value) => value instanceof DataView
    ? new Uint8Array(value.buffer, value.byteOffset, value.byteLength).slice() : new Uint8Array(value).slice();
  const view = (value) => new DataView(value.buffer, value.byteOffset, value.byteLength);
  const fail = (message) => Object.assign(new Error(message), { name: 'NotSupportedError' });
  const integer = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
  function validateMeasurement(temperature, humidity) {
    if (!Number.isFinite(temperature) || temperature < -80 || temperature > 150 || !Number.isFinite(humidity) || humidity < 0 || humidity > 100) throw fail('Invalid sensor measurement');
    return { temperature, humidity };
  }
  async function write(characteristic, bytes) {
    if (characteristic.properties?.writeWithoutResponse && !characteristic.properties.write && typeof characteristic.writeValueWithoutResponse === 'function') return characteristic.writeValueWithoutResponse(bytes);
    if (typeof characteristic.writeValueWithResponse === 'function') return characteristic.writeValueWithResponse(bytes);
    return characteristic.writeValue(bytes);
  }
  class Channel {
    constructor(characteristic, timeout = 8000, writeCharacteristic = characteristic) {
      this.characteristic = characteristic;
      this.writeCharacteristic = writeCharacteristic;
      this.timeout = timeout;
      this.listeners = new Set();
      this.closed = false;
      this.pending = null;
      this.queue = Promise.resolve();
      this.onValue = (event) => {
        const frame = asBytes(event.target.value);
        for (const listener of this.listeners) listener(frame);
        if (this.pending?.accept(frame)) this.pending.resolve(frame);
      };
    }
    async start() {
      if (this.closed) throw new Error('Bluetooth session closed');
      this.characteristic.addEventListener('characteristicvaluechanged', this.onValue);
      try {
        await this.characteristic.startNotifications();
        if (this.closed) throw new Error('Bluetooth session closed');
      }
      catch (error) { this.close(); throw error; }
    }
    request(payload, accept, timeout = this.timeout) {
      const run = async () => {
        if (this.closed) throw new Error('Bluetooth session closed');
        let timer;
        const response = new Promise((resolve, reject) => {
          this.pending = { accept, resolve, reject };
          timer = setTimeout(() => reject(new Error('Bluetooth command timed out')), timeout);
        });
        // Attach a rejection handler before a potentially slow GATT write.
        void response.catch(() => {});
        try {
          const [, frame] = await Promise.all([write(this.writeCharacteristic, new Uint8Array(payload)), response]);
          return frame;
        } finally { clearTimeout(timer); this.pending = null; }
      };
      const operation = this.queue.then(run);
      this.queue = operation.catch(() => {});
      return operation;
    }
    close() {
      this.closed = true;
      this.characteristic.removeEventListener('characteristicvaluechanged', this.onValue);
      this.pending?.reject(new Error('Bluetooth session closed'));
      this.listeners.clear();
    }
  }
  class Pvvx {
    constructor(server, emit) {
      this.server = server; this.emit = emit; this.kind = 'pvvx';
      this.capabilities = { time: false, unit: false, format: false, history: false };
    }
    async open() {
      this.service = await this.server.getPrimaryService(PVVX_SERVICE);
      if (this.closed) throw new Error('Bluetooth session closed');
      const characteristic = await this.service.getCharacteristic(uuid(0x1f1f));
      if (this.closed) throw new Error('Bluetooth session closed');
      this.channel = new Channel(characteristic);
      await this.channel.start();
      const id = await this.command([0], (f) => f[0] === 0 && f.length === 12);
      const dv = view(id);
      this.hardware = dv.getUint16(2, true);
      this.version = dv.getUint16(4, true);
      this.services = dv.getUint32(8, true);
      this.model = PVVX_MODELS[this.hardware];
      if (id[1] !== 0 || !this.model || this.version < 0x47 || this.version > 0x59 || (this.version & 15) > 9 || (this.services & 0xa0) !== 0xa0 || (this.services & 0x1000000)) throw fail('Unrecognized PVVX climate firmware');
      this.capabilities = { time: true, unit: true, format: [9, 12, 49].includes(this.hardware), history: Boolean(this.services & 0x10) };
      this.channel.listeners.add((frame) => {
        if (frame[0] !== 0x33 || frame.length < 9) return;
        try { this.emit({ ...validateMeasurement(view(frame).getInt16(3, true) / 100, view(frame).getInt16(5, true) / 100), batteryMv: view(frame).getUint16(1, true) }); } catch { /* Invalid notifications are ignored. */ }
      });
    }
    command(bytes, accept, timeout) { return this.channel.request(bytes, accept, timeout); }
    async startMeasurements() {
      await this.command([0x33, 0xff], (f) => f[0] === 0x33 && f.length >= 9);
      try {
        const service = await this.server.getPrimaryService(uuid(0x180f));
        const level = asBytes(await (await service.getCharacteristic(uuid(0x2a19))).readValue())[0];
        if (level <= 100) this.emit({ battery: level });
      } catch { /* Battery failure does not prevent live measurements. */ }
    }
    async readTime(offset) {
      const frame = await this.command([0x23], (f) => f[0] === 0x23 && [5, 9].includes(f.length));
      const localEpoch = view(frame).getUint32(1, true);
      return { localEpoch, offset, drift: localEpoch - Date.now() / 1000 - offset * 60 };
    }
    async sync(offset, correction = 0, format = null) {
      if (!integer(offset, -720, 840) || !integer(correction, -120, 120)) throw fail('Invalid timezone or clock correction');
      if (format !== null && (!['12', '24'].includes(format) || !this.capabilities.format)) throw fail('Unsupported clock format');
      const payload = new Uint8Array(5); payload[0] = 0x23;
      view(payload).setUint32(1, Math.floor(Date.now() / 1000) + (offset + correction) * 60, true);
      await this.command(payload, (f) => f[0] === 0x23 && [5, 9].includes(f.length));
      if (format !== null && this.capabilities.format) await this.configure({ format });
      const result = await this.readTime(offset);
      if (Math.abs(result.drift - correction * 60) > 5) throw new Error('PVVX clock verification failed');
      return result;
    }
    async configuration() {
      const frame = await this.command([0x55], (f) => f[0] === 0x55 && f.length >= 13 && f.length <= 20);
      // Only modify the documented modern configuration layout.
      if (this.version < 0x47 || this.version > 0x59 || frame[1] !== (this.version & 0xff)) throw fail('Unsupported PVVX settings version');
      return frame;
    }
    async unit() { return ((await this.configuration())[2] & 0x10) ? 'F' : 'C'; }
    async configure({ unit = null, format = null }) {
      if (unit !== null && !['C', 'F'].includes(unit)) throw fail('Invalid temperature unit');
      const config = await this.configuration();
      const flags = config[2];
      let next = flags;
      if (unit !== null) next = unit === 'F' ? next | 0x10 : next & ~0x10;
      if (format !== null) {
        if (!this.capabilities.format || !['12', '24'].includes(format)) throw fail('This PVVX device does not support this clock format');
        next = format === '12' ? next | 0x20 : next & ~0x20;
      }
      if (next === flags) return;
      // Partial config write changes only its first flags byte; unrelated fields stay on the device.
      const reply = await this.command([0x55, next], (f) => f[0] === 0x55 && f.length >= 13);
      if (reply[2] !== next) throw new Error('PVVX settings verification failed');
    }
    async history(limit) {
      if (!this.capabilities.history || !integer(limit, 1, 168)) throw fail('History unavailable');
      const records = new Map();
      const listener = (f) => {
        if (f[0] !== 0x35 || f.length !== 13) return;
        const dv = view(f); const index = dv.getUint16(1, true);
        if (index < 1 || index > limit) return;
        try {
          const measured = validateMeasurement(dv.getInt16(7, true) / 100, dv.getUint16(9, true) / 100);
          records.set(index, { index, rawTimestamp: dv.getUint32(3, true), ...measured, batteryMv: dv.getUint16(11, true) });
        } catch { /* Reject malformed samples. */ }
      };
      this.channel.listeners.add(listener);
      try {
        await this.command([0x35, limit & 255, limit >> 8], (f) => f.length === 3 && f[0] === 0x35 && f[1] === 0 && f[2] === 0, 35000);
        return [...records.values()].sort((a, b) => a.index - b.index);
      } finally { this.channel.listeners.delete(listener); }
    }
    close() { this.closed = true; this.channel?.close(); }
  }
  class Cgd1 {
    constructor(server, emit, token) {
      this.server = server; this.emit = emit; this.token = token; this.kind = 'cgd1'; this.model = 'CGD1';
      this.capabilities = { time: true, unit: true, format: true, history: false };
    }
    async open() {
      if (!/^[a-f\d]{32}$/i.test(this.token || '')) throw fail('CGD1 requires its existing 32-character pairing token');
      this.service = await this.server.getPrimaryService(QINGPING_SERVICE);
      if (this.closed) throw new Error('Bluetooth session closed');
      // Replies and writes use separate characteristics on this clock.
      const [authWrite, dataWrite, authNotify, dataNotify] = await Promise.all([1, 0xb, 2, 0xc].map((id) => this.service.getCharacteristic(uuid(id))));
      if (this.closed) throw new Error('Bluetooth session closed');
      this.auth = new Channel(authNotify, 8000, authWrite);
      this.data = new Channel(dataNotify, 8000, dataWrite);
      await this.auth.start(); await this.data.start();
      const secret = this.token.match(/../g).map((s) => parseInt(s, 16));
      await this.request(this.auth, [0x11, 2, ...secret], this.ack(2));
      // A privileged settings read proves the session is authenticated; never provision/reset a token.
      await this.settings();
    }
    ack(command) {
      return (f) => {
        if (f.length !== 5 || f[0] !== 4 || f[1] !== 0xff || f[2] !== command || f[3] !== 0) return false;
        return true;
      };
    }
    async request(channel, bytes, accept) {
      const frame = await channel.request(bytes, accept);
      if (frame.length === 5 && frame[0] === 4 && frame[1] === 0xff && frame[4] !== 0) throw fail('CGD1 rejected the command or pairing token');
      return frame;
    }
    settings() { return this.request(this.data, [1, 2], (f) => f.length === 20 && f[0] === 0x13 && [1, 2].includes(f[1])); }
    async unit() { return ((await this.settings())[5] & 4) ? 'F' : 'C'; }
    async configure({ unit = null, format = null, offset = null }) {
      if (unit !== null && !['C', 'F'].includes(unit)) throw fail('Invalid temperature unit');
      if (format !== null && !['12', '24'].includes(format)) throw fail('Invalid clock format');
      const before = await this.settings(); const next = before.slice(); next[1] = 1;
      if (unit !== null) next[5] = unit === 'F' ? next[5] | 4 : next[5] & ~4;
      if (format !== null) next[5] = format === '12' ? next[5] | 2 : next[5] & ~2;
      if (offset !== null) {
        if (!integer(offset, -720, 840) || offset % 6 !== 0) throw fail('CGD1 time zones must be exact multiples of six minutes');
        next[6] = Math.abs(offset) / 6; next[13] = offset >= 0 ? 1 : 0;
      }
      if (next.slice(2).every((value, i) => value === before[i + 2])) return;
      await this.request(this.data, next, this.ack(1));
      const actual = await this.settings();
      if (!next.slice(2).every((value, i) => value === actual[i + 2])) throw new Error('CGD1 settings verification failed');
    }
    async sync(offset, correction = 0, format = null) {
      if (!integer(correction, -120, 120)) throw fail('Invalid clock correction');
      await this.configure({ offset, format });
      const payload = new Uint8Array(6); payload.set([5, 9]);
      view(payload).setUint32(2, Math.floor(Date.now() / 1000) + correction * 60, true);
      await this.request(this.auth, payload, this.ack(9));
      return null; // Acknowledgement is not a measured clock read-back.
    }
    async readTime() { return null; }
    async startMeasurements() {
      const characteristic = await this.service.getCharacteristic(uuid(0x100));
      if (this.closed) throw new Error('Bluetooth session closed');
      this.measurement = characteristic;
      this.onMeasurement = (event) => {
        const f = asBytes(event.target.value);
        if (f.length < 5 || f[0] !== 0) return;
        try { this.emit(validateMeasurement(view(f).getInt16(1, true) / 100, view(f).getInt16(3, true) / 100)); } catch { /* Invalid frames are ignored. */ }
      };
      characteristic.addEventListener('characteristicvaluechanged', this.onMeasurement);
      await characteristic.startNotifications();
      // Standard battery reads are unreliable on known CGD1 firmware; do not present them as valid readings.
    }
    close() {
      this.closed = true;
      this.auth?.close(); this.data?.close();
      this.measurement?.removeEventListener('characteristicvaluechanged', this.onMeasurement);
    }
  }
  class Sensor {
    constructor(server, emit, kind) {
      this.server = server; this.emit = emit; this.kind = kind;
      this.capabilities = { time: false, unit: false, format: false, history: false };
    }
    async open() {
      if (['flowercare', 'ropot'].includes(this.kind)) {
        this.service = await this.server.getPrimaryService(uuid(0x1204));
        this.control = await this.service.getCharacteristic(uuid(0x1a00));
        this.values = await this.service.getCharacteristic(uuid(0x1a01));
        this.battery = await this.service.getCharacteristic(uuid(0x1a02));
      } else {
        const service = this.kind === 'lywsdcgq' ? '226c0000-6476-4566-7562-66734470666d'
          : this.kind === 'lywsd03' ? 'ebe0ccb0-7a0a-4b0c-8a1a-6ff2997da3a6' : QINGPING_SERVICE;
        this.service = await this.server.getPrimaryService(service);
        const characteristic = this.kind === 'lywsdcgq' ? '226caa55-6476-4566-7562-66734470666d'
          : this.kind === 'lywsd03' ? 'ebe0ccc1-7a0a-4b0c-8a1a-6ff2997da3a6' : uuid(0x100);
        this.values = await this.service.getCharacteristic(characteristic);
      }
    }
    parse(bytes) {
      const data = view(bytes);
      if (this.kind === 'lywsdcgq') {
        const text = String.fromCharCode(...bytes).replace(/\0+$/, '');
        const match = /^T=(-?\d+(?:\.\d+)?) H=(\d+(?:\.\d+)?)$/.exec(text);
        if (!match) throw fail('Invalid LYWSDCGQ frame');
        return validateMeasurement(Number(match[1]), Number(match[2]));
      }
      if (this.kind === 'lywsd03') {
        if (bytes.length !== 5) throw fail('Invalid LYWSD03MMC frame');
        return { ...validateMeasurement(data.getInt16(0, true) / 100, bytes[2]), batteryMv: data.getUint16(3, true) };
      }
      if (['cgg1', 'cgdk2'].includes(this.kind)) {
        const size = this.kind === 'cgg1' ? 6 : 7;
        if (bytes.length !== size) throw fail('Unsupported Qingping sensor frame');
        return validateMeasurement(data.getInt16(size - 4, true) / 10, data.getInt16(size - 2, true) / 10);
      }
      if (bytes.length < 10 || bytes[7] > 100) throw fail('Invalid plant sensor frame');
      const result = { soilMoisture: bytes[7], conductivity: data.getUint16(8, true) };
      if (this.kind === 'flowercare') {
        result.temperature = data.getInt16(0, true) / 10;
        validateMeasurement(result.temperature, 0);
        result.illuminance = data.getUint32(3, true);
      }
      return result;
    }
    async startMeasurements() {
      if (!this.control) {
        this.listener = (event) => {
          try { this.emit(this.parse(asBytes(event.target.value))); } catch { /* Unsupported notifications are ignored. */ }
        };
        this.values.addEventListener('characteristicvaluechanged', this.listener);
        await this.values.startNotifications();
      }
      await this.refresh();
    }
    async refresh() {
      if (this.closed) throw new Error('Bluetooth session closed');
      if (this.control) {
        const battery = asBytes(await this.battery.readValue());
        if (battery.length < 3) throw fail('Invalid plant sensor identity');
        if (this.closed) throw new Error('Bluetooth session closed');
        await write(this.control, new Uint8Array([0xa0, 0x1f]));
        if (this.closed) throw new Error('Bluetooth session closed');
        const reading = this.parse(asBytes(await this.values.readValue()));
        if (!this.closed) this.emit({ ...reading, ...(battery[0] <= 100 ? { battery: battery[0] } : {}) });
      } else if (this.values.properties?.read) {
        const reading = this.parse(asBytes(await this.values.readValue()));
        if (!this.closed) this.emit(reading);
      }
      if (this.kind !== 'lywsd03' && !this.control) {
        try {
          const batteryService = await this.server.getPrimaryService(uuid(0x180f));
          const level = asBytes(await (await batteryService.getCharacteristic(uuid(0x2a19))).readValue())[0];
          if (!this.closed && level <= 100) this.emit({ battery: level });
        } catch { /* Unknown battery remains unknown. */ }
      }
    }
    async readTime() { return null; }
    close() { this.closed = true; if (this.listener) this.values?.removeEventListener('characteristicvaluechanged', this.listener); }
  }
  const api = { uuid, Channel, Pvvx, Cgd1, Sensor, PVVX_MODELS, PVVX_SERVICE, QINGPING_SERVICE };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BLE_DEVICES = api;
})(typeof window === 'object' ? window : globalThis);
