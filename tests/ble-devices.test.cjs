'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Channel, Pvvx, Cgd1, PVVX_SERVICE, QINGPING_SERVICE, uuid } = require('../ble-devices.js');
const dv = (bytes) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
class Characteristic {
  constructor(onWrite = () => {}) { this.listeners = new Set(); this.onWrite = onWrite; }
  addEventListener(_type, listener) { this.listeners.add(listener); }
  removeEventListener(_type, listener) { this.listeners.delete(listener); }
  async startNotifications() {}
  emit(frame) { this.value = dv(Uint8Array.from(frame)); for (const listener of this.listeners) listener({ target: this }); }
  async writeValueWithResponse(value) { return this.onWrite(Uint8Array.from(value)); }
}
function pvvxFixture({ hardware = 0, version = 0x59, services = 0xb0 } = {}) {
  const writes = []; let flags = 0xc7; let timestamp = Math.floor(Date.now() / 1000);
  const characteristic = new Characteristic((bytes) => {
    writes.push(bytes);
    const id = bytes[0];
    if (id === 0) {
      const frame = new Uint8Array(12);
      dv(frame).setUint16(2, hardware, true); dv(frame).setUint16(4, version, true); dv(frame).setUint32(8, services, true);
      characteristic.emit(frame);
    } else if (id === 0x23) {
      if (bytes.length === 5) timestamp = dv(bytes).getUint32(1, true);
      const frame = new Uint8Array(9); frame[0] = 0x23; dv(frame).setUint32(1, timestamp, true); characteristic.emit(frame);
    } else if (id === 0x55) {
      if (bytes.length === 2) flags = bytes[1];
      characteristic.emit([0x55, version, flags, 0xe0, 0x80, 0x11, 40, 4, 0xa9, 0x10, 3, 7, 2, 0]);
    } else if (id === 0x33) {
      characteristic.emit([0x33, 255]); // ACK must not be mistaken for a measurement.
      const frame = new Uint8Array(9); frame[0] = 0x33;
      dv(frame).setUint16(1, 3012, true); dv(frame).setInt16(3, -325, true); dv(frame).setInt16(5, 5212, true);
      characteristic.emit(frame);
    } else if (id === 0x35) {
      const frame = new Uint8Array(13); frame[0] = 0x35;
      dv(frame).setUint16(1, 1, true); dv(frame).setUint32(3, 1700000000, true);
      dv(frame).setInt16(7, -125, true); dv(frame).setUint16(9, 6350, true); dv(frame).setUint16(11, 2900, true);
      characteristic.emit(frame); characteristic.emit(frame); // Duplicate transfer packet.
      characteristic.emit([0x35, 0, 0]);
    }
  });
  const server = { async getPrimaryService(id) {
    if (id === uuid(0x180f)) return { async getCharacteristic() { return { async readValue() { return dv(Uint8Array.from([87])); } }; } };
    assert.equal(id, PVVX_SERVICE);
    return { async getCharacteristic(id) { assert.equal(id, uuid(0x1f1f)); return characteristic; } };
  } };
  characteristic.properties = { write: false, writeWithoutResponse: true };
  characteristic.writeValueWithoutResponse = async (bytes) => characteristic.onWrite(Uint8Array.from(bytes));
  characteristic.writeValueWithResponse = async () => { throw new Error('PVVX requires Write Without Response'); };
  return { server, characteristic, writes };
}
function cgd1Fixture({ rejectToken = false, rejectTime = false } = {}) {
  const writes = []; let config = Uint8Array.from([0x13, 2, 6, 0x91, 0xb2, 0x91, 80, 5, 0x62, 22, 0, 6, 0, 1, 1, 0xc7, 1, 2, 3, 4]);
  const authNotify = new Characteristic(); const dataNotify = new Characteristic(); const sensor = new Characteristic();
  const authWrite = new Characteristic((bytes) => {
    writes.push(bytes);
    if (bytes[0] === 0x11) { assert.equal(bytes[1], 2, 'Never provision a pairing token'); authNotify.emit([4, 0xff, 2, 0, Number(rejectToken)]); }
    if (bytes[0] === 5) authNotify.emit([4, 0xff, 9, 0, Number(rejectTime)]);
  });
  const dataWrite = new Characteristic((bytes) => {
    writes.push(bytes);
    if (bytes[0] === 1) dataNotify.emit(config);
    else { assert.equal(bytes.length, 20); config = bytes.slice(); dataNotify.emit([4, 0xff, 1, 0, 0]); }
  });
  const characteristics = new Map([[uuid(1), authWrite], [uuid(2), authNotify], [uuid(0xb), dataWrite], [uuid(0xc), dataNotify], [uuid(0x100), sensor]]);
  const server = { async getPrimaryService(id) { assert.equal(id, QINGPING_SERVICE); return { async getCharacteristic(id) { assert.ok(characteristics.has(id)); return characteristics.get(id); } }; } };
  return { server, writes, sensor, authNotify, dataNotify, get config() { return config; } };
}

