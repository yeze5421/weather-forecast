// Only accept temperatures belonging to CPU hardware and known CPU sensor labels.
// WMI providers may return zero for an unavailable sensor, so zero is not accepted.
const providers = new Set(['Cirrus sensors', 'LibreHardwareMonitor', 'OpenHardwareMonitor']);
function sensorPriority(name) {
  if (/^CPU Package$/i.test(name)) return 0;
  if (/^(?:CPU|Core) \(Tctl\/Tdie\)$/i.test(name)) return 1;
  if (/^CPU (?:Tdie|Die \(average\))$/i.test(name)) return 2;
  if (/^(?:CPU )?Core (?:Max|#?\d+)$/i.test(name)) return 3;
  return null;
}
function selectCpuTemperature(sensors) {
  if (!Array.isArray(sensors)) return null;
  const candidates = sensors.slice(0, 256).flatMap(sensor => {
    if (!sensor || !providers.has(sensor.source) || typeof sensor.name !== 'string' || typeof sensor.value !== 'number' || !Number.isFinite(sensor.value) || sensor.value <= 0 || sensor.value > 150) return [];
    const name = sensor.name.trim();
    const priority = sensorPriority(name);
    return priority === null ? [] : [{ value: sensor.value, name, source: sensor.source, priority }];
  });
  candidates.sort((a, b) => a.priority - b.priority || b.value - a.value);
  return candidates[0] || null;
}
module.exports = { selectCpuTemperature };
