async function installBluetooth(page) {
  await page.addInitScript(() => {
    const state = window.testBluetooth = { writes: [], delayConnection: false };
    const bytes = (value) => new Uint8Array(value instanceof ArrayBuffer ? value : value.buffer).slice();
    const dataView = (value) => new DataView(value.buffer, value.byteOffset, value.byteLength);
    let time = new Uint8Array(5);
    dataView(time).setUint32(0, Math.floor(Date.now() / 1000), true);
    dataView(time).setInt8(4, Math.floor(-new Date().getTimezoneOffset() / 60));
    let unit = 0xff;
    let first = 1;
    class Characteristic extends EventTarget {
      constructor(kind) { super(); this.kind = kind; }
      emit(value) { this.value = dataView(value); this.dispatchEvent(new Event('characteristicvaluechanged')); }
      async readValue() {
        if (this.kind === 'time') return dataView(time.slice());
        if (this.kind === 'unit') return dataView(Uint8Array.of(unit));
        if (this.kind === 'battery') return dataView(Uint8Array.of(87));
        const counts = new Uint8Array(8);
        dataView(counts).setUint32(0, 2, true);
        dataView(counts).setUint32(4, 2, true);
        return dataView(counts);
      }
      async writeValueWithResponse(value) {
        const payload = bytes(value);
        if (this.kind === 'time' && payload.length === 5 && state.failTimeWrite) throw new DOMException('Device is out of range', 'NetworkError');
        state.writes.push({ kind: this.kind, bytes: Array.from(payload) });
        if (this.kind === 'time' && payload.length === 5) time = payload;
        if (this.kind === 'unit') unit = payload[0];
        if (this.kind === 'index') first = dataView(payload).getUint32(0, true);
      }
      async startNotifications() {
        if (this.kind === 'measurement') queueMicrotask(() => this.emit(Uint8Array.of(0xc0, 0x08, 48)));
        if (this.kind === 'history') {
          for (let index = first; index <= 2; index++) {
            const frame = new Uint8Array(14);
            const value = dataView(frame);
            value.setUint32(0, index, true);
            value.setUint32(4, Math.floor(Date.now() / 3600000) * 3600 - index * 3600, true);
            value.setInt16(8, 2350, true); value.setUint8(10, 60);
            value.setInt16(11, 2100, true); value.setUint8(13, 40);
            queueMicrotask(() => this.emit(frame));
          }
        }
        return this;
      }
      async stopNotifications() {}
    }
    const ids = { ccb7: 'time', ccbe: 'unit', ccc4: 'battery', ccb9: 'count', ccba: 'index', ccbc: 'history', ccc1: 'measurement' };
    const characteristics = new Map(Object.entries(ids).map(([id, kind]) => [id, new Characteristic(kind)]));
    const service = { async getCharacteristic(id) { return characteristics.get(id.slice(4, 8)); } };
    const device = new EventTarget();
    device.id = 'browser-test-clock'; device.name = 'LYWSD02MMC';
    device.gatt = {
      connected: false,
      async connect() {
        if (state.delayConnection) await new Promise(resolve => { state.finishConnection = resolve; });
        this.connected = true;
        return this;
      },
      disconnect() { this.connected = false; device.dispatchEvent(new Event('gattserverdisconnected')); },
      async getPrimaryService() { return service; }
    };
    const bluetooth = new EventTarget();
    bluetooth.getAvailability = async () => true;
    bluetooth.requestDevice = async () => device;
    bluetooth.getDevices = async () => [];
    Object.defineProperty(navigator, 'bluetooth', { configurable: true, value: bluetooth });
  });
}

module.exports = { installBluetooth };
