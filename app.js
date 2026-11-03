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

  const DEVICE_NAME_PREFIXES = ['LYWSD02', 'MHO-C303'];
  const EXTRA_PROFILES = ['pvvx', 'cgd1', 'lywsdcgq', 'lywsd03', 'flowercare', 'ropot', 'cgg1', 'cgdk2'];
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
    currentYear: byId('currentYear'),
    deviceAlias: byId('deviceAlias'),
    deviceId: byId('deviceId'),
    deviceLabel: byId('deviceLabel'),
    deviceProfile: byId('deviceProfile'),
    pairingToken: byId('pairingToken'),
    deviceTime: byId('deviceTime'),
    deviceTimeDrift: byId('deviceTimeDrift'),
    deviceTimeZone: byId('deviceTimeZone'),
    exportHistoryBtn: byId('exportHistoryBtn'),
    historyCount: byId('historyCount'),
    historyEmpty: byId('historyEmpty'),
    historyLimit: byId('historyLimit'),
    historyStatus: byId('historyStatus'),
    historyChart: byId('historyChart'),
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

  const { readStoredObject, readStoredBoolean, storeObject, storeBoolean, normalizeDeviceHistory } = window.DASHBOARD_STORAGE.create({
    storage: () => localStorage, profiles: EXTRA_PROFILES, onError: () => log(t('log.storage'), 'warning')
  });

  const legacyAliases = readStoredObject(ALIASES_KEY);
  const state = {
    aliases: legacyAliases,
    adapter: null,
    protocolKind: 'stock',
    extraMeasurements: {},
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

  const view = window.DASHBOARD_VIEW.create({
    state, elements, t, localeTag, formatNumber, deviceDisplayName, log,
    resolveHistoryDevice, displayNameForId, shortDeviceId, refreshIcons,
    connectToDevice, chooseDevice, removeDeviceHistory, byId
  });

  const connections = window.DASHBOARD_CONNECTION.create({
    state, elements, UUIDS, EXTRA_PROFILES, DEVICE_NAME_PREFIXES, RETRY_DELAYS,
    t: (...args) => t(...args),
    log: (...args) => log(...args),
    setConnectionStatus: (...args) => setConnectionStatus(...args),
    setConnectionControls: (...args) => setConnectionControls(...args),
    deviceDisplayName: (...args) => deviceDisplayName(...args),
    displayNameForId: (...args) => displayNameForId(...args),
    persistDeviceSnapshot: (...args) => persistDeviceSnapshot(...args),
    recordSuccessfulConnection: (...args) => recordSuccessfulConnection(...args),
    resetMeasurements: (...args) => resetMeasurements(...args),
    resetHistory: (...args) => resetHistory(...args),
    renderDeviceIdentity: (...args) => renderDeviceIdentity(...args),
    describeError: (...args) => describeError(...args),
    readInitialValues: (...args) => readInitialValues(...args),
    refreshGrantedDevices: (...args) => refreshGrantedDevices(...args),
    renderTemperature: (...args) => renderTemperature(...args),
    renderHumidity: (...args) => renderHumidity(...args),
    nowLabel: (...args) => nowLabel(...args),
    renderExtraMeasurements: (...args) => renderExtraMeasurements(...args),
    handleMeasurement: (...args) => handleMeasurement(...args),
    setHistoryLoading: (...args) => setHistoryLoading(...args),
  });

  function t(key, values) {
    return window.LYWSD02_I18N?.t(key, values) ?? key;
  }

  function localeTag() {
    return window.LYWSD02_I18N?.localeTag() ?? 'en';
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
    if (type === 'error') showFeedback(message, 'error');
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
    if (mode === 'connecting' || mode === 'disconnected') {
      const feedback = byId('actionFeedback');
      if (feedback) feedback.hidden = true;
    }
  }

  function showFeedback(message, kind = 'success') {
    const feedback = byId('actionFeedback');
    if (!feedback) return;
    feedback.textContent = message;
    feedback.dataset.kind = kind;
    feedback.hidden = false;
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
    if (elements.deviceProfile) elements.deviceProfile.disabled = state.isConnected || state.isConnecting;
    const tokenField = byId('pairingTokenField');
    if (tokenField) tokenField.hidden = elements.deviceProfile?.value !== 'cgd1';
    if (state.adapter) {
      const capabilities = state.adapter.capabilities;
      elements.syncBtn.disabled = !state.isConnected;
      elements.unitBtn.disabled = !state.isConnected || !capabilities.unit;
      elements.loadHistoryBtn.disabled = !state.isConnected || state.historyLoading || !capabilities.history;
      elements.refreshTimeBtn.disabled = !state.isConnected || !capabilities.time || state.protocolKind === 'cgd1';
      elements.historyLimit.disabled = !state.isConnected || state.historyLoading || !capabilities.history;
      document.querySelectorAll('input[name="clockMode"]').forEach((control) => { control.disabled = !state.isConnected || !capabilities.format; });
      elements.autoSyncClock.disabled = !capabilities.time;
      elements.timezone.disabled = !state.isConnected || !capabilities.time;
      elements.offsetMinutes.disabled = !state.isConnected || !capabilities.time;
      elements.offsetMinutesRange.disabled = !state.isConnected || !capabilities.time;
    }
    if (!state.adapter) elements.autoSyncClock.disabled = false;
    const syncLabel = elements.syncBtn.querySelector('span');
    if (syncLabel) syncLabel.textContent = t(state.adapter && !state.adapter.capabilities.time ? 'protocol.refreshMeasurements' : 'settings.sync');
    view.updateWorkspaceVisibility();
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
    const record = historyRecord(state.device.id, state.device.name || 'LYWSD02');
    elements.deviceLabel.textContent = record.alias || state.aliases[state.device.id] || record.name;
    elements.deviceId.textContent = `ID · ${shortDeviceId(state.device.id)}`;
    elements.deviceId.title = state.device.id || '';
  }


  function recordSuccessfulConnection(device) {
    const previous = historyRecord(device.id, device.name || 'LYWSD02');
    state.deviceHistory[device.id] = {
      ...previous,
      id: device.id,
      name: device.name || previous.name || 'LYWSD02',
      profile: state.protocolKind,
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

  function renderExtraMeasurements() {
    return view.renderExtraMeasurements();
  }

  function resetMeasurements() {
    state.extraMeasurements = {};
    renderExtraMeasurements();
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
    updateHistoryLabels();
    view.clearHistoryChart();
    elements.historyEmpty.hidden = false;
    elements.historyEmpty.querySelector('p').textContent = state.device ? t('history.emptyLoaded') : t('history.emptyConnect');
    elements.historyCount.textContent = t('history.count', { count: 0 });
    elements.historyCount.hidden = true;
    elements.historyStatus.textContent = t(state.protocolKind === 'pvvx' ? 'protocol.sampleHistory' : 'history.statusDefault');
    elements.exportHistoryBtn.disabled = true;
  }

  function wait(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }





  function cancelConnection(...args) { return connections.cancelConnection(...args); }


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

  function connectionContext(...args) { return connections.connectionContext(...args); }

  function isCurrentConnection(...args) { return connections.isCurrentConnection(...args); }


  function chooseDevice(...args) { return connections.chooseDevice(...args); }

  function connectToDevice(...args) { return connections.connectToDevice(...args); }


  async function readInitialValues(context) {
    let drift = null;
    if (state.adapter) {
      const adapter = state.adapter;
      for (const operation of [() => adapter.startMeasurements(), ...(adapter.capabilities.unit ? [() => adapter.unit().then((unit) => {
        if (!isCurrentConnection(context)) return;
        const radio = document.querySelector(`input[name="unit"][value="${unit}"]`);
        if (radio) radio.checked = true;
      })] : []), async () => { drift = await readDeviceTime(false, context); }]) {
        if (!isCurrentConnection(context)) return;
        try { await operation(); }
        catch (error) { if (isCurrentConnection(context)) log(describeError(error), 'warning'); }
      }
      if (isCurrentConnection(context) && elements.autoSyncClock.checked && drift !== null && Math.abs(drift) > 10) await syncTime(true, context);
      return;
    }
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


  function disconnectManually(...args) { return connections.disconnectManually(...args); }

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
    if (state.adapter) {
      const reading = await state.adapter.readTime(desiredTimezoneMinutes());
      if (!isCurrentConnection(context) || !reading) return null;
      state.clockDrift = reading.drift;
      state.deviceTimezoneMinutes = reading.offset;
      elements.deviceTime.textContent = new Intl.DateTimeFormat(localeTag(), { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'UTC' }).format(new Date(reading.localEpoch * 1000));
      elements.deviceTimeZone.textContent = formatTimezone(reading.offset);
      elements.deviceTimeDrift.textContent = t('metric.drift', { value: driftText(reading.drift) });
      if (announce) log(t('log.timeRefreshed'), 'success');
      return reading.drift;
    }
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
    if (!automatic) showFeedback(t('ui.syncing'));
    elements.syncBtn.disabled = true;
    elements.syncBtn.classList.add('is-loading');
    try {
      if (state.adapter) {
        const adapter = state.adapter;
        if (!adapter.capabilities.time) {
          await adapter.refresh();
          if (isCurrentConnection(context)) showFeedback(t('ui.measurementsUpdated'));
          return;
        }
        const mode = document.querySelector('input[name="clockMode"]:checked')?.value || '24';
        await adapter.sync(desiredTimezoneMinutes(), automatic ? 0 : Number(elements.offsetMinutes.value || 0), adapter.capabilities.format ? mode : null);
        if (!isCurrentConnection(context)) return;
        log(t(adapter.kind === 'cgd1' ? 'protocol.clockAcknowledged' : 'log.autoTimeSynced'), 'success');
        await readDeviceTime(false, context);
        if (isCurrentConnection(context)) showFeedback(t(adapter.kind === 'cgd1' ? 'protocol.clockAcknowledged' : 'ui.synced'));
        return;
      }
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
      let formatApplied = true;
      // Only the LYWSD02MMC accepts this 12/24 h command; the plain LYWSD02 rejects it after the time is set.
      try { await writeCharacteristic(characteristic, modePayload); }
      catch { formatApplied = false; }
      if (!isCurrentConnection(context)) return;
      state.deviceTimezoneMinutes = desiredOffset;
      const timezone = formatTimezone(desiredOffset);
      if (automatic) log(t('log.autoTimeSynced'), 'success');
      else log(formatApplied ? t('log.timeSynced', { mode: clockMode, timezone }) : t('log.timeSyncedNoFormat', { timezone }), 'success');
      if (!formatApplied && clockMode === '12') log(t('log.clockFormatUnsupported'), 'warning');
      await wait(250);
      await readDeviceTime(false, context);
      if (isCurrentConnection(context)) showFeedback(t('ui.synced'));
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
      if (state.adapter) {
        await state.adapter.configure({ unit });
        if (!isCurrentConnection(context)) return;
        renderTemperature();
        log(t('log.unitSet', { unit }), 'success');
        showFeedback(t('ui.unitSaved'));
        return;
      }
      const characteristic = await context.service.getCharacteristic(UUIDS.unit);
      if (!isCurrentConnection(context)) return;
      await writeCharacteristic(characteristic, new Uint8Array([unit === 'F' ? 0x01 : 0xff]));
      if (!isCurrentConnection(context)) return;
      renderTemperature();
      log(t('log.unitSet', { unit }), 'success');
      showFeedback(t('ui.unitSaved'));
    } catch (error) {
      if (isCurrentConnection(context)) log(t('log.unitFailed', { error: describeError(error) }), 'error');
    } finally {
      if (context.run === state.connectionRun) elements.unitBtn.disabled = !state.isConnected || (state.adapter && !state.adapter.capabilities.unit);
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
    elements.loadHistoryBtn.disabled = loading || !state.isConnected || (state.adapter && !state.adapter.capabilities.history);
    elements.historyLimit.disabled = elements.loadHistoryBtn.disabled;
  }

  async function loadHistory() {
    const context = connectionContext();
    if (!isCurrentConnection(context) || state.historyLoading || (state.adapter && !state.adapter.capabilities.history)) return;
    setHistoryLoading(true);
    elements.historyStatus.textContent = t('history.reading');
    log(t('log.historyReading'));
    try {
      if (state.adapter) {
        const records = await state.adapter.history(Number(elements.historyLimit.value));
        if (!isCurrentConnection(context)) return;
        state.historyRecords = records;
        renderHistory();
        elements.historyStatus.textContent = t('protocol.sampleHistory');
        return;
      }
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

  function updateHistoryLabels() {
    return view.updateHistoryLabels();
  }

  function renderHistory() {
    return view.renderHistory();
  }

  function exportHistory() {
    return view.exportHistory();
  }

  async function refreshGrantedDevices() {
    state.grantedDevices.clear();
    if (state.bluetoothUsable && typeof navigator.bluetooth.getDevices === 'function') {
      try {
        const devices = await navigator.bluetooth.getDevices();
        devices.filter((device) => !device.name || state.deviceHistory[device.id]?.profile || DEVICE_NAME_PREFIXES.some((prefix) => device.name.startsWith(prefix)))
          .forEach((device) => state.grantedDevices.set(device.id, device));
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
    return view.formatLastConnected(timestamp);
  }

  function renderDeviceHistory() {
    return view.renderDeviceHistory();
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
    elements.deviceProfile?.addEventListener('change', setConnectionControls);
    document.querySelectorAll('[data-language-select]').forEach((select) => {
      select.value = window.LYWSD02_I18N?.locale() || 'en';
      select.addEventListener('change', (event) => window.LYWSD02_I18N?.setLocale(event.target.value));
    });
    elements.currentYear.textContent = String(new Date().getFullYear());

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
    view.initializeNavigation();
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
