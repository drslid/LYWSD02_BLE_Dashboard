'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const initialization = '  initialize();\n})();';
assert.equal(source.split(initialization).length, 2, 'Expected exactly one app initialization entry point');

function createNode() {
  const classes = new Set();
  return {
    textContent: '', value: '24', checked: false, disabled: false, hidden: false,
    dataset: {}, style: {},
    classList: {
      add(name) { classes.add(name); },
      remove(name) { classes.delete(name); },
      contains(name) { return classes.has(name); },
      toggle(name, enabled) { if (enabled) classes.add(name); else classes.delete(name); }
    },
    querySelector() { return { textContent: '' }; },
    querySelectorAll() { return []; },
    replaceChildren() {}, removeAttribute() {}, addEventListener() {}
  };
}

function setup(t, { fakeTimers = false } = {}) {
  const nodes = new Map();
  const storage = new Map();
  const timers = new Set();
  const scheduled = new Map();
  let nextTimer = 0;
  t.after(() => timers.forEach(clearTimeout));
  const context = {
    Date, Map, Set, Object, String, Number, Math, Uint8Array, ArrayBuffer, DataView, Promise, Intl, URL,
    document: {
      getElementById(id) {
        if (!nodes.has(id)) nodes.set(id, createNode());
        return nodes.get(id);
      },
      querySelector() { return { value: '24' }; },
      querySelectorAll() { return []; }
    },
    navigator: {
      bluetooth: { async requestDevice() { throw Object.assign(new Error('Cancelled'), { name: 'NotFoundError' }); } }
    },
    localStorage: {
      getItem(key) { return storage.get(key) ?? null; },
      setItem(key, value) { storage.set(key, value); }
    },
    window: {},
    setTimeout(callback, delay) {
      if (fakeTimers) {
        const timer = ++nextTimer;
        scheduled.set(timer, { callback, delay });
        return timer;
      }
      const timer = setTimeout(callback, delay);
      timers.add(timer);
      return timer;
    },
    clearTimeout(timer) {
      if (fakeTimers) scheduled.delete(timer);
      else {
        timers.delete(timer);
        clearTimeout(timer);
      }
    }
  };
  // Keep the production connection logic; replace unrelated rendering and automatic startup.
  vm.runInNewContext(source.replace(initialization, `
    renderDeviceHistory = () => {};
    renderDeviceIdentity = () => {};
    refreshIcons = () => {};
    log = () => {};
    readInitialValues = async () => {};
    refreshGrantedDevices = async () => {};
    globalThis.audit = {
      state, elements, connectToDevice, chooseDevice, cancelConnection, setConnectionControls, handleMeasurement,
      loadHistory, disconnectManually, readDeviceTime, readBattery, syncTime, collectHistory
    };
  })();`), context);
  assert.ok(context.audit, 'The app harness must be initialized');
  return {
    ...context.audit, storage, bluetooth: context.navigator.bluetooth,
    scheduler: {
      get pending() { return scheduled.size; },
      runNext() {
        const entry = scheduled.entries().next().value;
        assert.ok(entry, 'Expected a scheduled timer');
        const [timer, { callback, delay }] = entry;
        scheduled.delete(timer);
        callback();
        return delay;
      }
    }
  };
}

function device(id) {
  const data = { addEventListener() {}, removeEventListener() {}, async startNotifications() {} };
  const service = { async getCharacteristic() { return data; } };
  const dev = {
    id, name: 'LYWSD02', addEventListener() {}, removeEventListener() {},
    gatt: {
      connected: true, disconnects: 0,
      disconnect() { this.connected = false; this.disconnects += 1; },
      async connect() { this.connected = true; return this; },
      async getPrimaryService() { return service; }
    }
  };
  return { dev, data, service };
}