test('PVVX identity, signed temperature, fractional humidity and battery use the published layouts', async () => {
  const fake = pvvxFixture(); const readings = [];
  const adapter = new Pvvx(fake.server, (value) => readings.push(value));
  try {
    await adapter.open(); await adapter.startMeasurements();
    assert.equal(adapter.model, 'LYWSD03MMC');
    assert.deepEqual(readings, [{ temperature: -3.25, humidity: 52.12, batteryMv: 3012 }, { battery: 87 }]);
    assert.equal(adapter.capabilities.format, false);
  } finally { adapter.close(); }
  assert.equal(fake.characteristic.listeners.size, 0);
});
for (const options of [{ hardware: 999 }, { version: 0x60 }, { services: 0x80 }, { services: 0x10000a0 }]) {
  test(`PVVX refuses an unknown device or unsupported firmware before any clock write: ${JSON.stringify(options)}`, async () => {
    const fake = pvvxFixture(options); const adapter = new Pvvx(fake.server, () => {});
    try { await assert.rejects(adapter.open(), /Unrecognized/); }
    finally { adapter.close(); }
    assert.deepEqual(fake.writes.map((frame) => frame[0]), [0]);
  });
}
test('PVVX sync handles a fractional timezone and correction without a stock timezone byte', async () => {
  const fake = pvvxFixture(); const adapter = new Pvvx(fake.server, () => {});
  try {
    await adapter.open(); await adapter.sync(345, -2);
    const payload = fake.writes.find((bytes) => bytes[0] === 0x23 && bytes.length === 5);
    assert.ok(Math.abs(dv(payload).getUint32(1, true) - (Date.now() / 1000 + 343 * 60)) < 2);
  } finally { adapter.close(); }
});
test('PVVX unit and clock-format writes preserve unrelated configuration flags', async () => {
  const fake = pvvxFixture({ hardware: 49 }); const adapter = new Pvvx(fake.server, () => {});
  try {
    await adapter.open(); await adapter.configure({ unit: 'F', format: '12' });
    assert.deepEqual(Array.from(fake.writes.find((bytes) => bytes[0] === 0x55 && bytes.length === 2)), [0x55, 0xf7]);
    assert.equal(await adapter.unit(), 'F');
  } finally { adapter.close(); }
});
test('PVVX history keeps averaged samples and raw device timestamps, deduplicating packets', async () => {
  const fake = pvvxFixture(); const adapter = new Pvvx(fake.server, () => {});
  try {
    await adapter.open(); const records = await adapter.history(24);
    assert.deepEqual(records, [{ index: 1, rawTimestamp: 1700000000, temperature: -1.25, humidity: 63.5, batteryMv: 2900 }]);
    assert.equal(records[0].minTemperature, undefined);
    assert.equal(records[0].timestamp, undefined);
  } finally { adapter.close(); }
});
test('closing a command session rejects waiting commands even when the GATT write hangs', async () => {
  const characteristic = new Characteristic(() => new Promise(() => {}));
  const channel = new Channel(characteristic, 100);
  await channel.start(); const operation = channel.request([1], () => true);
  await Promise.resolve(); channel.close();
  await assert.rejects(operation, /session closed/);
});
test('CGD1 authenticates with the existing token, preserves alarms/settings and verifies timezone writes', async () => {
  const fake = cgd1Fixture(); const before = fake.config.slice();
  const adapter = new Cgd1(fake.server, () => {}, '12'.repeat(16));
  try {
    await adapter.open(); assert.equal(await adapter.sync(-210, 1, '12'), null);
    const config = fake.writes.find((f) => f[0] === 0x13);
    for (let i = 2; i < 20; i++) if (![5, 6, 13].includes(i)) assert.equal(config[i], before[i], `preserve byte ${i}`);
    assert.equal(config[6], 35); assert.equal(config[13], 0); assert.equal(config[5], before[5] | 2);
    const time = fake.writes.find((f) => f[0] === 5);
    assert.ok(Math.abs(dv(time).getUint32(2, true) - (Date.now() / 1000 + 60)) < 2);
    assert.equal(await adapter.readTime(), null);
  } finally { adapter.close(); }
  assert.equal(fake.authNotify.listeners.size, 0); assert.equal(fake.dataNotify.listeners.size, 0);
});
test('CGD1 refuses a rejected token without writing settings or time', async () => {
  const fake = cgd1Fixture({ rejectToken: true }); const adapter = new Cgd1(fake.server, () => {}, '12'.repeat(16));
  try { await assert.rejects(adapter.open(), /rejected/); }
  finally { adapter.close(); }
  assert.equal(fake.writes.length, 1);
});
test('CGD1 rejects unrepresentable timezones rather than rounding them silently', async () => {
  const fake = cgd1Fixture(); const adapter = new Cgd1(fake.server, () => {}, '12'.repeat(16));
  try {
    await adapter.open(); const count = fake.writes.length;
    await assert.rejects(adapter.sync(345), /six minutes/);
    assert.equal(fake.writes.length, count + 1, 'Only the read-only settings request precedes validation');
  } finally { adapter.close(); }
});
test('CGD1 parses its connected hundredths without inventing a battery percentage', async () => {
  const fake = cgd1Fixture(); const readings = []; const adapter = new Cgd1(fake.server, (value) => readings.push(value), '12'.repeat(16));
  try {
    await adapter.open(); await adapter.startMeasurements();
    fake.sensor.emit([0, 0xbb, 0xfe, 0x2a, 0x14]);
    assert.deepEqual(readings, [{ temperature: -3.25, humidity: 51.62 }]);
  } finally { adapter.close(); }
});
test('CGD1 command failure is not reported as successful time sync', async () => {
  const fake = cgd1Fixture({ rejectTime: true }); const adapter = new Cgd1(fake.server, () => {}, '12'.repeat(16));
  try { await adapter.open(); await assert.rejects(adapter.sync(480), /rejected/); }
  finally { adapter.close(); }
});

