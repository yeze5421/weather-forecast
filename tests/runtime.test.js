import test from 'node:test';
import assert from 'node:assert/strict';
import { WeatherController } from '../shared/weather-state.cjs';
import { samplingPolicy } from '../electron/runtime-policy.cjs';
import { AlertMonitor } from '../electron/alerts.cjs';
import { defaults, normalizePreferences } from '../electron/settings.cjs';

const reading = (timestamp, load = 20, memory = 40, temperature = null) => ({ timestamp, cpu: { usage: load }, gpu: { usage: load, temperature }, memory: { usage: memory } });

test('smooth weather rejects threshold chatter, waits for sustained changes and keeps raw readings intact', () => {
  const sky = new WeatherController();
  assert.equal(sky.update(reading(0, 39)).id, 'sunny');
  for (let i = 1; i <= 10; i++) assert.equal(sky.update(reading(i * 1000, i % 2 ? 41 : 38)).id, 'sunny');
  for (let i = 11; i <= 22; i++) sky.update(reading(i * 1000, 95));
  assert.equal(sky.id, 'rainy');
  assert.equal(sky.update(reading(23000, 79)).id, 'rainy');
  const sample = reading(24000, 12);
  sky.update(sample);
  assert.equal(sample.cpu.usage, 12);
});

test('memory storms have priority, a short hold and a recovery margin', () => {
  const sky = new WeatherController();
  sky.update(reading(0));
  assert.equal(sky.update(reading(1000, 20, 91)).id, 'sunny');
  assert.equal(sky.update(reading(4000, 20, 91)).id, 'storm');
  assert.equal(sky.update(reading(5000, 20, 89)).id, 'storm');
  assert.equal(sky.update(reading(6000, 20, 86)).id, 'storm');
  assert.equal(sky.update(reading(10000, 20, 86)).id, 'sunny');
});

test('source changes, stale gaps, missing data and disabling smoothing reset visual state safely', () => {
  const sky = new WeatherController();
  sky.update(reading(0, 20));
  assert.equal(sky.update(reading(1000, null)).id, 'unknown');
  assert.equal(sky.update(reading(2000, 95)).id, 'rainy');
  assert.equal(sky.update(reading(3000, 20), 'gpu').id, 'sunny');
  assert.equal(sky.update(reading(50000, 95), 'gpu').id, 'rainy');
  assert.equal(sky.update(reading(51000, 20), 'gpu', 90, false).id, 'sunny');
});

test('power policy lowers background and battery polling, and restores requested active intervals', () => {
  assert.deepEqual(samplingPolicy(defaults), { mode: 'active', interval: 2000, gpuInterval: 4, sensorInterval: 10 });
  assert.equal(samplingPolicy(defaults, { visible: false }).interval, 5000);
  assert.equal(samplingPolicy(defaults, { battery: true }).gpuInterval, 10);
  assert.equal(samplingPolicy(defaults, { locked: true }).sensorInterval, 30);
  assert.equal(samplingPolicy({ ...defaults, refreshInterval: 10000 }, { visible: false }).interval, 10000);
  assert.equal(samplingPolicy({ ...defaults, energySaving: false }, { locked: true }).interval, 2000);
});

test('alerts are opt-in, sustained, independently cooled down and cancelled by missing or recovered readings', () => {
  const alerts = new AlertMonitor();
  assert.deepEqual(alerts.update(reading(0, 99, 99, 99), defaults), []);
  const enabled = { ...defaults, alertsEnabled: true, alertDuration: 30 };
  assert.deepEqual(alerts.update(reading(1000, 95, 95, 90), enabled), []);
  assert.deepEqual(alerts.update(reading(30000, 95, 95, 90), enabled), []);
  assert.deepEqual(alerts.update(reading(31000, 95, 95, 90), enabled).map(alert => alert.kind), ['memory', 'load', 'temperature']);
  assert.deepEqual(alerts.update(reading(32000, 95, 95, 90), enabled), []);
  alerts.update(reading(33000, null, 40, null), enabled);
  assert.deepEqual(alerts.update(reading(34000, 95, 40, null), enabled), []);
  assert.deepEqual(alerts.update(reading(65000, 95, 40, null), enabled), []);
});

test('alert gaps do not count sleep as continuous pressure and each alert rearms after cooldown', () => {
  const alerts = new AlertMonitor();
  const preferences = { ...defaults, alertsEnabled: true, alertDuration: 30 };
  alerts.update(reading(0, 95), preferences);
  assert.equal(alerts.update(reading(30000, 95), preferences).length, 1);
  assert.equal(alerts.update(reading(1000000, 95), preferences).length, 0);
  assert.equal(alerts.update(reading(1030000, 95), preferences).length, 1);
});

test('old preferences acquire safe upgrade defaults; invalid new IPC fields are rejected', () => {
  const migrated = normalizePreferences({ source: 'gpu', theme: 'forest' });
  assert.equal(migrated.alertsEnabled, false);
  assert.equal(migrated.energySaving, true);
  assert.equal(migrated.windowMode, 'widget');
  assert.equal(migrated.brightness, 100);
  assert.equal(normalizePreferences({ brightness: 75 }).brightness, 75);
  assert.equal(normalizePreferences({ brightness: 120 }).brightness, 120);
  for (const patch of [{ energySaving: 1 }, { windowMode: 'shell' }, { alertDuration: 0 }, { temperatureThreshold: NaN }, { brightness: 59 }, { brightness: 121 }, { brightness: '75' }, { miniPosition: { x: Infinity, y: 1 } }]) assert.throws(() => normalizePreferences(patch));
  assert.deepEqual(normalizePreferences({ miniPosition: { x: -1200, y: 30, privateField: 'ignored' } }).miniPosition, { x: -1200, y: 30 });
});
