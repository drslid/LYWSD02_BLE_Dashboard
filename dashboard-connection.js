/* Cancellable Bluetooth connection lifecycle, discovery and bounded retries. */
(function (root) {
  'use strict';
  function create({
    state, elements, UUIDS, EXTRA_PROFILES, DEVICE_NAME_PREFIXES, RETRY_DELAYS,
    t, log, setConnectionStatus, setConnectionControls, deviceDisplayName,
    displayNameForId, persistDeviceSnapshot, recordSuccessfulConnection,
    resetMeasurements, resetHistory, renderDeviceIdentity, describeError,
    readInitialValues, refreshGrantedDevices, renderTemperature, renderHumidity,
    nowLabel, renderExtraMeasurements, handleMeasurement, setHistoryLoading
  }) {
    function bindDevice(device) {
      if (state.device && state.device !== device) state.device.removeEventListener('gattserverdisconnected', handleGattDisconnected);
      state.device = device;
      device.removeEventListener('gattserverdisconnected', handleGattDisconnected);
      device.addEventListener('gattserverdisconnected', handleGattDisconnected);
      renderDeviceIdentity();
      setConnectionControls();
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
    function connectionContext() {
      return { run: state.connectionRun, device: state.device, service: state.service };
    }
    function isCurrentConnection(context) {
      return state.isConnected && context.run === state.connectionRun
        && context.device === state.device && context.service === state.service;
    }
    function clearConnectionResources() {
      state.adapter?.close();
      state.adapter = null;
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
        const profile = expectedId ? state.deviceHistory[expectedId]?.profile : elements.deviceProfile?.value;
        const extended = EXTRA_PROFILES.includes(profile);
        if (elements.deviceProfile) elements.deviceProfile.value = extended ? profile : 'stock';
        selectedDevice = await connectionStep(navigator.bluetooth.requestDevice({
          ...(extended ? { acceptAllDevices: true } : { filters: DEVICE_NAME_PREFIXES.map((namePrefix) => ({ namePrefix })) }),
          optionalServices: [UUIDS.service, '00001f10-0000-1000-8000-00805f9b34fb', '0000180f-0000-1000-8000-00805f9b34fb', '22210000-554a-4546-5542-46534450464d', '226c0000-6476-4566-7562-66734470666d', '00001204-0000-1000-8000-00805f9b34fb']
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
      const previousProtocol = state.protocolKind;
      state.connectionRun += 1;
      const run = state.connectionRun;
      const task = startConnectionTask(device);
      const requestedProfile = ['history', 'reconnect'].includes(reason) ? state.deviceHistory[device.id]?.profile : elements.deviceProfile?.value;
      task.profile = EXTRA_PROFILES.includes(requestedProfile) ? requestedProfile : 'stock';
      state.protocolKind = task.profile;
      if (elements.deviceProfile) elements.deviceProfile.value = task.profile;
      state.isConnecting = true;
      state.isConnected = false;
      clearConnectionResources();
      if (previousDevice && previousDevice !== device) {
        previousDevice.removeEventListener('gattserverdisconnected', handleGattDisconnected);
        if (previousDevice.gatt?.connected) previousDevice.gatt.disconnect();
      }
      if (changedDevice || previousProtocol !== state.protocolKind) {
        resetMeasurements();
      }
      bindDevice(device);
      if (changedDevice || previousProtocol !== state.protocolKind) resetHistory();
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
      if (task.profile !== 'stock') {
        const protocols = window.BLE_DEVICES;
        if (!protocols) throw Object.assign(new Error('Device protocols unavailable'), { name: 'NotSupportedError' });
        const emit = (measurement) => {
          if (run !== state.connectionRun || task.cancelled) return;
          if (measurement.temperature !== undefined) {
            state.lastTemperatureC = measurement.temperature;
            renderTemperature();
            elements.tempTimestamp.textContent = nowLabel();
          }
          if (measurement.humidity !== undefined) {
            state.lastHumidity = measurement.humidity;
            renderHumidity(measurement.humidity);
            elements.humTimestamp.textContent = nowLabel();
          }
          if (measurement.battery !== undefined) {
            state.lastBattery = measurement.battery;
            elements.battery.textContent = `${measurement.battery} %`;
            elements.batteryBar.style.width = `${measurement.battery}%`;
            elements.batTimestamp.textContent = nowLabel();
          }
          state.measurements += 1;
          for (const key of ['soilMoisture', 'conductivity', 'illuminance', 'batteryMv']) {
            if (measurement[key] !== undefined) state.extraMeasurements[key] = measurement[key];
          }
          renderExtraMeasurements();
          elements.updateCount.textContent = t('metric.updates', { count: state.measurements });
          persistDeviceSnapshot();
        };
        const adapter = task.profile === 'pvvx' ? new protocols.Pvvx(server, emit)
          : task.profile === 'cgd1' ? new protocols.Cgd1(server, emit, elements.pairingToken?.value.trim())
          : new protocols.Sensor(server, emit, task.profile);
        state.adapter = adapter;
        await connectionStep(adapter.open(), task);
        if (run !== state.connectionRun) return;
        state.server = server;
        state.service = adapter.service;
        return;
      }
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
    return { cancelConnection, connectionContext, isCurrentConnection, chooseDevice, connectToDevice, disconnectManually };
  }
  root.DASHBOARD_CONNECTION = { create };
})(window);
