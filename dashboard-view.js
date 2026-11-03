/* Rendering and export of device identities, measurements and history. */
(function (root) {
  'use strict';
  function create({ state, elements, t, localeTag, formatNumber, deviceDisplayName, log,
                      resolveHistoryDevice, displayNameForId, shortDeviceId, refreshIcons,
                      connectToDevice, chooseDevice, removeDeviceHistory, byId }) {
    function initializeNavigation() {
      const tabs = Array.from(document.querySelectorAll('.mode-tab'));
      function selectPanel(id, navigate = false) {
        tabs.forEach((tab) => {
          const selected = tab.dataset.mode === id;
          tab.setAttribute('aria-selected', String(selected));
          tab.tabIndex = selected ? 0 : -1;
          byId(tab.getAttribute('aria-controls')).hidden = !selected;
        });
        if (navigate && location.hash !== `#${id}`) history.pushState(null, '', `#${id}`);
      }
      function followHash() { selectPanel(location.hash === '#home-assistant' ? 'home-assistant' : 'browser'); }
      tabs.forEach((tab, index) => {
        tab.addEventListener('click', () => selectPanel(tab.dataset.mode, true));
        tab.addEventListener('keydown', (event) => {
          let next;
          const rtl = document.documentElement.dir === 'rtl';
          if (event.key === 'ArrowRight') next = index + (rtl ? -1 : 1);
          if (event.key === 'ArrowLeft') next = index + (rtl ? 1 : -1);
          if (event.key === 'Home') next = 0;
          if (event.key === 'End') next = tabs.length - 1;
          if (next === undefined) return;
          event.preventDefault();
          const target = tabs[(next + tabs.length) % tabs.length];
          target.focus();
          selectPanel(target.dataset.mode, true);
        });
      });
      window.addEventListener('hashchange', followHash);
      window.addEventListener('popstate', followHash);
      followHash();
    }
    function updateWorkspaceVisibility() {
      const connected = state.isConnected;
      const capabilities = state.adapter?.capabilities;
      function show(id, visible) { const element = byId(id); if (element) element.hidden = !visible; }
      show('connectIntro', !connected);
      show('connectedIdentity', connected);
      show('clockWorkspace', connected);
      show('syncBtn', true);
      show('clockMetric', connected && (!capabilities || capabilities.time) && state.protocolKind !== 'cgd1');
      show('displaySettings', true);
      show('unitSettings', true);
      show('formatSettings', true);
      show('historyPanel', true);
      byId('connectionCard')?.classList.toggle('is-connected', connected);
      elements.connectBtn.classList.toggle('button--primary', !connected);
      elements.connectBtn.classList.toggle('button--secondary', connected);
    }
    function renderExtraMeasurements() {
      const panel = byId('extraMeasurements');
      const list = byId('extraMeasurementsList');
      if (!panel || !list) return;
      const units = { soilMoisture: '%', conductivity: 'µS/cm', illuminance: 'lx', batteryMv: 'mV' };
      const labels = { soilMoisture: 'protocol.soilMoisture', conductivity: 'protocol.conductivity', illuminance: 'protocol.illuminance', batteryMv: 'protocol.batteryVoltage' };
      const entries = Object.entries(state.extraMeasurements);
      panel.hidden = entries.length === 0;
      list.replaceChildren();
      entries.forEach(([key, value]) => {
        const term = document.createElement('dt');
        term.textContent = t(labels[key]);
        const reading = document.createElement('dd');
        reading.textContent = `${formatNumber(value, 0)} ${units[key]}`;
        list.append(term, reading);
      });
    }
    function updateHistoryLabels() {
      const samples = state.protocolKind === 'pvvx';
      const title = byId('history-title');
      if (title) title.textContent = t(samples ? 'protocol.sampleHistoryTitle' : 'history.title');
      const headings = document.querySelectorAll('#historyTableWrap th');
      const keys = samples ? ['protocol.deviceTimestamp', 'metric.temperature', 'metric.humidity', 'protocol.batteryVoltage'] : ['history.date', 'history.tempMin', 'history.tempMax', 'history.humidity'];
      headings.forEach((heading, index) => { heading.textContent = t(keys[index]); });
      document.querySelectorAll('#historyLimit option').forEach((option) => {
        option.textContent = samples ? t('history.count', { count: Number(option.value) }) : t(option.dataset.i18n);
      });
    }
    function renderHistory() {
      const samples = state.protocolKind === 'pvvx';
      updateHistoryLabels();
      elements.historyTableBody.replaceChildren();
      const count = state.historyRecords.length;
      elements.historyCount.textContent = t('history.count', { count });
      elements.historyCount.hidden = count === 0;
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
        (samples ? [
          new Intl.DateTimeFormat(localeTag(), { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }).format(new Date(record.rawTimestamp * 1000)),
          `${formatNumber(record.temperature)} °C`, `${formatNumber(record.humidity)} %`, `${record.batteryMv} mV`
        ] : [
          dateFormatter.format(new Date(record.timestamp * 1000)),
          `${formatNumber(record.minTemperature)} °C`, `${formatNumber(record.maxTemperature)} °C`,
          `${record.minHumidity}–${record.maxHumidity} %`
        ]).forEach((value) => {
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
      const rows = state.protocolKind === 'pvvx' ? [
        ['device_timestamp_raw', 'temperature_average_c', 'humidity_average_pct', 'battery_mv'],
        ...state.historyRecords.map((record) => [record.rawTimestamp, record.temperature, record.humidity, record.batteryMv])
      ] : [
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
    function formatLastConnected(timestamp) {
      if (!timestamp) return '—';
      return new Intl.DateTimeFormat(localeTag(), { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(timestamp));
    }
    function renderDeviceHistory() {
      if (!elements.knownDevicesList) return;
      elements.knownDevicesList.replaceChildren();
      const records = Object.values(state.deviceHistory).sort((left, right) => right.lastConnected - left.lastConnected);
      if (elements.knownDevices) elements.knownDevices.hidden = records.length === 0;
      const count = byId('savedClockCount');
      if (count) count.textContent = String(records.length);
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
        identity.append(name, id, last);

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
    return { initializeNavigation, updateWorkspaceVisibility, renderExtraMeasurements, updateHistoryLabels, renderHistory, exportHistory, renderDeviceHistory };
  }
  root.DASHBOARD_VIEW = { create };
})(window);
