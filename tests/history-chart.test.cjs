'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { prepareRecords, temperatureExtent, segments } = require('../history-chart.js');

test('stock history keeps the measured ranges, zero readings and chronological order', () => {
  const records = [
    { timestamp: 7200, minTemperature: 21.25, maxTemperature: 23.5, minHumidity: 40, maxHumidity: 60 },
    { timestamp: 3600, minTemperature: 0, maxTemperature: 0, minHumidity: 0, maxHumidity: 0 }
  ];
  const before = JSON.stringify(records);
  const points = prepareRecords(records, 'stock');
  assert.deepEqual(points.map(point => point.timestamp), [3600, 7200]);
  assert.deepEqual(points[0].temperature, [0, 0]);
  assert.deepEqual(points[0].humidity, [0, 0]);
  assert.deepEqual(points[1].temperature, [21.25, 23.5]);
  assert.equal(JSON.stringify(records), before);
});

test('PVVX uses device timestamps and recorded averages without inventing ranges', () => {
  const point = prepareRecords([{ rawTimestamp: 3600, timestamp: 9999, temperature: 22.75, humidity: 48.5, batteryMv: 2900 }], 'pvvx')[0];
  assert.equal(point.timestamp, 3600);
  assert.deepEqual(point.temperature, [22.75, 22.75]);
  assert.deepEqual(point.humidity, [48.5, 48.5]);
});

test('missing values remain missing and invalid timestamps cannot break the chart', () => {
  const points = prepareRecords([
    { timestamp: NaN, minTemperature: 20, maxTemperature: 21 },
    { timestamp: 1e30, minTemperature: 20, maxTemperature: 21 },
    { timestamp: 3600, minTemperature: null, maxTemperature: 21, minHumidity: 40, maxHumidity: 55 },
    { timestamp: 7200, minTemperature: -5, maxTemperature: -2, minHumidity: 40, maxHumidity: 255 },
    { timestamp: 10800, minTemperature: NaN, maxTemperature: 21 }
  ], 'stock');
  assert.equal(points.length, 2);
  assert.equal(points[0].temperature, null);
  assert.deepEqual(points[0].humidity, [40, 55]);
  assert.deepEqual(points[1].temperature, [-5, -2]);
  assert.equal(points[1].humidity, null);
});

test('a constant or single temperature gets a finite, nonzero vertical scale', () => {
  for (const value of [-10, 0, 22.5]) {
    const [low, high] = temperatureExtent([{ temperature: [value, value] }]);
    assert.ok(Number.isFinite(low) && Number.isFinite(high));
    assert.ok(low < value && high > value);
  }
});

test('missing hours and missing measurements interrupt the plotted lines', () => {
  const points = [0, 3600, 10800, 14400, 18000].map(timestamp => ({ timestamp, temperature: [20, 22] }));
  points[3].temperature = null;
  assert.deepEqual(segments(points, 'temperature', 5400).map(group => group.map(point => point.timestamp)), [[0, 3600], [10800], [18000]]);
});
