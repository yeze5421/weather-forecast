const themeIds = new Set(require('../shared/themes.json').map(theme => theme.id));
const defaults = Object.freeze({
  source: 'cpu', fanSelection: 'auto', launchAtLogin: false, pinned: false, reducedMotion: false,
  refreshInterval: 2000, stormThreshold: 90, theme: 'midnight',
  energySaving: true, smoothWeather: true, alertsEnabled: false,
  alertDuration: 60, temperatureThreshold: 85, windowMode: 'widget', miniPosition: null,
});
function normalizePreferences(patch, base = defaults) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new TypeError('Invalid preferences');
  const next = { ...base };
  if ('theme' in patch) { if (!themeIds.has(patch.theme)) throw new TypeError('Unknown color theme'); next.theme = patch.theme; }
  if ('source' in patch) { if (!['cpu', 'gpu'].includes(patch.source)) throw new TypeError('Unknown weather source'); next.source = patch.source; }
  if ('fanSelection' in patch) { if (typeof patch.fanSelection !== 'string' || !/^(auto|nvml:\d{1,2}:\d{1,2}|wmi:(LibreHardwareMonitor|OpenHardwareMonitor):[a-f0-9]{64})$/.test(patch.fanSelection)) throw new TypeError('Invalid fan selection'); next.fanSelection = patch.fanSelection; }
  for (const key of ['launchAtLogin', 'pinned', 'reducedMotion', 'energySaving', 'smoothWeather', 'alertsEnabled']) {
    if (key in patch) { if (typeof patch[key] !== 'boolean') throw new TypeError(`Invalid ${key}`); next[key] = patch[key]; }
  }
  for (const [key, allowed] of Object.entries({ refreshInterval: [1000, 2000, 5000, 10000], alertDuration: [30, 60, 120], windowMode: ['mini', 'widget', 'station'] })) {
    if (key in patch) { if (!allowed.includes(patch[key])) throw new TypeError(`Invalid ${key}`); next[key] = patch[key]; }
  }
  for (const [key, min, max] of [['stormThreshold', 70, 99], ['temperatureThreshold', 60, 100]]) {
    if (key in patch) { if (!Number.isFinite(patch[key]) || patch[key] < min || patch[key] > max) throw new TypeError(`Invalid ${key}`); next[key] = Math.round(patch[key]); }
  }
  if ('miniPosition' in patch) {
    const p = patch.miniPosition;
    if (p !== null && (!p || !Number.isInteger(p.x) || !Number.isInteger(p.y) || Math.abs(p.x) > 100000 || Math.abs(p.y) > 100000)) throw new TypeError('Invalid mini position');
    next.miniPosition = p === null ? null : { x: p.x, y: p.y };
  }
  return next;
}
module.exports = { defaults, normalizePreferences };
