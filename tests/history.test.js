import test from 'node:test';
import assert from 'node:assert/strict';
import { recordHistory, HISTORY_MS, HISTORY_INTERVAL_MS, MAX_HISTORY_SAMPLES } from '../electron/history.cjs';

const sample = timestamp => ({ timestamp, cpu: { usage: 40, name: 'private hardware name' }, gpu: { usage: 20, temperature: 50 }, memory: { usage: 30, usedGB: 3, totalGB: 10 }, fan: { rpm: 500 }, weather: { id: 'cloudy', source: 'cpu' }, sensors: { private: 'not saved' } });

test('session history retains a full 24 hours at 10-second intervals and expires older readings', () => {
  const history = [];
  for (let timestamp = 0; timestamp <= HISTORY_MS; timestamp += HISTORY_INTERVAL_MS) recordHistory(history, sample(timestamp));
  assert.equal(history.length, MAX_HISTORY_SAMPLES);
  assert.equal(history[0].timestamp, 0);
  recordHistory(history, sample(HISTORY_MS + 1000));
  assert.equal(history[0].timestamp, HISTORY_INTERVAL_MS);
  assert.equal(history.at(-1).timestamp, HISTORY_MS);
  recordHistory(history, sample(HISTORY_MS + HISTORY_INTERVAL_MS));
  assert.equal(history.at(-1).timestamp, HISTORY_MS + HISTORY_INTERVAL_MS);
  assert.equal(history.length, MAX_HISTORY_SAMPLES);
  assert.equal(history[0].cpu.name, undefined);
  assert.equal(history[0].sensors, undefined);
});

test('history handles gaps and missing readings without inventing values', () => {
  const history = [];
  recordHistory(history, { timestamp: 1 });
  recordHistory(history, { timestamp: 1 + HISTORY_MS + 1 });
  assert.equal(history.length, 1);
  assert.equal(history[0].fan.rpm, undefined);
  recordHistory(history, { timestamp: NaN });
  assert.equal(history.length, 1);
});
