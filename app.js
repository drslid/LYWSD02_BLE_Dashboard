(() => {
  'use strict';

  const UUIDS = {
    service: 'ebe0ccb0-7a0a-4b0c-8a1a-6ff2997da3a6',
    time: 'ebe0ccb7-7a0a-4b0c-8a1a-6ff2997da3a6',
    recordCount: 'ebe0ccb9-7a0a-4b0c-8a1a-6ff2997da3a6',
    recordIndex: 'ebe0ccba-7a0a-4b0c-8a1a-6ff2997da3a6',
    history: 'ebe0ccbc-7a0a-4b0c-8a1a-6ff2997da3a6',
    unit: 'ebe0ccbe-7a0a-4b0c-8a1a-6ff2997da3a6',
    measurements: 'ebe0ccc1-7a0a-4b0c-8a1a-6ff2997da3a6',
    battery: 'ebe0ccc4-7a0a-4b0c-8a1a-6ff2997da3a6'
  };

  const BASE_URL = 'https://drslid.github.io/LYWSD02_BLE_Dashboard/';
  const ALIASES_KEY = 'lywsd02-device-aliases-v1';
  const DEVICE_HISTORY_KEY = 'lywsd02-device-history-v1';
  const AUTO_RETRY_KEY = 'lywsd02-auto-retry-v1';
  const AUTO_CLOCK_KEY = 'lywsd02-auto-clock-v1';
  const RETRY_DELAYS = [1500, 3000, 6000, 10000, 10000, 10000, 10000, 10000, 10000];
  const MAX_LOG_ENTRIES = 120;
  const TIMEZONE_OFFSETS = [
    -720, -660, -600, -570, -540, -480, -420, -360, -300, -240, -210,
    -180, -150, -120, -60, 0, 60, 120, 180, 210, 240, 270, 300, 330,
    345, 360, 390, 420, 480, 525, 540, 570, 600, 630, 660, 720, 765,
    780, 825, 840
  ];

  const byId = (id) => document.getElementById(id);
  const elements = {
    autoRetry: byId('autoRetry'),
    autoSyncClock: byId('autoSyncClock'),
    battery: byId('battery'),
    batteryBar: byId('batteryBar'),
    batteryHint: byId('batteryHint'),
    batTimestamp: byId('batTimestamp'),
    cancelRenameBtn: byId('cancelRenameBtn'),
    clearLogs: byId('clearLogs'),
    closeRenameBtn: byId('closeRenameBtn'),
    compatibilityNotice: byId('compatibilityNotice'),
    compatibilityText: byId('compatibilityText'),
    compatibilityTitle: byId('compatibilityTitle'),
    connectBtn: byId('connectBtn'),
    connectBtnLabel: byId('connectBtnLabel'),
    copyAddressBtn: byId('copyAddressBtn'),
    copyAddressStatus: byId('copyAddressStatus'),
    currentYear: byId('currentYear'),
    deviceAlias: byId('deviceAlias'),
    deviceId: byId('deviceId'),
    deviceLabel: byId('deviceLabel'),
    deviceTime: byId('deviceTime'),
    deviceTimeDrift: byId('deviceTimeDrift'),
    deviceTimeZone: byId('deviceTimeZone'),
    exportHistoryBtn: byId('exportHistoryBtn'),
    historyCount: byId('historyCount'),
    historyEmpty: byId('historyEmpty'),
    historyLimit: byId('historyLimit'),
    historyStatus: byId('historyStatus'),
    historyTableBody: byId('historyTableBody'),
    historyTableWrap: byId('historyTableWrap'),
    humidity: byId('humidity'),
    humidityBar: byId('humidityBar'),
    humTimestamp: byId('humTimestamp'),
    knownDevices: byId('knownDevices'),
    knownDevicesList: byId('knownDevicesList'),
    loadHistoryBtn: byId('loadHistoryBtn'),
    logs: byId('logs'),
    offsetMinutes: byId('offsetMinutes'),
    offsetMinutesRange: byId('offsetMinutesRange'),
    offsetOutput: byId('offsetOutput'),
    refreshTimeBtn: byId('refreshTimeBtn'),
    renameBtn: byId('renameBtn'),
    renameDialog: byId('renameDialog'),
    renameForm: byId('renameForm'),
    retryMessage: byId('retryMessage'),
    status: byId('status'),
    statusText: byId('statusText'),
    syncBtn: byId('syncBtn'),
    temperature: byId('temperature'),
    tempTimestamp: byId('tempTimestamp'),
    timezone: byId('timezone'),
    unitBtn: byId('unitBtn'),
    updateCount: byId('updateCount')
  };

  const legacyAliases = readStoredObject(ALIASES_KEY);
  const state = {
    aliases: legacyAliases,
    bluetoothUsable: false,
    cancelHistoryCollection: null,
    clockDrift: null,
    connectionRun: 0,
    connectionTask: null,
    dataCharacteristic: null,
    device: null,
    deviceHistory: normalizeDeviceHistory(readStoredObject(DEVICE_HISTORY_KEY), legacyAliases),
    deviceTimezoneMinutes: null,
    grantedDevices: new Map(),
    historyCharacteristic: null,
    historyLoading: false,
    historyRecords: [],
    isConnected: false,
    isConnecting: false,
    lastBattery: null,
    lastHumidity: null,
    lastPersistedAt: 0,
    lastTemperatureC: null,
    manualDisconnect: false,
    measurements: 0,
    server: null,
    service: null
  };

  function t(key, values) {
    return window.LYWSD02_I18N?.t(key, values) ?? key;
  }

  function localeTag() {
    return window.LYWSD02_I18N?.localeTag() ?? 'en';
  }

  function readStoredObject(key) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || '{}');
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  function readStoredBoolean(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value === null ? fallback : value !== 'false';
    } catch {
      return fallback;
    }
  }

  function storeObject(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      log(t('log.storage'), 'warning');
    }
  }

  function storeBoolean(key, value) {
    try {
      localStorage.setItem(key, String(value));
    } catch {
      log(t('log.storage'), 'warning');
    }
  }

  function normalizeDeviceHistory(history, aliases) {
    const normalized = {};
    Object.entries(history).forEach(([id, record]) => {
      if (!id || !record || typeof record !== 'object') return;
      normalized[id] = {
        id,
        name: String(record.name || 'LYWSD02'),
        alias: String(record.alias || aliases[id] || ''),
        lastConnected: Number(record.lastConnected || 0),
        connections: Number(record.connections || 0),
        lastTemperatureC: Number.isFinite(record.lastTemperatureC) ? record.lastTemperatureC : null,
        lastHumidity: Number.isFinite(record.lastHumidity) ? record.lastHumidity : null,
        lastBattery: Number.isFinite(record.lastBattery) ? record.lastBattery : null
      };
    });
    Object.entries(aliases).forEach(([id, alias]) => {
      if (!normalized[id]) {
        normalized[id] = { id, name: 'LYWSD02', alias, lastConnected: 0, connections: 0, lastTemperatureC: null, lastHumidity: null, lastBattery: null };
      }
    });
    return normalized;
  }

  function refreshIcons() {
    window.lucide?.createIcons?.({ attrs: { 'aria-hidden': 'true' } });
  }

  function nowLabel() {
    return new Intl.DateTimeFormat(localeTag(), { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date());
  }

  function formatNumber(value, maximumFractionDigits = 2) {
    return new Intl.NumberFormat(localeTag(), { minimumFractionDigits: maximumFractionDigits, maximumFractionDigits }).format(value);
  }

  function log(message, type = 'info') {
    if (!elements.logs) return;
    elements.logs.querySelector('.logs-empty')?.remove();

    const entry = document.createElement('div');
    entry.className = 'log-entry';
    entry.dataset.type = type;
    const dot = document.createElement('span');
    dot.className = 'log-entry__dot';
    dot.setAttribute('aria-hidden', 'true');
    const text = document.createElement('span');
    text.className = 'log-entry__message';
    text.textContent = message;
    const time = document.createElement('time');
    time.dateTime = new Date().toISOString();
    time.textContent = nowLabel();
    entry.append(dot, text, time);
    elements.logs.append(entry);

    while (elements.logs.children.length > MAX_LOG_ENTRIES) elements.logs.firstElementChild?.remove();
    elements.logs.scrollTop = elements.logs.scrollHeight;
  }

  function resetLogs() {
    elements.logs.replaceChildren();
    const empty = document.createElement('div');
    empty.className = 'logs-empty';
    const icon = document.createElement('i');
    icon.setAttribute('data-lucide', 'terminal');
    icon.setAttribute('aria-hidden', 'true');
    const text = document.createElement('p');
    text.textContent = t('logs.empty');
    empty.append(icon, text);
    elements.logs.append(empty);
    refreshIcons();
  }

  function setConnectionStatus(mode, label) {
    elements.status.dataset.state = mode;
    elements.statusText.textContent = label;
  }

  function setCompatibilityNotice(title, text) {
    elements.compatibilityTitle.textContent = title;
    elements.compatibilityText.textContent = text;
    elements.compatibilityNotice.hidden = false;
  }

  function clearCompatibilityNotice() {
    elements.compatibilityNotice.hidden = true;
  }

  function setConnectionControls() {
    document.querySelectorAll('.requires-connection').forEach((control) => {
      control.disabled = !state.isConnected;
    });
    elements.renameBtn.disabled = !state.device;
    elements.connectBtn.disabled = !state.bluetoothUsable && !state.isConnecting && !state.isConnected;
    elements.connectBtn.classList.toggle('is-loading', state.isConnecting);
    elements.connectBtnLabel.textContent = state.isConnecting
      ? t('button.cancelConnection')
      : state.isConnected ? t('button.disconnect') : t('connection.detect');
    elements.loadHistoryBtn.disabled = !state.isConnected || state.historyLoading;
    elements.historyLimit.disabled = !state.isConnected || state.historyLoading;
    elements.exportHistoryBtn.disabled = state.historyRecords.length === 0;
    renderDeviceHistory();
  }

  function shortDeviceId(id) {
    if (!id) return 'UNKNOWN';
    const compact = id.replace(/[^a-z0-9]/gi, '').toUpperCase();
    return compact.slice(-8) || 'UNKNOWN';
  }

  function historyRecord(id, fallbackName = 'LYWSD02') {
    return state.deviceHistory[id] || { id, name: fallbackName, alias: '', lastConnected: 0, connections: 0 };
  }

  function displayNameForId(id, fallbackName = 'LYWSD02') {
    const record = historyRecord(id, fallbackName);
    return record.alias || state.aliases[id] || `${record.name || fallbackName} · ${shortDeviceId(id)}`;
  }

  function deviceDisplayName(device) {
    return device ? displayNameForId(device.id, device.name || 'LYWSD02') : t('connection.noDevice');
  }

  function renderDeviceIdentity() {
    if (!state.device) {
      elements.deviceLabel.textContent = t('connection.noDevice');
      elements.deviceId.textContent = t('connection.idWaiting');
      elements.deviceId.removeAttribute('title');
      return;
    }
    elements.deviceLabel.textContent = deviceDisplayName(state.device);
    elements.deviceId.textContent = `ID · ${shortDeviceId(state.device.id)}`;
    elements.deviceId.title = state.device.id || '';
  }

  function bindDevice(device) {
    if (state.device && state.device !== device) state.device.removeEventListener('gattserverdisconnected', handleGattDisconnected);
    state.device = device;
    device.removeEventListener('gattserverdisconnected', handleGattDisconnected);
    device.addEventListener('gattserverdisconnected', handleGattDisconnected);
    renderDeviceIdentity();
    setConnectionControls();
  }

  function recordSuccessfulConnection(device) {
    const previous = historyRecord(device.id, device.name || 'LYWSD02');
    state.deviceHistory[device.id] = {
      ...previous,
      id: device.id,
      name: device.name || previous.name || 'LYWSD02',
      alias: previous.alias || state.aliases[device.id] || '',
      lastConnected: Date.now(),
      connections: Number(previous.connections || 0) + 1
    };
    storeObject(DEVICE_HISTORY_KEY, state.deviceHistory);
    renderDeviceHistory();
  }

  function persistDeviceSnapshot(force = false) {
    if (!state.device || !state.deviceHistory[state.device.id]) return;
    if (!force && Date.now() - state.lastPersistedAt < 30000) return;
    const record = state.deviceHistory[state.device.id];
    record.lastTemperatureC = state.lastTemperatureC;
    record.lastHumidity = state.lastHumidity;
    record.lastBattery = state.lastBattery;
    state.lastPersistedAt = Date.now();
    storeObject(DEVICE_HISTORY_KEY, state.deviceHistory);
    renderDeviceHistory();
  }

  function resetMeasurements() {
    state.clockDrift = null;
    state.deviceTimezoneMinutes = null;
    state.lastBattery = null;
    state.lastHumidity = null;
    state.lastTemperatureC = null;
    state.lastPersistedAt = 0;
    state.measurements = 0;
    elements.temperature.textContent = '--';
    elements.humidity.textContent = '--';
    elements.battery.textContent = '--';
    elements.deviceTime.textContent = '--:--';
    elements.tempTimestamp.textContent = '--:--:--';
    elements.humTimestamp.textContent = '--:--:--';
    elements.batTimestamp.textContent = '--:--:--';
    elements.deviceTimeZone.textContent = t('metric.timezoneUnread');
    elements.deviceTimeDrift.textContent = t('metric.driftUnknown');
    elements.updateCount.textContent = t('metric.updates', { count: 0 });
    elements.humidityBar.style.width = '0%';
    elements.batteryBar.style.width = '0%';
    elements.batteryHint.textContent = t('metric.remaining');
  }

  function resetHistory() {
    state.historyRecords = [];
    elements.historyTableBody.replaceChildren();
    elements.historyTableWrap.hidden = true;
    elements.historyEmpty.hidden = false;
    elements.historyEmpty.querySelector('p').textContent = state.device ? t('history.emptyLoaded') : t('history.emptyConnect');
    elements.historyCount.textContent = t('history.count', { count: 0 });
    elements.historyStatus.textContent = t('history.statusDefault');
    elements.exportHistoryBtn.disabled = true;
  }

  function wait(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  function startConnectionTask(device = null) {
    let resolveCancellation;
    const task = {
      device,
      cancelled: false,
      wakeRetry: null,
      cancellation: new Promise((resolve) => { resolveCancellation = resolve; }),
      cancel() {
        task.cancelled = true;
        task.wakeRetry?.();
        resolveCancellation();
      }
    };
    state.connectionTask = task;
    return task;
  }

  async function connectionStep(promise, task) {
    const result = await Promise.race([promise, task.cancellation]);
    if (task.cancelled) throw Object.assign(new Error('Connection cancelled'), { name: 'AbortError' });
    return result;
  }

  async function waitForRetry(milliseconds, task) {
    let timer;
    try {
      await connectionStep(new Promise((resolve) => {
        task.wakeRetry = () => {
          clearTimeout(timer);
          resolve();
        };
        timer = setTimeout(resolve, milliseconds);
      }), task);
    } finally {
      clearTimeout(timer);
      task.wakeRetry = null;
    }
  }

  function stopGatt(device) {
    // disconnect() also aborts a pending connect(), even when connected is false.
    try { device?.gatt?.disconnect(); } catch { /* The adapter may already be unavailable. */ }
  }

  function cancelConnection() {
    if (!state.isConnecting) return;
    const task = state.connectionTask;
    const selecting = Boolean(task && !task.device);
    state.connectionTask = null;
    task?.cancel();
    state.isConnecting = false;
    if (!selecting) {
      state.manualDisconnect = true;
      state.connectionRun += 1;
      state.isConnected = false;
      state.service = null;
      state.server = null;
      clearConnectionResources();
      stopGatt(task?.device || state.device);
    }
    setConnectionStatus(state.isConnected ? 'connected' : 'disconnected', t(state.isConnected ? 'status.connected' : 'connection.disconnected'));
    elements.retryMessage.textContent = t(state.isConnected ? (elements.autoRetry.checked ? 'retry.ready' : 'retry.active') : 'retry.cancelled');
    setConnectionControls();
    log(t('log.connectionCancelled'));
  }

  function isRetryable(error) {
    return !['NotFoundError', 'NotSupportedError', 'SecurityError', 'NotAllowedError', 'TypeError'].includes(error?.name);
  }

  function describeError(error) {
    if (!error) return t('error.unknown');
    const known = {
      NetworkError: 'error.network', NotFoundError: 'error.notFound', NotSupportedError: 'error.notSupported',
      SecurityError: 'error.security', NotAllowedError: 'error.notAllowed'
    };
    return known[error.name] ? t(known[error.name]) : error.message || String(error);
  }

  async function writeCharacteristic(characteristic, value) {
    if (typeof characteristic.writeValueWithResponse === 'function') await characteristic.writeValueWithResponse(value);
    else await characteristic.writeValue(value);
  }

  function connectionContext() {
    return { run: state.connectionRun, device: state.device, service: state.service };
  }

  function isCurrentConnection(context) {
    return state.isConnected && context.run === state.connectionRun
      && context.device === state.device && context.service === state.service;
  }

  function clearConnectionResources() {
    state.dataCharacteristic?.removeEventListener('characteristicvaluechanged', handleMeasurement);
    state.dataCharacteristic = null;
    state.cancelHistoryCollection?.();
    state.cancelHistoryCollection = null;
    state.historyCharacteristic = null;
    if (state.historyLoading) elements.historyStatus.textContent = t('history.statusDefault');
    setHistoryLoading(false);
    elements.syncBtn.classList.remove('is-loading');
  }

  async function chooseDevice(expectedId = null, expectedName = '') {
    if (!state.bluetoothUsable || state.isConnecting) return;
    const task = startConnectionTask();
    state.isConnecting = true;
    setConnectionStatus('connecting', t('status.selecting'));
    setConnectionControls();
    elements.retryMessage.textContent = t('retry.select');
    log(t('log.chooser'));

    let selectedDevice = null;
    try {
      selectedDevice = await connectionStep(navigator.bluetooth.requestDevice({
        filters: [{ namePrefix: 'LYWSD02' }],
        optionalServices: [UUIDS.service]
      }), task);
      if (expectedId && selectedDevice.id !== expectedId) {
        log(t('retry.mismatch', { name: expectedName || displayNameForId(expectedId) }), 'warning');
        selectedDevice = null;
      }
    } catch (error) {
      if (task.cancelled) return;
      log(error?.name === 'NotFoundError' ? t('log.selectionCancelled') : t('log.selectionFailed', { error: describeError(error) }), error?.name === 'NotFoundError' ? 'warning' : 'error');
    } finally {
      if (state.connectionTask === task) {
        state.connectionTask = null;
        state.isConnecting = false;
        if (!selectedDevice) {
          setConnectionStatus(state.isConnected ? 'connected' : 'disconnected', t(state.isConnected ? 'status.connected' : 'connection.disconnected'));
          elements.retryMessage.textContent = t(state.isConnected ? (elements.autoRetry.checked ? 'retry.ready' : 'retry.active') : 'retry.none');
        }
        setConnectionControls();
      }
    }
    if (selectedDevice && !task.cancelled) await connectToDevice(selectedDevice, expectedId ? 'history' : 'selection');
  }

  async function connectToDevice(device, reason = 'manual') {
    if (!device || state.isConnecting) return false;
    if (state.isConnected) persistDeviceSnapshot(true);
    const previousDevice = state.device;
    const changedDevice = previousDevice?.id !== device.id;
    state.connectionRun += 1;
    const run = state.connectionRun;
    const task = startConnectionTask(device);
    state.isConnecting = true;
    state.isConnected = false;
    clearConnectionResources();
    if (previousDevice && previousDevice !== device) {
      previousDevice.removeEventListener('gattserverdisconnected', handleGattDisconnected);
      if (previousDevice.gatt?.connected) previousDevice.gatt.disconnect();
    }
    if (changedDevice) {
      resetMeasurements();
    }
    bindDevice(device);
    if (changedDevice) resetHistory();
    state.manualDisconnect = false;
    state.service = null;
    state.server = null;
    setConnectionControls();
    const maxAttempts = elements.autoRetry.checked ? RETRY_DELAYS.length + 1 : 1;
    let lastError = null;
    let attempts = 0;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      if (run !== state.connectionRun || task.cancelled || state.manualDisconnect) break;
      if (attempt > 0) {
        if (!elements.autoRetry.checked) break;
        const delay = RETRY_DELAYS[attempt - 1];
        setConnectionStatus('connecting', t('status.retry', { current: attempt + 1, total: maxAttempts }));
        elements.retryMessage.textContent = t('retry.scheduled', { seconds: Math.round(delay / 1000) });
        try { await waitForRetry(delay, task); }
        catch (error) { if (task.cancelled) return false; throw error; }
        if (run !== state.connectionRun || state.manualDisconnect || !elements.autoRetry.checked) break;
      } else {
        setConnectionStatus('connecting', t('status.connecting'));
        elements.retryMessage.textContent = t(reason === 'reconnect' ? 'retry.reconnectAttempt' : 'retry.attempt', { total: maxAttempts });
      }

      try {
        attempts += 1;
        await establishConnection(device, run, task);
        if (run !== state.connectionRun) return false;
        if (!device.gatt.connected) throw Object.assign(new Error('Bluetooth disconnected during setup'), { name: 'NetworkError' });
        state.isConnected = true;
        state.isConnecting = false;
        if (state.connectionTask === task) state.connectionTask = null;
        setConnectionStatus('connected', t('status.connected'));
        elements.retryMessage.textContent = t(elements.autoRetry.checked ? 'retry.ready' : 'retry.active');
        recordSuccessfulConnection(device);
        setConnectionControls();
        log(t('log.connected', { name: deviceDisplayName(device) }), 'success');
        await readInitialValues(connectionContext());
        if (run !== state.connectionRun || !state.isConnected) return false;
        await refreshGrantedDevices();
        return true;
      } catch (error) {
        if (run !== state.connectionRun || task.cancelled) return false;
        lastError = error;
        state.isConnected = false;
        state.service = null;
        state.server = null;
        clearConnectionResources();
        stopGatt(device);
        if (attempt >= maxAttempts - 1 || !elements.autoRetry.checked || !isRetryable(error)) break;
        log(t('log.attemptFailed', { attempt: attempt + 1, error: describeError(error) }), 'warning');
      }
    }

    if (run === state.connectionRun) {
      if (state.connectionTask === task) state.connectionTask = null;
      state.isConnecting = false;
      state.isConnected = false;
      setConnectionStatus('disconnected', t('status.failed'));
      elements.retryMessage.textContent = t('retry.failure', { count: attempts });
      setConnectionControls();
      log(t('log.connectionFailed', { error: describeError(lastError) }), 'error');
    }
    return false;
  }

  async function establishConnection(device, run, task) {
    const connecting = Promise.resolve(device.gatt.connected ? device.gatt : device.gatt.connect());
    void connecting.then(() => {
      const reusedByCurrentConnection = state.device?.id === device.id
        && (state.isConnected || (state.isConnecting && state.connectionTask?.device?.id === device.id));
      if (run !== state.connectionRun && !reusedByCurrentConnection) stopGatt(device);
    }, () => {});
    const server = await connectionStep(connecting, task);
    if (run !== state.connectionRun) return;
    const service = await connectionStep(server.getPrimaryService(UUIDS.service), task);
    if (run !== state.connectionRun) return;
    const dataCharacteristic = await connectionStep(service.getCharacteristic(UUIDS.measurements), task);
    if (run !== state.connectionRun) return;
    state.dataCharacteristic = dataCharacteristic;
    dataCharacteristic.addEventListener('characteristicvaluechanged', handleMeasurement);
    await connectionStep(dataCharacteristic.startNotifications(), task);
    if (run !== state.connectionRun) {
      if (state.dataCharacteristic !== dataCharacteristic) dataCharacteristic.removeEventListener('characteristicvaluechanged', handleMeasurement);
      return;
    }
    state.server = server;
    state.service = service;
    state.dataCharacteristic = dataCharacteristic;
  }

  async function readInitialValues(context) {
    let drift = null;
    const tasks = [
      [t('read.battery'), () => readBattery(context)],
      [t('read.unit'), () => readDeviceUnit(context)],
      [t('read.time'), async () => { drift = await readDeviceTime(false, context); }]
    ];
    for (const [label, task] of tasks) {
      if (!isCurrentConnection(context)) return;
      try { await task(); }
      catch (error) {
        if (isCurrentConnection(context)) log(t('log.readUnavailable', { label, error: describeError(error) }), 'warning');
      }
    }
    if (!isCurrentConnection(context)) return;
    persistDeviceSnapshot(true);
    if (elements.autoSyncClock.checked && drift !== null && Math.abs(drift) > 10) await syncTime(true, context);
  }

  function handleGattDisconnected(event) {
    if (event.target !== state.device) return;
    if (state.isConnected) persistDeviceSnapshot(true);
    state.isConnected = false;
    state.service = null;
    state.server = null;
    clearConnectionResources();
    setConnectionControls();
    if (state.manualDisconnect || state.isConnecting) return;
    setConnectionStatus('disconnected', t('status.lost'));
    log(t('log.interrupted'), 'warning');
    if (elements.autoRetry.checked) void connectToDevice(event.target, 'reconnect');
    else elements.retryMessage.textContent = t('retry.disabled');
  }

  function disconnectManually() {
    if (state.isConnecting) {
      cancelConnection();
      return;
    }
    if (!state.device) return;
    if (state.isConnected) persistDeviceSnapshot(true);
    state.manualDisconnect = true;
    state.connectionRun += 1;
    state.isConnecting = false;
    state.isConnected = false;
    state.service = null;
    state.server = null;
    clearConnectionResources();
    stopGatt(state.device);
    setConnectionStatus('disconnected', t('connection.disconnected'));
    elements.retryMessage.textContent = t('retry.manual');
    setConnectionControls();
    log(t('log.disconnected'));
  }

  function handleMeasurement(event) {
    if (event.target !== state.dataCharacteristic) return;
    const value = event.target.value;
    if (!value || value.byteLength < 3) {
      log(t('log.invalidMeasurement'), 'warning');
      return;
    }
    state.lastTemperatureC = value.getInt16(0, true) / 100;
    state.lastHumidity = value.getUint8(2);
    state.measurements += 1;
    renderTemperature();
    renderHumidity(state.lastHumidity);
    elements.tempTimestamp.textContent = nowLabel();
    elements.humTimestamp.textContent = nowLabel();
    elements.updateCount.textContent = t('metric.updates', { count: state.measurements });
    persistDeviceSnapshot();
  }

  function selectedUnit() {
    return document.querySelector('input[name="unit"]:checked')?.value || 'C';
  }

  function renderTemperature() {
    if (state.lastTemperatureC === null) return;
    const fahrenheit = selectedUnit() === 'F';
    const value = fahrenheit ? (state.lastTemperatureC * 9 / 5) + 32 : state.lastTemperatureC;
    elements.temperature.textContent = `${formatNumber(value)} °${fahrenheit ? 'F' : 'C'}`;
  }

  function renderHumidity(humidity) {
    const bounded = Math.max(0, Math.min(100, humidity));
    elements.humidity.textContent = `${new Intl.NumberFormat(localeTag()).format(humidity)} %`;
    elements.humidityBar.style.width = `${bounded}%`;
  }

  async function readBattery(context = connectionContext()) {
    if (!isCurrentConnection(context)) return;
    const characteristic = await context.service.getCharacteristic(UUIDS.battery);
    if (!isCurrentConnection(context)) return;
    const value = await characteristic.readValue();
    if (!isCurrentConnection(context)) return;
    const level = value.getUint8(0);
    state.lastBattery = level;
    elements.battery.textContent = `${new Intl.NumberFormat(localeTag()).format(level)} %`;
    elements.batteryBar.style.width = `${Math.max(0, Math.min(100, level))}%`;
    elements.batTimestamp.textContent = nowLabel();
    elements.batteryHint.textContent = t(level <= 20 ? 'metric.batteryLow' : 'metric.remaining');
    elements.batteryBar.style.backgroundColor = level <= 20 ? 'var(--red)' : level <= 50 ? 'var(--amber)' : 'var(--green)';
  }

  async function readDeviceUnit(context = connectionContext()) {
    if (!isCurrentConnection(context)) return;
    const characteristic = await context.service.getCharacteristic(UUIDS.unit);
    if (!isCurrentConnection(context)) return;
    const value = await characteristic.readValue();
    if (!isCurrentConnection(context)) return;
    const unit = value.getUint8(0) === 0x01 ? 'F' : 'C';
    const radio = document.querySelector(`input[name="unit"][value="${unit}"]`);
    if (radio) radio.checked = true;
    renderTemperature();
  }

  function formatTimezone(totalMinutes) {
    const sign = totalMinutes >= 0 ? '+' : '-';
    const absolute = Math.abs(totalMinutes);
    return `UTC${sign}${String(Math.floor(absolute / 60)).padStart(2, '0')}:${String(absolute % 60).padStart(2, '0')}`;
  }

  function nearestTimezoneOffset(minutes) {
    return TIMEZONE_OFFSETS.reduce((nearest, offset) => Math.abs(offset - minutes) < Math.abs(nearest - minutes) ? offset : nearest, 0);
  }

  function desiredTimezoneMinutes() {
    return Number(elements.timezone.value || 0);
  }

  function driftText(drift) {
    const seconds = Math.abs(Math.round(drift));
    if (seconds <= 1) return t('drift.synced');
    return t(drift > 0 ? 'drift.ahead' : 'drift.behind', { seconds: new Intl.NumberFormat(localeTag()).format(seconds) });
  }

  async function readDeviceTime(announce = true, context = connectionContext()) {
    if (!isCurrentConnection(context)) return null;
    const characteristic = await context.service.getCharacteristic(UUIDS.time);
    if (!isCurrentConnection(context)) return null;
    const value = await characteristic.readValue();
    if (!isCurrentConnection(context)) return null;
    if (value.byteLength < 4) throw new Error(t('error.timeIncomplete'));
    const timestamp = value.getUint32(0, true);
    const timezoneHours = value.byteLength >= 5 ? value.getInt8(4) : 0;
    const localEpoch = timestamp + timezoneHours * 3600;
    const nowEpoch = Math.floor(Date.now() / 1000);
    const desiredOffset = desiredTimezoneMinutes();
    const drift = localEpoch - nowEpoch - desiredOffset * 60;
    const approximateOffset = Math.round((localEpoch - nowEpoch) / 60);
    const inferredOffset = nearestTimezoneOffset(approximateOffset);
    state.clockDrift = drift;
    state.deviceTimezoneMinutes = Math.abs(approximateOffset - inferredOffset) <= 5 ? inferredOffset : timezoneHours * 60;

    const isTwelveHour = document.querySelector('input[name="clockMode"]:checked')?.value === '12';
    elements.deviceTime.textContent = new Intl.DateTimeFormat(localeTag(), {
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: isTwelveHour, timeZone: 'UTC'
    }).format(new Date(localEpoch * 1000));
    elements.deviceTimeZone.textContent = formatTimezone(state.deviceTimezoneMinutes);
    elements.deviceTimeDrift.textContent = t('metric.drift', { value: driftText(drift) });
    if (announce) log(t('log.timeRefreshed'), 'success');
    return drift;
  }

  async function syncTime(automatic = false, context = connectionContext()) {
    if (!isCurrentConnection(context)) return;
    elements.syncBtn.disabled = true;
    elements.syncBtn.classList.add('is-loading');
    try {
      const characteristic = await context.service.getCharacteristic(UUIDS.time);
      if (!isCurrentConnection(context)) return;
      const desiredOffset = desiredTimezoneMinutes();
      const timezoneByte = Math.floor(desiredOffset / 60);
      const minuteRemainder = desiredOffset - timezoneByte * 60;
      const correctionSeconds = automatic ? 0 : Number(elements.offsetMinutes.value || 0) * 60;
      const timestamp = Math.floor(Date.now() / 1000) + minuteRemainder * 60 + correctionSeconds;
      const timePayload = new ArrayBuffer(5);
      const timeView = new DataView(timePayload);
      timeView.setUint32(0, timestamp, true);
      timeView.setInt8(4, timezoneByte);
      await writeCharacteristic(characteristic, timePayload);
      if (!isCurrentConnection(context)) return;

      const clockMode = document.querySelector('input[name="clockMode"]:checked')?.value || '24';
      const modePayload = new Uint8Array(7);
      modePayload[6] = clockMode === '12' ? 0xaa : 0x00;
      await writeCharacteristic(characteristic, modePayload);
      if (!isCurrentConnection(context)) return;
      state.deviceTimezoneMinutes = desiredOffset;
      log(automatic ? t('log.autoTimeSynced') : t('log.timeSynced', { mode: clockMode, timezone: formatTimezone(desiredOffset) }), 'success');
      await wait(250);
      await readDeviceTime(false, context);
    } catch (error) {
      if (isCurrentConnection(context)) log(t('log.timeSyncFailed', { error: describeError(error) }), 'error');
    } finally {
      if (context.run === state.connectionRun) {
        elements.syncBtn.classList.remove('is-loading');
        elements.syncBtn.disabled = !state.isConnected;
      }
    }
  }

  async function updateUnit() {
    const context = connectionContext();
    if (!isCurrentConnection(context)) return;
    elements.unitBtn.disabled = true;
    try {
      const unit = selectedUnit();
      const characteristic = await context.service.getCharacteristic(UUIDS.unit);
      if (!isCurrentConnection(context)) return;
      await writeCharacteristic(characteristic, new Uint8Array([unit === 'F' ? 0x01 : 0xff]));
      if (!isCurrentConnection(context)) return;
      renderTemperature();
      log(t('log.unitSet', { unit }), 'success');
    } catch (error) {
      if (isCurrentConnection(context)) log(t('log.unitFailed', { error: describeError(error) }), 'error');
    } finally {
      if (context.run === state.connectionRun) elements.unitBtn.disabled = !state.isConnected;
    }
  }

  function parseHistoryRecord(value) {
    if (!value || value.byteLength < 14) return null;
    return {
      index: value.getUint32(0, true), timestamp: value.getUint32(4, true),
      maxTemperature: value.getInt16(8, true) / 100, maxHumidity: value.getUint8(10),
      minTemperature: value.getInt16(11, true) / 100, minHumidity: value.getUint8(13)
    };
  }

  async function collectHistory(characteristic, expectedCount, context) {
    const records = new Map();
    let idleTimer;
    let hardTimer;
    let finishCollection;
    const completed = new Promise((resolve) => {
      finishCollection = () => {
        clearTimeout(idleTimer);
        clearTimeout(hardTimer);
        resolve([...records.values()]);
      };
      hardTimer = setTimeout(finishCollection, 35000);
    });
    const resetIdleTimer = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(finishCollection, 4500);
    };
    const handleRecord = (event) => {
      if (!isCurrentConnection(context)) return;
      const record = parseHistoryRecord(event.target.value);
      if (!record) return;
      records.set(record.index, record);
      if (records.size >= expectedCount) finishCollection();
      else resetIdleTimer();
    };
    characteristic.addEventListener('characteristicvaluechanged', handleRecord);
    state.cancelHistoryCollection = finishCollection;
    try {
      await characteristic.startNotifications();
      if (!isCurrentConnection(context)) return [];
      resetIdleTimer();
      return await completed;
    } finally {
      characteristic.removeEventListener('characteristicvaluechanged', handleRecord);
      clearTimeout(idleTimer);
      clearTimeout(hardTimer);
      if (state.cancelHistoryCollection === finishCollection) state.cancelHistoryCollection = null;
      if (isCurrentConnection(context) && context.device?.gatt?.connected && typeof characteristic.stopNotifications === 'function') {
        try { await characteristic.stopNotifications(); } catch { /* Disconnection already closes the stream. */ }
      }
    }
  }

  function setHistoryLoading(loading) {
    state.historyLoading = loading;
    elements.loadHistoryBtn.classList.toggle('is-loading', loading);
    elements.loadHistoryBtn.disabled = loading || !state.isConnected;
    elements.historyLimit.disabled = loading || !state.isConnected;
  }

  async function loadHistory() {
    const context = connectionContext();
    if (!isCurrentConnection(context) || state.historyLoading) return;
    setHistoryLoading(true);
    elements.historyStatus.textContent = t('history.reading');
    log(t('log.historyReading'));
    try {
      const countCharacteristic = await context.service.getCharacteristic(UUIDS.recordCount);
      if (!isCurrentConnection(context)) return;
      const countValue = await countCharacteristic.readValue();
      if (!isCurrentConnection(context)) return;
      if (countValue.byteLength < 8) throw new Error(t('error.historyIncomplete'));
      const totalRecords = countValue.getUint32(0, true);
      const storedRecords = countValue.getUint32(4, true);
      if (storedRecords === 0) {
        state.historyRecords = [];
        renderHistory();
        elements.historyStatus.textContent = t('history.none');
        log(t('log.historyNone'), 'warning');
        return;
      }
      const expected = Math.min(Number(elements.historyLimit.value), storedRecords);
      const indexPayload = new ArrayBuffer(4);
      new DataView(indexPayload).setUint32(0, Math.max(0, totalRecords - expected + 1), true);
      const indexCharacteristic = await context.service.getCharacteristic(UUIDS.recordIndex);
      if (!isCurrentConnection(context)) return;
      await writeCharacteristic(indexCharacteristic, indexPayload);
      if (!isCurrentConnection(context)) return;
      const historyCharacteristic = await context.service.getCharacteristic(UUIDS.history);
      if (!isCurrentConnection(context)) return;
      state.historyCharacteristic = historyCharacteristic;
      const records = await collectHistory(historyCharacteristic, expected, context);
      if (!isCurrentConnection(context)) return;
      state.historyRecords = records;
      state.historyRecords.sort((left, right) => right.index - left.index);
      renderHistory();
      elements.historyStatus.textContent = t('history.loaded', { count: state.historyRecords.length, stored: storedRecords });
      log(t('log.historyLoaded', { count: state.historyRecords.length }), state.historyRecords.length ? 'success' : 'warning');
    } catch (error) {
      if (isCurrentConnection(context)) {
        elements.historyStatus.textContent = t('history.failed');
        log(t('log.historyFailed', { error: describeError(error) }), 'error');
      }
    } finally {
      if (context.run === state.connectionRun) setHistoryLoading(false);
    }
  }

  function renderHistory() {
    elements.historyTableBody.replaceChildren();
    const count = state.historyRecords.length;
    elements.historyCount.textContent = t('history.count', { count });
    elements.exportHistoryBtn.disabled = count === 0;
    elements.historyTableWrap.hidden = count === 0;
    elements.historyEmpty.hidden = count > 0;
    if (count === 0) {
      elements.historyEmpty.querySelector('p').textContent = t('history.empty');
      return;
    }
    const dateFormatter = new Intl.DateTimeFormat(localeTag(), { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    const fragment = document.createDocumentFragment();
    state.historyRecords.forEach((record) => {
      const row = document.createElement('tr');
      [
        dateFormatter.format(new Date(record.timestamp * 1000)),
        `${formatNumber(record.minTemperature)} °C`, `${formatNumber(record.maxTemperature)} °C`,
        `${record.minHumidity}–${record.maxHumidity} %`
      ].forEach((value) => {
        const cell = document.createElement('td');
        cell.textContent = value;
        row.append(cell);
      });
      fragment.append(row);
    });
    elements.historyTableBody.append(fragment);
  }

  function exportHistory() {
    if (!state.historyRecords.length) return;
    const rows = [
      ['date_iso', 'temperature_min_c', 'temperature_max_c', 'humidity_min_pct', 'humidity_max_pct'],
      ...state.historyRecords.map((record) => [new Date(record.timestamp * 1000).toISOString(), record.minTemperature.toFixed(2), record.maxTemperature.toFixed(2), record.minHumidity, record.maxHumidity])
    ];
    const blob = new Blob([`\ufeff${rows.map((row) => row.join(';')).join('\n')}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const alias = deviceDisplayName(state.device).replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
    link.href = url;
    link.download = `lywsd02-${alias || 'sensor'}-history.csv`;
    link.click();
    URL.revokeObjectURL(url);
    log(t('log.historyExported'), 'success');
  }

  async function refreshGrantedDevices() {
    state.grantedDevices.clear();
    if (state.bluetoothUsable && typeof navigator.bluetooth.getDevices === 'function') {
      try {
        const devices = await navigator.bluetooth.getDevices();
        devices.filter((device) => !device.name || device.name.startsWith('LYWSD02')).forEach((device) => state.grantedDevices.set(device.id, device));
      } catch {
        state.grantedDevices.clear();
      }
    }
    renderDeviceHistory();
  }

  function resolveHistoryDevice(id) {
    if (state.device?.id === id) return state.device;
    return state.grantedDevices.get(id) || null;
  }

  function formatLastConnected(timestamp) {
    if (!timestamp) return '—';
    return new Intl.DateTimeFormat(localeTag(), { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(timestamp));
  }

  function renderDeviceHistory() {
    if (!elements.knownDevicesList) return;
    elements.knownDevicesList.replaceChildren();
    const records = Object.values(state.deviceHistory).sort((left, right) => right.lastConnected - left.lastConnected);
    if (!records.length) {
      const empty = document.createElement('li');
      empty.className = 'device-history-empty';
      empty.textContent = t('devices.empty');
      elements.knownDevicesList.append(empty);
      return;
    }

    const fragment = document.createDocumentFragment();
    records.forEach((record) => {
      const device = resolveHistoryDevice(record.id);
      const item = document.createElement('li');
      item.className = 'known-device';
      const identity = document.createElement('span');
      identity.className = 'known-device__identity';
      const name = document.createElement('strong');
      name.textContent = displayNameForId(record.id, record.name);
      const id = document.createElement('small');
      id.className = 'known-device__id';
      id.textContent = `ID ${shortDeviceId(record.id)}`;
      const last = document.createElement('small');
      last.textContent = t('devices.lastConnected', { date: formatLastConnected(record.lastConnected) });
      const details = document.createElement('small');
      const measurements = [];
      if (Number.isFinite(record.lastTemperatureC)) measurements.push(`${formatNumber(record.lastTemperatureC, 1)} °C`);
      if (Number.isFinite(record.lastHumidity)) measurements.push(`${record.lastHumidity} %`);
      if (Number.isFinite(record.lastBattery)) measurements.push(`🔋 ${record.lastBattery} %`);
      details.textContent = [t('devices.connections', { count: record.connections }), ...measurements].join(' · ');
      identity.append(name, id, last, details);

      const actions = document.createElement('span');
      actions.className = 'known-device__actions';
      const connect = document.createElement('button');
      connect.type = 'button';
      connect.textContent = device ? t('devices.reconnect') : t('devices.reselect');
      connect.disabled = !state.bluetoothUsable || state.isConnecting || Boolean(device?.gatt?.connected);
      connect.addEventListener('click', () => device ? void connectToDevice(device, 'history') : void chooseDevice(record.id, displayNameForId(record.id, record.name)));
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'known-device__remove';
      remove.title = t('devices.remove');
      remove.setAttribute('aria-label', t('devices.remove'));
      remove.disabled = state.device?.id === record.id && state.isConnected;
      const removeIcon = document.createElement('i');
      removeIcon.setAttribute('data-lucide', 'trash-2');
      removeIcon.setAttribute('aria-hidden', 'true');
      remove.append(removeIcon);
      remove.addEventListener('click', () => removeDeviceHistory(record.id));
      actions.append(connect, remove);
      item.append(identity, actions);
      fragment.append(item);
    });
    elements.knownDevicesList.append(fragment);
    refreshIcons();
  }

  function removeDeviceHistory(id) {
    const name = displayNameForId(id, state.deviceHistory[id]?.name);
    delete state.deviceHistory[id];
    delete state.aliases[id];
    storeObject(DEVICE_HISTORY_KEY, state.deviceHistory);
    storeObject(ALIASES_KEY, state.aliases);
    renderDeviceIdentity();
    renderDeviceHistory();
    log(t('log.removed', { name }));
  }

  function openRenameDialog() {
    if (!state.device) return;
    elements.deviceAlias.value = state.deviceHistory[state.device.id]?.alias || state.aliases[state.device.id] || '';
    elements.renameDialog.showModal();
    elements.deviceAlias.focus();
  }

  function saveDeviceAlias(event) {
    event.preventDefault();
    if (!state.device) return;
    const alias = elements.deviceAlias.value.trim();
    if (!alias) return elements.deviceAlias.focus();
    state.aliases[state.device.id] = alias;
    const record = historyRecord(state.device.id, state.device.name || 'LYWSD02');
    state.deviceHistory[state.device.id] = { ...record, alias };
    storeObject(ALIASES_KEY, state.aliases);
    storeObject(DEVICE_HISTORY_KEY, state.deviceHistory);
    renderDeviceIdentity();
    renderDeviceHistory();
    elements.renameDialog.close();
    log(t('log.renamed', { name: alias }), 'success');
  }

  function updateOffset(value) {
    const bounded = Math.max(-120, Math.min(120, Number(value) || 0));
    elements.offsetMinutes.value = String(bounded);
    elements.offsetMinutesRange.value = String(bounded);
    elements.offsetOutput.textContent = `${bounded > 0 ? '+' : ''}${bounded} min`;
  }

  function localizedPublishedUrl() {
    const url = new URL(BASE_URL);
    const locale = window.LYWSD02_I18N?.locale() || 'en';
    if (locale !== 'en') url.searchParams.set('lang', locale);
    return url.href;
  }

  async function copyCanonicalAddress() {
    try {
      const address = localizedPublishedUrl();
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(address);
      else {
        const textArea = document.createElement('textarea');
        textArea.value = address;
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.append(textArea);
        textArea.select();
        document.execCommand('copy');
        textArea.remove();
      }
      elements.copyAddressStatus.textContent = t('copy.success');
    } catch {
      elements.copyAddressStatus.textContent = t('copy.failure');
    }
  }

  function populateTimezones() {
    const localOffset = Math.round(-(new Date().getTimezoneOffset()));
    elements.timezone.replaceChildren();
    const systemOption = document.createElement('option');
    systemOption.value = String(localOffset);
    systemOption.textContent = `${t('settings.systemTimezone')} (${formatTimezone(localOffset)})`;
    elements.timezone.append(systemOption);
    TIMEZONE_OFFSETS.forEach((offset) => {
      const option = document.createElement('option');
      option.value = String(offset);
      option.textContent = formatTimezone(offset);
      elements.timezone.append(option);
    });
    elements.timezone.value = String(localOffset);
  }

  async function initializeBluetooth() {
    if (!window.isSecureContext) {
      setCompatibilityNotice(t('compat.httpsTitle'), t('compat.httpsText'));
      setConnectionStatus('disconnected', t('status.https'));
      setConnectionControls();
      return;
    }
    if (!('bluetooth' in navigator)) {
      setCompatibilityNotice(t('compat.browserTitle'), t('compat.browserText'));
      setConnectionStatus('disconnected', t('status.incompatible'));
      setConnectionControls();
      return;
    }
    state.bluetoothUsable = true;
    clearCompatibilityNotice();
    if (typeof navigator.bluetooth.getAvailability === 'function') {
      try { state.bluetoothUsable = await navigator.bluetooth.getAvailability(); }
      catch { state.bluetoothUsable = true; }
    }
    if (!state.bluetoothUsable) {
      setCompatibilityNotice(t('compat.bluetoothTitle'), t('compat.bluetoothText'));
      setConnectionStatus('disconnected', t('status.bluetoothOff'));
    } else log(t('log.ready'), 'success');

    navigator.bluetooth.addEventListener?.('availabilitychanged', (event) => {
      state.bluetoothUsable = event.value;
      if (event.value) {
        clearCompatibilityNotice();
        if (!state.isConnecting && !state.isConnected) setConnectionStatus('disconnected', t('connection.disconnected'));
        log(t('log.adapterAvailable'), 'success');
      } else {
        setCompatibilityNotice(t('compat.bluetoothTitle'), t('compat.bluetoothText'));
        setConnectionStatus('disconnected', t('status.bluetoothOff'));
      }
      setConnectionControls();
    });
    setConnectionControls();
    await refreshGrantedDevices();
  }

  function attachEvents() {
    document.querySelectorAll('[data-language-select]').forEach((select) => {
      select.value = window.LYWSD02_I18N?.locale() || 'en';
      select.addEventListener('change', (event) => window.LYWSD02_I18N?.setLocale(event.target.value));
    });
    elements.copyAddressBtn?.addEventListener('click', copyCanonicalAddress);
    elements.currentYear.textContent = String(new Date().getFullYear());
    if (document.documentElement.classList.contains('is-phone')) return;

    elements.connectBtn.addEventListener('click', () => {
      if (state.isConnecting) cancelConnection();
      else if (state.isConnected) disconnectManually();
      else void chooseDevice();
    });
    window.addEventListener('pagehide', () => {
      if (state.isConnected) persistDeviceSnapshot(true);
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden' && state.isConnected) persistDeviceSnapshot(true);
    });
    elements.renameBtn.addEventListener('click', openRenameDialog);
    elements.renameForm.addEventListener('submit', saveDeviceAlias);
    elements.closeRenameBtn.addEventListener('click', () => elements.renameDialog.close());
    elements.cancelRenameBtn.addEventListener('click', () => elements.renameDialog.close());
    elements.clearLogs.addEventListener('click', resetLogs);
    elements.refreshTimeBtn.addEventListener('click', () => {
      const context = connectionContext();
      void readDeviceTime(true, context).catch((error) => {
        if (isCurrentConnection(context)) log(t('log.readUnavailable', { label: t('read.time'), error: describeError(error) }), 'warning');
      });
    });
    elements.syncBtn.addEventListener('click', () => void syncTime(false));
    elements.unitBtn.addEventListener('click', () => void updateUnit());
    elements.loadHistoryBtn.addEventListener('click', () => void loadHistory());
    elements.exportHistoryBtn.addEventListener('click', exportHistory);
    elements.offsetMinutesRange.addEventListener('input', (event) => updateOffset(event.target.value));
    elements.offsetMinutes.addEventListener('input', (event) => updateOffset(event.target.value));
    document.querySelectorAll('input[name="unit"]').forEach((radio) => radio.addEventListener('change', renderTemperature));
    elements.timezone.addEventListener('change', () => {
      const offset = desiredTimezoneMinutes();
      if (offset % 60 !== 0) log(t('log.fractionalZone', { timezone: formatTimezone(offset) }));
    });
    elements.autoRetry.addEventListener('change', () => {
      storeBoolean(AUTO_RETRY_KEY, elements.autoRetry.checked);
      if (!elements.autoRetry.checked) state.connectionTask?.wakeRetry?.();
      elements.retryMessage.textContent = t(elements.autoRetry.checked ? 'retry.on' : 'retry.off');
    });
    elements.autoSyncClock.addEventListener('change', () => {
      storeBoolean(AUTO_CLOCK_KEY, elements.autoSyncClock.checked);
      if (elements.autoSyncClock.checked && state.isConnected && state.clockDrift !== null && Math.abs(state.clockDrift) > 10) void syncTime(true);
    });
  }

  function initialize() {
    refreshIcons();
    attachEvents();
    if (document.documentElement.classList.contains('is-phone')) return;
    elements.autoRetry.checked = readStoredBoolean(AUTO_RETRY_KEY, true);
    elements.autoSyncClock.checked = readStoredBoolean(AUTO_CLOCK_KEY, true);
    populateTimezones();
    updateOffset(0);
    resetMeasurements();
    resetHistory();
    renderDeviceHistory();
    setConnectionControls();
    void initializeBluetooth();
  }

  initialize();
})();
