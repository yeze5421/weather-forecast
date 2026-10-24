import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WEATHER_STATES,
  deriveWeather,
  createDemoSnapshot,
  formatPercent,
  formatRpm,
  summarizeHistory,
} from '../src/weather-model.js';

const snapshot = (cpu, gpu = null, memory = 42) => ({ cpu: { usage: cpu }, gpu: { usage: gpu }, memory: { usage: memory } });

test('CPU and GPU thresholds have exact, non-overlapping boundaries', () => {
  for (const source of ['cpu', 'gpu']) {
    for (const [load, expected] of [[0, 'sunny'], [39.99, 'sunny'], [40, 'cloudy'], [79.99, 'cloudy'], [80, 'rainy'], [100, 'rainy']]) {
      const result = deriveWeather(snapshot(load, load), source);
      assert.equal(result.id, expected, `${source}: ${load}`);
      assert.equal(result.source, source);
      assert.equal(result.reason, 'load');
      assert.equal(result.load, load);
    }
  }
});

test('memory storm overrides both light and heavy selected-source load', () => {
  for (const source of ['cpu', 'gpu']) {
    for (const load of [0, 100, null]) {
      assert.equal(deriveWeather(snapshot(load, load, 89.99), source).id, load === null ? 'unknown' : load === 0 ? 'sunny' : 'rainy');
      const result = deriveWeather(snapshot(load, load, 90), source);
      assert.equal(result.id, 'storm');
      assert.equal(result.reason, 'memory');
      assert.equal(result.load, load);
    }
  }
  assert.equal(deriveWeather(snapshot(18, 10, 84), 'cpu', 85).id, 'sunny');
  assert.equal(deriveWeather(snapshot(18, 10, 85), 'cpu', 85).id, 'storm');
});

test('unavailable GPU never silently becomes a CPU reading', () => {
  for (const invalid of [null, undefined, NaN, Infinity, -Infinity, '92', false, {}]) {
    const result = deriveWeather(snapshot(97, invalid), 'gpu');
    assert.equal(result.id, 'unknown');
    assert.equal(result.load, null);
    assert.equal(result.reason, 'unavailable');
  }
  assert.equal(deriveWeather(snapshot(97, 0), 'gpu').id, 'sunny');
});

test('missing and malformed snapshots remain safe and explicit', () => {
  for (const malformed of [undefined, null, false, 7, '', {}, [], { cpu: null, memory: {} }]) {
    assert.equal(deriveWeather(malformed).id, 'unknown');
  }
  assert.equal(deriveWeather(snapshot(-4)).load, 0);
  assert.equal(deriveWeather(snapshot(110)).load, 100);
  assert.equal(deriveWeather(snapshot(18, 10, 101)).id, 'storm');
  assert.equal(deriveWeather(snapshot(18, 10, 90), 'cpu', NaN).id, 'storm');
  assert.equal(deriveWeather(snapshot(18, 94), 'invalid').source, 'cpu');
});

test('all four demo weather states derive correctly for either selected source', () => {
  for (const source of ['cpu', 'gpu']) {
    for (const id of ['sunny', 'cloudy', 'rainy', 'storm']) {
      const sample = createDemoSnapshot(id, source, 123456);
      assert.equal(deriveWeather(sample, source).id, id);
      assert.equal(sample.timestamp, 123456);
      assert.ok(Math.abs(sample.memory.usedGB / sample.memory.totalGB * 100 - sample.memory.usage) < 0.2);
      assert.match(sample.fan.source, /演示/);
      assert.deepEqual(sample, createDemoSnapshot(id, source, 123456));
    }
  }
  assert.equal(deriveWeather(createDemoSnapshot('not-a-weather')).id, 'sunny');
  assert.equal(deriveWeather(createDemoSnapshot('constructor')).id, 'sunny');
});

test('numeric display preserves unavailable versus measured zero', () => {
  assert.equal(formatPercent(null), '—');
  assert.equal(formatPercent(NaN), '—');
  assert.equal(formatPercent(0), '0%');
  assert.equal(formatPercent(24.8), '25%');
  assert.equal(formatPercent(105), '100%');
  assert.equal(formatRpm(null), '—');
  assert.equal(formatRpm(-1), '—');
  assert.equal(formatRpm(0), '0 RPM');
  assert.equal(formatRpm(1240.2), '1,240 RPM');
});

test('history aggregates only real selected-source readings', () => {
  const history = [snapshot(10, 0), snapshot(20, null), null, snapshot(NaN, 60), snapshot(30, undefined)];
  assert.deepEqual(summarizeHistory(history, 'cpu'), { count: 3, min: 10, max: 30, avg: 20 });
  assert.deepEqual(summarizeHistory(history, 'gpu'), { count: 2, min: 0, max: 60, avg: 30 });
  for (const empty of [[], null, undefined, [null, {}]]) {
    assert.deepEqual(summarizeHistory(empty), { count: 0, min: null, max: null, avg: null });
  }
});

test('state descriptors cannot be accidentally mutated by the UI', () => {
  assert.ok(Object.isFrozen(WEATHER_STATES));
  for (const descriptor of Object.values(WEATHER_STATES)) {
    assert.ok(Object.isFrozen(descriptor));
    assert.ok(descriptor.label && descriptor.description && descriptor.advice && descriptor.color);
  }
});
