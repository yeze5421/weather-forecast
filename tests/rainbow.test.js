import test from 'node:test';
import assert from 'node:assert/strict';
import { RainbowController, HOUR_MS, CLEAR_WINDOW_MS, RAINBOW_DURATION_MS } from '../shared/rainbow.cjs';
import { WeatherController } from '../shared/weather-state.cjs';

const step = 30000;
function rainUntil(controller, end, key = 'cpu', weather = 'rainy') {
  for (let time = 0; time <= end; time += step) assert.equal(controller.update(weather, time, key), false);
}

test('after more than an hour of rain a sunny sky shows a temporary rainbow', () => {
  const rainbow = new RainbowController();
  rainUntil(rainbow, HOUR_MS + step);
  const clear = HOUR_MS + 2 * step;
  assert.equal(rainbow.update('sunny', clear, 'cpu'), true);
  for (let time = clear + step; time < clear + RAINBOW_DURATION_MS; time += step) assert.equal(rainbow.update('sunny', time, 'cpu'), true);
  assert.equal(rainbow.update('sunny', clear + RAINBOW_DURATION_MS, 'cpu'), false);
  assert.equal(rainbow.update('sunny', clear + RAINBOW_DURATION_MS + step, 'cpu'), false);
});

test('short rain does not qualify; qualifying thunderstorms can pass through clouds', () => {
  const short = new RainbowController();
  rainUntil(short, HOUR_MS);
  assert.equal(short.update('sunny', HOUR_MS + step, 'cpu'), false);
  const rainbow = new RainbowController();
  rainUntil(rainbow, HOUR_MS + step, 'cpu', 'storm');
  const clouds = HOUR_MS + 2 * step;
  assert.equal(rainbow.update('cloudy', clouds, 'cpu'), false);
  assert.equal(rainbow.update('sunny', clouds + step, 'cpu'), true);
  assert.equal(rainbow.update('rainy', clouds + 2 * step, 'cpu'), false);
});

test('stale readings, missing data, changing source and a long cloudy interval do not invent rainbows', () => {
  for (const interruption of ['gap', 'unknown', 'source']) {
    const rainbow = new RainbowController();
    rainUntil(rainbow, HOUR_MS + step);
    const time = HOUR_MS + 2 * step;
    if (interruption === 'gap') assert.equal(rainbow.update('sunny', time + step, 'cpu'), false);
    if (interruption === 'unknown') { rainbow.update('unknown', time, 'cpu'); assert.equal(rainbow.update('sunny', time + step, 'cpu'), false); }
    if (interruption === 'source') assert.equal(rainbow.update('sunny', time, 'gpu'), false);
  }
  const rainbow = new RainbowController();
  rainUntil(rainbow, HOUR_MS + step);
  const clouds = HOUR_MS + 2 * step;
  for (let time = clouds; time <= clouds + CLEAR_WINDOW_MS; time += step) rainbow.update('cloudy', time, 'cpu');
  assert.equal(rainbow.update('sunny', clouds + CLEAR_WINDOW_MS + step, 'cpu'), false);
});

test('smoothed live weather triggers the rainbow only after the rain gives way to sun', () => {
  const sky = new WeatherController();
  const rainbow = new RainbowController();
  const observe = (timestamp, usage) => {
    const weather = sky.update({ timestamp, cpu: { usage }, memory: { usage: 30 } }, 'cpu', 90, true);
    return { id: weather.id, rainbow: rainbow.update(weather.id, timestamp, 'cpu:90:true') };
  };
  for (let time = 0; time <= HOUR_MS + 10000; time += 10000) assert.deepEqual(observe(time, 95), { id: 'rainy', rainbow: false });
  assert.deepEqual(observe(HOUR_MS + 20000, 10), { id: 'rainy', rainbow: false });
  assert.deepEqual(observe(HOUR_MS + 30000, 10), { id: 'sunny', rainbow: true });
});