function install(app, sensor) {
  Object.assign(app.state, {
    device: sensor.dev, service: sensor.service, dataCharacteristic: sensor.data,
    isConnected: true, bluetoothUsable: true
  });
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

async function ticks(count = 8) {
  while (count-- > 0) await Promise.resolve();
}

test('switching sensors disconnects the previous GATT device', async (t) => {
  const app = setup(t);
  const old = device('old');
  const next = device('next');
  install(app, old);

  await app.connectToDevice(next.dev);

  assert.equal(old.dev.gatt.disconnects, 1);
  assert.equal(app.state.device, next.dev);
  assert.equal(app.state.isConnected, true);
});

test('cancelling the history chooser preserves the current connected status', async (t) => {
  const app = setup(t);
  const old = device('old');
  install(app, old);
  app.elements.status.dataset.state = 'connected';

  await app.chooseDevice('next');

  assert.equal(app.state.isConnected, true);
  assert.equal(app.elements.status.dataset.state, 'connected');
  assert.equal(old.dev.gatt.disconnects, 0);
});

test('a stale measurement notification cannot replace the current sensor readings', (t) => {
  const app = setup(t);
  const current = device('current');
  const stale = device('stale');
  install(app, current);
  Object.assign(app.state, { lastTemperatureC: 20, measurements: 4 });
  stale.data.value = new DataView(new Uint8Array([196, 9, 75]).buffer);

  app.handleMeasurement({ target: stale.data });

  assert.equal(app.state.lastTemperatureC, 20);
  assert.equal(app.state.measurements, 4);
});

test('a late battery read cannot update another sensor', async (t) => {
  const app = setup(t);
  const old = device('old');
  const next = device('next');
  const reading = deferred();
  old.service.getCharacteristic = async () => ({ readValue: () => reading.promise });
  install(app, old);
  const pending = app.readBattery();
  await ticks();

  await app.connectToDevice(next.dev);
  reading.resolve(new DataView(new Uint8Array([87]).buffer));
  await pending;

  assert.equal(app.state.lastBattery, null);
  assert.equal(app.elements.battery.textContent, '--');
});

test('a late clock read cannot update another sensor', async (t) => {
  const app = setup(t);
  const old = device('old');
  const next = device('next');
  const reading = deferred();
  old.service.getCharacteristic = async () => ({ readValue: () => reading.promise });
  install(app, old);
  const pending = app.readDeviceTime();
  await ticks();

  await app.connectToDevice(next.dev);
  const payload = new DataView(new ArrayBuffer(5));
  payload.setUint32(0, Math.floor(Date.now() / 1000), true);
  reading.resolve(payload);
  await pending;

  assert.equal(app.state.clockDrift, null);
  assert.equal(app.elements.deviceTime.textContent, '--:--');
});

test('a late history count cannot reset another sensor history or loading state', async (t) => {
  const app = setup(t);
  const old = device('old');
  const next = device('next');
  const reading = deferred();
  old.service.getCharacteristic = async () => ({ readValue: () => reading.promise });
  install(app, old);
  const pending = app.loadHistory();
  await ticks();

  await app.connectToDevice(next.dev);
  app.state.historyRecords = [{ index: 999 }];
  app.state.historyLoading = true;
  app.elements.historyStatus.textContent = 'new sensor reading';
  reading.resolve(new DataView(new ArrayBuffer(8)));
  await pending;

  assert.equal(app.state.historyRecords[0].index, 999);
  assert.equal(app.state.historyLoading, true);
  assert.equal(app.elements.historyStatus.textContent, 'new sensor reading');
});

test('disconnect cancels history collection and clears its listener', { timeout: 1000 }, async (t) => {
  const app = setup(t);
  const old = device('old');
  const listeners = new Set();
  install(app, old);
  const characteristic = {
    addEventListener(_, callback) { listeners.add(callback); },
    removeEventListener(_, callback) { listeners.delete(callback); },
    async startNotifications() {}, async stopNotifications() {}
  };
  const pending = app.collectHistory(characteristic, 24, {
    run: app.state.connectionRun, device: old.dev, service: old.service
  });
  await ticks();
  assert.equal(listeners.size, 1);

  app.disconnectManually();
  const records = await pending;

  assert.equal(records.length, 0);
  assert.equal(listeners.size, 0);
  assert.equal(app.state.cancelHistoryCollection, null);
});

test('switching sensors during clock sync stops follow-up writes and clears the spinner', async (t) => {
  const app = setup(t);
  const old = device('old');
  const next = device('next');
  const writing = deferred();
  let writes = 0;
  old.service.getCharacteristic = async () => ({
    writeValueWithResponse() { writes += 1; return writing.promise; }
  });
  install(app, old);
  const pending = app.syncTime();
  await ticks();
  assert.equal(writes, 1);
  assert.equal(app.elements.syncBtn.classList.contains('is-loading'), true);

  await app.connectToDevice(next.dev);
  writing.resolve();
  await pending;

  assert.equal(writes, 1);
  assert.equal(app.state.deviceTimezoneMinutes, null);
  assert.equal(app.elements.syncBtn.classList.contains('is-loading'), false);
});

test('reconnecting the same sensor rejects reads from its previous connection', async (t) => {
  const app = setup(t);
  const sensor = device('same');
  const reading = deferred();
  sensor.service.getCharacteristic = async () => ({ readValue: () => reading.promise });
  install(app, sensor);
  const pending = app.readBattery();
  await ticks();

  app.disconnectManually();
  sensor.service.getCharacteristic = async () => sensor.data;
  await app.connectToDevice(sensor.dev);
  app.state.lastBattery = 55;
  reading.resolve(new DataView(new Uint8Array([87]).buffer));
  await pending;

  assert.equal(app.state.isConnected, true);
  assert.equal(app.state.lastBattery, 55);
});

for (const action of ['disconnect', 'switch']) {
  test(`a short session saves the latest readings before ${action}`, async (t) => {
    const app = setup(t);
    const old = device('old');
    install(app, old);
    app.state.deviceHistory.old = { id: 'old', name: 'LYWSD02', alias: 'Bedroom', connections: 1 };
    Object.assign(app.state, {
      lastPersistedAt: Date.now(), lastTemperatureC: 22.5, lastHumidity: 54, lastBattery: 88
    });

    if (action === 'disconnect') app.disconnectManually();
    else await app.connectToDevice(device('next').dev);

    const saved = JSON.parse(app.storage.get('lywsd02-device-history-v1') || '{}').old;
    assert.ok(saved, 'The completed session should be persisted');
    assert.equal(saved.lastTemperatureC, 22.5);
    assert.equal(saved.lastHumidity, 54);
    assert.equal(saved.lastBattery, 88);
  });
}

test('the main button remains enabled and offers cancellation during a connection', (t) => {
  const app = setup(t);
  Object.assign(app.state, { bluetoothUsable: true, isConnecting: true });

  app.setConnectionControls();

  assert.equal(app.elements.connectBtn.disabled, false);
  assert.equal(app.elements.connectBtnLabel.textContent, 'button.cancelConnection');

  app.state.bluetoothUsable = false;
  app.setConnectionControls();
  assert.equal(app.elements.connectBtn.disabled, false, 'Cancellation remains available if the adapter becomes unavailable');
});

test('cancellation immediately releases controls and disconnects a late GATT connection', async (t) => {
  const app = setup(t);
  const sensor = device('pending');
  const connecting = deferred();
  let attempts = 0;
  app.state.bluetoothUsable = true;
  app.elements.autoRetry.checked = true;
  sensor.dev.gatt.connected = false;
  sensor.dev.gatt.connect = () => { attempts += 1; return connecting.promise; };
  const pending = app.connectToDevice(sensor.dev);
  await ticks();

  app.cancelConnection();

  assert.equal(app.state.isConnecting, false);
  assert.equal(app.state.isConnected, false);
  assert.equal(app.elements.connectBtn.disabled, false);
  assert.equal(app.elements.connectBtnLabel.textContent, 'connection.detect');
  assert.equal(app.elements.status.dataset.state, 'disconnected');
  sensor.dev.gatt.connected = true;
  connecting.resolve(sensor.dev.gatt);
  assert.equal(await pending, false);
  assert.equal(sensor.dev.gatt.connected, false);
  assert.equal(app.state.isConnected, false);
  assert.equal(app.state.service, null);
  assert.equal(attempts, 1);
});

for (const reuseSensor of [false, true]) {
  for (const outcome of ['resolve', 'reject']) {
    test(`a cancelled GATT ${outcome} cannot disturb a new connection to ${reuseSensor ? 'the same' : 'another'} sensor`, async (t) => {
      const app = setup(t);
      const old = device('old');
      const next = reuseSensor ? old : device('next');
      const connecting = deferred();
      app.state.bluetoothUsable = true;
      old.dev.gatt.connected = false;
      old.dev.gatt.connect = () => connecting.promise;
      const pending = app.connectToDevice(old.dev);
      await ticks();
      app.cancelConnection();
      old.dev.gatt.connect = async function () { this.connected = true; return this; };
      assert.equal(await app.connectToDevice(next.dev), true);
      const currentRun = app.state.connectionRun;
      const currentDisconnects = next.dev.gatt.disconnects;

      if (outcome === 'resolve') {
        old.dev.gatt.connected = true;
        connecting.resolve(old.dev.gatt);
      } else {
        connecting.reject(Object.assign(new Error('Late GATT failure'), { name: 'NetworkError' }));
      }
      assert.equal(await pending, false);

      assert.equal(app.state.device, next.dev);
      assert.equal(app.state.service, next.service);
      assert.equal(app.state.connectionRun, currentRun);
      assert.equal(app.state.isConnected, true);
      assert.equal(app.state.isConnecting, false);
      assert.equal(next.dev.gatt.connected, true);
      assert.equal(next.dev.gatt.disconnects, currentDisconnects);
      assert.equal(app.elements.status.dataset.state, 'connected');
    });
  }
}

for (const stage of ['service discovery', 'characteristic discovery', 'notifications']) {
  test(`cancellation during ${stage} ignores late setup and cleans the old listener`, { timeout: 1000 }, async (t) => {
    const app = setup(t);
    const old = device('old');
    const next = device('next');
    const operation = deferred();
    const stageStarted = deferred();
    const listeners = new Set();
    old.data.addEventListener = (_, listener) => listeners.add(listener);
    old.data.removeEventListener = (_, listener) => listeners.delete(listener);
    const pause = () => { stageStarted.resolve(); return operation.promise; };
    if (stage === 'service discovery') old.dev.gatt.getPrimaryService = pause;
    else if (stage === 'characteristic discovery') old.service.getCharacteristic = pause;
    else old.data.startNotifications = pause;
    const pending = app.connectToDevice(old.dev);
    await stageStarted.promise;

    app.cancelConnection();
    assert.equal(app.state.isConnecting, false);
    assert.equal(await app.connectToDevice(next.dev), true);
    operation.resolve(stage === 'service discovery' ? old.service : old.data);
    assert.equal(await pending, false);

    assert.equal(listeners.size, 0);
    assert.equal(old.dev.gatt.connected, false);
    assert.equal(app.state.device, next.dev);
    assert.equal(app.state.dataCharacteristic, next.data);
    assert.equal(app.state.service, next.service);
    assert.equal(app.state.isConnected, true);
  });
}

test('late notification setup cannot remove the listener of a new connection to the same sensor', { timeout: 1000 }, async (t) => {
  const app = setup(t);
  const sensor = device('same');
  const starting = deferred();
  const stageStarted = deferred();
  const listeners = new Set();
  sensor.data.addEventListener = (_, listener) => listeners.add(listener);
  sensor.data.removeEventListener = (_, listener) => listeners.delete(listener);
  sensor.data.startNotifications = () => { stageStarted.resolve(); return starting.promise; };
  const pending = app.connectToDevice(sensor.dev);
  await stageStarted.promise;
  assert.equal(listeners.size, 1);

  app.cancelConnection();
  assert.equal(listeners.size, 0);
  sensor.data.startNotifications = async () => {};
  assert.equal(await app.connectToDevice(sensor.dev), true);
  starting.resolve(sensor.data);
  assert.equal(await pending, false);

  assert.equal(listeners.size, 1);
  sensor.data.value = new DataView(new Uint8Array([196, 9, 75]).buffer);
  for (const listener of listeners) listener({ target: sensor.data });
  assert.equal(app.state.lastTemperatureC, 25);
  assert.equal(app.state.lastHumidity, 75);
  assert.equal(app.state.isConnected, true);
});

test('cancellation clears the retry timer and completes the pending attempt', { timeout: 1000 }, async (t) => {
  const app = setup(t, { fakeTimers: true });
  const sensor = device('retry');
  let attempts = 0;
  app.state.bluetoothUsable = true;
  app.elements.autoRetry.checked = true;
  sensor.dev.gatt.connected = false;
  sensor.dev.gatt.connect = async () => {
    attempts += 1;
    throw Object.assign(new Error('Unavailable'), { name: 'NetworkError' });
  };
  const pending = app.connectToDevice(sensor.dev);
  await ticks();
  assert.equal(attempts, 1);
  assert.equal(app.scheduler.pending, 1);

  app.cancelConnection();

  assert.equal(app.scheduler.pending, 0);
  assert.equal(await pending, false);
  assert.equal(attempts, 1);
  assert.equal(app.state.isConnecting, false);
  assert.equal(app.elements.connectBtn.disabled, false);
});

test('disabling automatic retry during its delay stops further attempts immediately', { timeout: 1000 }, async (t) => {
  const app = setup(t, { fakeTimers: true });
  const sensor = device('retry-disabled');
  let attempts = 0;
  app.state.bluetoothUsable = true;
  app.elements.autoRetry.checked = true;
  sensor.dev.gatt.connected = false;
  sensor.dev.gatt.connect = async () => {
    attempts += 1;
    throw Object.assign(new Error('Unavailable'), { name: 'NetworkError' });
  };
  const pending = app.connectToDevice(sensor.dev);
  await ticks(20);
  assert.equal(attempts, 1);
  assert.equal(app.scheduler.pending, 1);
  assert.equal(typeof app.state.connectionTask?.wakeRetry, 'function');

  app.elements.autoRetry.checked = false;
  app.state.connectionTask.wakeRetry();

  assert.equal(await pending, false);
  assert.equal(app.scheduler.pending, 0);
  assert.equal(attempts, 1);
  assert.equal(app.state.isConnecting, false);
  assert.equal(app.elements.connectBtn.disabled, false);
  assert.equal(app.elements.status.dataset.state, 'disconnected');
});

for (const autoRetry of [true, false]) {
  test(`connection failure attempts ${autoRetry ? 'ten times with nine bounded delays' : 'once when automatic retry is disabled'}`, { timeout: 1000 }, async (t) => {
    const app = setup(t, { fakeTimers: true });
    const sensor = device('unavailable');
    let attempts = 0;
    let finished = false;
    app.state.bluetoothUsable = true;
    app.elements.autoRetry.checked = autoRetry;
    sensor.dev.gatt.connected = false;
    sensor.dev.gatt.connect = async () => {
      attempts += 1;
      throw Object.assign(new Error('Unavailable'), { name: 'NetworkError' });
    };
    const pending = app.connectToDevice(sensor.dev).then((result) => { finished = true; return result; });
    const delays = [];
    for (let index = 0; index < 20 && !finished; index += 1) {
      await ticks(20);
      if (app.scheduler.pending) delays.push(app.scheduler.runNext());
    }
    await ticks(20);

    assert.equal(finished, true, 'The retry sequence must finish without an extra timer');
    assert.equal(await pending, false);
    assert.equal(attempts, autoRetry ? 10 : 1);
    assert.equal(delays.length, autoRetry ? 9 : 0);
    assert.ok(delays.every((delay) => Number.isFinite(delay) && delay > 0 && delay <= 30000));
    assert.equal(app.scheduler.pending, 0);
    assert.equal(app.state.isConnecting, false);
    assert.equal(app.elements.connectBtn.disabled, false);
    assert.equal(app.elements.status.dataset.state, 'disconnected');
  });
}

test('cancelling device selection ignores a device chosen after cancellation', async (t) => {
  const app = setup(t);
  const sensor = device('late-selection');
  const selection = deferred();
  let attempts = 0;
  app.state.bluetoothUsable = true;
  app.bluetooth.requestDevice = () => selection.promise;
  sensor.dev.gatt.connected = false;
  sensor.dev.gatt.connect = async function () { attempts += 1; this.connected = true; return this; };
  const pending = app.chooseDevice();
  await ticks();
  assert.equal(app.state.isConnecting, true);

  app.cancelConnection();
  assert.equal(app.state.isConnecting, false);
  assert.equal(app.elements.connectBtn.disabled, false);
  selection.resolve(sensor.dev);
  await pending;

  assert.equal(attempts, 0);
  assert.equal(app.state.device, null);
  assert.equal(app.state.isConnected, false);
  assert.equal(app.elements.status.dataset.state, 'disconnected');
});

test('explicitly cancelling the history chooser preserves the current connection and readings', { timeout: 1000 }, async (t) => {
  const app = setup(t);
  const old = device('connected');
  const next = device('late-selection');
  const selection = deferred();
  install(app, old);
  Object.assign(app.state, { lastTemperatureC: 21.5, lastHumidity: 49, measurements: 6 });
  const currentRun = app.state.connectionRun;
  app.bluetooth.requestDevice = () => selection.promise;
  const pending = app.chooseDevice('late-selection');
  await ticks();

  app.cancelConnection();
  await pending;

  assert.equal(app.state.isConnecting, false);
  assert.equal(app.state.isConnected, true);
  assert.equal(app.state.device, old.dev);
  assert.equal(app.state.service, old.service);
  assert.equal(app.state.connectionRun, currentRun);
  assert.equal(old.dev.gatt.connected, true);
  assert.equal(old.dev.gatt.disconnects, 0);
  assert.equal(app.state.lastTemperatureC, 21.5);
  assert.equal(app.state.lastHumidity, 49);
  assert.equal(app.state.measurements, 6);
  assert.equal(app.elements.connectBtn.disabled, false);
  assert.equal(app.elements.connectBtnLabel.textContent, 'button.disconnect');
  assert.equal(app.elements.status.dataset.state, 'connected');

  selection.resolve(next.dev);
  await ticks(20);
  assert.equal(app.state.device, old.dev);
  assert.equal(app.state.isConnected, true);
});

for (const outcome of ['resolve', 'reject']) {
  test(`a cancelled chooser ${outcome} cannot reset a newer selection`, async (t) => {
    const app = setup(t);
    const old = device('old-selection');
    const next = device('next-selection');
    const firstSelection = deferred();
    const secondSelection = deferred();
    app.state.bluetoothUsable = true;
    app.bluetooth.requestDevice = () => firstSelection.promise;
    const first = app.chooseDevice();
    await ticks();
    app.cancelConnection();
    app.bluetooth.requestDevice = () => secondSelection.promise;
    const second = app.chooseDevice();
    await ticks();

    if (outcome === 'resolve') firstSelection.resolve(old.dev);
    else firstSelection.reject(Object.assign(new Error('Dismissed'), { name: 'NotFoundError' }));
    await first;

    assert.equal(app.state.isConnecting, true);
    assert.equal(app.state.device, null);
    assert.equal(app.elements.status.dataset.state, 'connecting');
    assert.equal(app.elements.connectBtn.disabled, false);
    assert.equal(app.elements.connectBtnLabel.textContent, 'button.cancelConnection');
    secondSelection.resolve(next.dev);
    await second;
    assert.equal(app.state.device, next.dev);
    assert.equal(app.state.isConnected, true);
  });
}
