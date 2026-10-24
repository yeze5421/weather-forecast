/** Weather is a reading of the present machine, never a prediction. */
export const WEATHER_STATES = Object.freeze({
  sunny: Object.freeze({
    label: 'Clear skies',
    description: 'Running light. Room to create.',
    advice: 'Plenty of room for whatever comes next.',
    color: '#e9a747',
  }),
  cloudy: Object.freeze({
    label: 'Clouds passing',
    description: 'A little busy. Still room to breathe.',
    advice: 'A steady load, with a few clouds passing by.',
    color: '#8396b6',
  }),
  rainy: Object.freeze({
    label: 'Heavy rain',
    description: 'Full speed ahead. Let it rain.',
    advice: 'Load is high. Give your current tasks a little time.',
    color: '#6487ca',
  }),
  storm: Object.freeze({
    label: 'Thunderstorm',
    description: 'Memory is filling up. The sky feels crowded.',
    advice: 'Memory is nearly full. Close apps you are not using.',
    color: '#9c82d7',
  }),
  unknown: Object.freeze({
    label: 'Awaiting data',
    description: 'No readings from this part of the sky yet.',
    advice: 'This sensor has no readings yet. Try another source.',
    color: '#9aa5b5',
  }),
});

function percent(value) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(100, Math.max(0, value))
    : null;
}

function selectedSource(source) {
  return source === 'gpu' ? 'gpu' : 'cpu';
}

/** Memory pressure takes priority over either CPU or GPU weather. */
export function deriveWeather(snapshot, source = 'cpu', stormThreshold = 90) {
  const selected = selectedSource(source);
  const load = percent(snapshot?.[selected]?.usage);
  const memory = percent(snapshot?.memory?.usage);
  const threshold = percent(stormThreshold) ?? 90;
  const memoryStorm = memory !== null && memory >= threshold;
  const id = memoryStorm
    ? 'storm'
    : load === null
      ? 'unknown'
      : load >= 80
        ? 'rainy'
        : load >= 40
          ? 'cloudy'
          : 'sunny';

  return {
    id,
    ...WEATHER_STATES[id],
    load,
    source: selected,
    reason: memoryStorm ? 'memory' : load === null ? 'unavailable' : 'load',
  };
}

const DEMO_READINGS = Object.freeze({
  sunny: { load: 18, memory: 42, fan: 920, temperature: 38 },
  cloudy: { load: 56, memory: 61, fan: 1680, temperature: 54 },
  rainy: { load: 94, memory: 76, fan: 2460, temperature: 73 },
  storm: { load: 67, memory: 96, fan: 2080, temperature: 62 },
});

/** Explicitly labelled, deterministic samples for the weather preview only. */
export function createDemoSnapshot(weatherId = 'sunny', source = 'cpu', timestamp = Date.now()) {
  const reading = Object.hasOwn(DEMO_READINGS, weatherId) ? DEMO_READINGS[weatherId] : DEMO_READINGS.sunny;
  const selected = selectedSource(source);
  const totalGB = 32;
  return {
    timestamp: typeof timestamp === 'number' && Number.isFinite(timestamp) ? timestamp : Date.now(),
    cpu: { usage: selected === 'cpu' ? reading.load : Math.round(reading.load * 0.6), name: 'Demo CPU · 8 cores' },
    gpu: { usage: selected === 'gpu' ? reading.load : Math.round(reading.load * 0.35), name: 'Demo GPU', temperature: reading.temperature },
    memory: { usage: reading.memory, usedGB: Number((totalGB * reading.memory / 100).toFixed(1)), totalGB },
    fan: { rpm: reading.fan, source: 'Demo sensor' },
    uptime: 15360,
  };
}

export function formatPercent(value) {
  const normalized = percent(value);
  return normalized === null ? '—' : `${Math.round(normalized)}%`;
}

export function formatRpm(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? `${Math.round(value).toLocaleString('en-US')} RPM`
    : '—';
}

/** Invalid and unavailable samples are omitted, rather than averaged as zero. */
export function summarizeHistory(history, source = 'cpu') {
  const selected = selectedSource(source);
  const values = (Array.isArray(history) ? history : [])
    .map((snapshot) => percent(snapshot?.[selected]?.usage))
    .filter((value) => value !== null);
  if (!values.length) return { count: 0, min: null, max: null, avg: null };
  return {
    count: values.length,
    min: Math.min(...values),
    max: Math.max(...values),
    avg: values.reduce((sum, value) => sum + value, 0) / values.length,
  };
}
