const finite = value => typeof value === 'number' && Number.isFinite(value);
class AlertMonitor {
  constructor() { this.reset(); }
  clearPending() { this.since = {}; this.lastTime = null; this.key = null; }
  reset() { this.clearPending(); this.notified = {}; }
  update(snapshot, preferences) {
    const now = snapshot.timestamp;
    const key = `${preferences.source}:${preferences.stormThreshold}:${preferences.alertDuration}:${preferences.temperatureThreshold}`;
    if (!preferences.alertsEnabled || key !== this.key || (this.lastTime !== null && (now < this.lastTime || now - this.lastTime > 35000))) { this.since = {}; this.key = key; }
    this.lastTime = now;
    if (!preferences.alertsEnabled) return [];
    const source = preferences.source === 'gpu' ? 'gpu' : 'cpu';
    const conditions = {
      memory: finite(snapshot.memory?.usage) && snapshot.memory.usage >= preferences.stormThreshold,
      load: finite(snapshot[source]?.usage) && snapshot[source].usage >= 90,
      temperature: finite(snapshot.gpu?.temperature) && snapshot.gpu.temperature >= preferences.temperatureThreshold,
    };
    const messages = {
      memory: ['Memory needs some room', `Memory has stayed at or above ${preferences.stormThreshold}%. Consider closing unused apps.`],
      load: ['A busy stretch of weather', `${source.toUpperCase()} load has stayed at or above 90%.`],
      temperature: ['GPU temperature is elevated', `GPU temperature has stayed at or above ${preferences.temperatureThreshold} °C.`],
    };
    const alerts = [];
    for (const [kind, active] of Object.entries(conditions)) {
      if (!active) { delete this.since[kind]; continue; }
      if (this.since[kind] === undefined) this.since[kind] = now;
      if (now - this.since[kind] >= preferences.alertDuration * 1000 && now - (this.notified[kind] ?? -Infinity) >= 15 * 60000) {
        this.notified[kind] = now;
        alerts.push({ kind, title: messages[kind][0], body: messages[kind][1] });
      }
    }
    return alerts;
  }
}
module.exports = { AlertMonitor };
