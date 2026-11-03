/* Versioned local device storage; no Bluetooth or DOM dependencies. */
(function (root) {
  'use strict';
  function create({ storage, profiles, onError }) {
    function readStoredObject(key) {
      try {
        const parsed = JSON.parse(storage().getItem(key) || '{}');
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
      } catch {
        return {};
      }
    }

    function readStoredBoolean(key, fallback) {
      try {
        const value = storage().getItem(key);
        return value === null ? fallback : value !== 'false';
      } catch {
        return fallback;
      }
    }

    function storeObject(key, value) {
      try {
        storage().setItem(key, JSON.stringify(value));
      } catch {
        onError();
      }
    }

    function storeBoolean(key, value) {
      try {
        storage().setItem(key, String(value));
      } catch {
        onError();
      }
    }

    function normalizeDeviceHistory(history, aliases) {
      const normalized = {};
      Object.entries(history).forEach(([id, record]) => {
        if (!id || !record || typeof record !== 'object') return;
        normalized[id] = {
          id,
          name: String(record.name || 'LYWSD02'),
          profile: profiles.includes(record.profile) ? record.profile : 'stock',
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

    return { readStoredObject, readStoredBoolean, storeObject, storeBoolean, normalizeDeviceHistory };
  }
  root.DASHBOARD_STORAGE = { create };
})(window);
