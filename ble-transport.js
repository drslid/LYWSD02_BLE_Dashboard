/* Shared command transport for Web Bluetooth device adapters. */
(function (root) {
  'use strict';

  class SerialQueue {
    constructor() { this.tail = Promise.resolve(); this.closed = false; }
    run(operation) {
      const pending = this.tail.then(() => {
        if (this.closed) throw new Error('Bluetooth session closed');
        return operation();
      });
      this.tail = pending.catch(() => {});
      return pending;
    }
    close() { this.closed = true; }
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
      this.queue = new SerialQueue();
      this.onValue = (event) => {
        const value = event.target.value;
        const frame = new Uint8Array(value.buffer, value.byteOffset, value.byteLength).slice();
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
      } catch (error) { this.close(); throw error; }
    }
    request(payload, accept, timeout = this.timeout) {
      return this.queue.run(async () => {
        let timer;
        let resolveReply;
        const response = new Promise((resolve) => { resolveReply = resolve; });
        // Timeout and cancellation cover both the write and its reply. A notification
        // may arrive before the browser finishes resolving writeValueWithResponse().
        const interrupted = new Promise((_resolve, reject) => {
          this.pending = { accept, resolve: resolveReply, reject };
          timer = setTimeout(() => reject(new Error('Bluetooth command timed out')), timeout);
        });
        try {
          const [, frame] = await Promise.race([
            Promise.all([write(this.writeCharacteristic, new Uint8Array(payload)), response]),
            interrupted
          ]);
          return frame;
        } catch (error) {
          // Replies from a timed-out write cannot safely identify a later command.
          this.close();
          throw error;
        } finally { clearTimeout(timer); this.pending = null; }
      });
    }
    close() {
      this.closed = true;
      this.queue.close();
      this.characteristic.removeEventListener('characteristicvaluechanged', this.onValue);
      this.pending?.reject(new Error('Bluetooth session closed'));
      this.listeners.clear();
    }
  }

  const api = { Channel, SerialQueue, write };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BLE_TRANSPORT = api;
})(typeof window === 'object' ? window : globalThis);
