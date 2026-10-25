function samplingPolicy(preferences, { visible = true, locked = false, battery = false } = {}) {
  const saving = preferences.energySaving !== false;
  return {
    mode: !saving ? 'standard' : locked ? 'locked' : battery ? 'battery' : !visible ? 'background' : 'active',
    interval: Math.max(preferences.refreshInterval, !saving ? 0 : locked ? 15000 : battery || !visible ? 5000 : 0),
    gpuInterval: saving && locked ? 30 : saving && (battery || !visible) ? 10 : 4,
    sensorInterval: saving && locked ? 30 : saving && (battery || !visible) ? 15 : 10,
  };
}
module.exports = { samplingPolicy };