for (const [kind, bytes, expected] of [
  ['lywsdcgq', Array.from(Buffer.from('T=-3.2 H=52.4\0')), { temperature: -3.2, humidity: 52.4 }],
  ['lywsd03', [0xbb, 0xfe, 52, 0xb2, 0x0b], { temperature: -3.25, humidity: 52, batteryMv: 2994 }],
  ['cgg1', [0, 0, 0xc6, 0, 0x42, 2], { temperature: 19.8, humidity: 57.8 }],
  ['cgdk2', [0, 0, 236, 0xc6, 0, 0x42, 2], { temperature: 19.8, humidity: 57.8 }],
]) {
  test(`${kind}: original-firmware measurements respect their own frame format and expose no clock controls`, () => {
    const { Sensor } = require('../ble-devices.js');
    const adapter = new Sensor({}, () => {}, kind);
    assert.deepEqual(adapter.parse(Uint8Array.from(bytes)), expected);
    assert.deepEqual(adapter.capabilities, { time: false, unit: false, format: false, history: false });
    assert.throws(() => adapter.parse(Uint8Array.from([0, 1])), /Invalid|Unsupported/);
  });
}
for (const kind of ['flowercare', 'ropot']) {
  test(`${kind}: measurement mode is transient; plant data are not presented as room humidity`, async () => {
    const { Sensor } = require('../ble-devices.js');
    const writes = []; const readings = [];
    const control = new Characteristic((bytes) => { writes.push(Array.from(bytes)); });
    const data = { async readValue() { return dv(Uint8Array.from([0xea, 0, 0, 0xab, 0, 0, 0, 21, 0xb2, 0])); } };
    const battery = { async readValue() { return dv(Uint8Array.from([99, 0x14, 0x31, 0x2e, 0x31, 0x2e, 0x35])); } };
    const server = { async getPrimaryService(id) {
      assert.equal(id, uuid(0x1204));
      return { async getCharacteristic(id) { return new Map([[uuid(0x1a00), control], [uuid(0x1a01), data], [uuid(0x1a02), battery]]).get(id); } };
    } };
    const adapter = new Sensor(server, (measurement) => readings.push(measurement), kind);
    await adapter.open(); await adapter.startMeasurements();
    assert.deepEqual(writes, [[0xa0, 0x1f]]);
    assert.equal(readings[0].soilMoisture, 21); assert.equal(readings[0].conductivity, 178);
    assert.equal(readings[0].humidity, undefined);
    if (kind === 'flowercare') { assert.equal(readings[0].temperature, 23.4); assert.equal(readings[0].illuminance, 171); }
    else { assert.equal(readings[0].temperature, undefined); assert.equal(readings[0].illuminance, undefined); }
    adapter.close(); await assert.rejects(adapter.refresh(), /session closed/);
  });
}
