const HISTORY_MS = 24 * 60 * 60 * 1000;
const HISTORY_INTERVAL_MS = 10 * 1000;
const MAX_HISTORY_SAMPLES = HISTORY_MS / HISTORY_INTERVAL_MS + 1;

function recordHistory(history, snapshot) {
  if (!Number.isFinite(snapshot?.timestamp)) return;
  const cutoff = snapshot.timestamp - HISTORY_MS;
  while (history.length && (history[0].timestamp < cutoff || history.length > MAX_HISTORY_SAMPLES)) history.shift();
  if (history.length && snapshot.timestamp - history.at(-1).timestamp < HISTORY_INTERVAL_MS) return;
  // Keep only fields used in the chart, history table and export.
  history.push({ timestamp: snapshot.timestamp, cpu: { usage: snapshot.cpu?.usage }, gpu: { usage: snapshot.gpu?.usage, temperature: snapshot.gpu?.temperature }, memory: { usage: snapshot.memory?.usage, usedGB: snapshot.memory?.usedGB, totalGB: snapshot.memory?.totalGB }, fan: { rpm: snapshot.fan?.rpm }, weather: snapshot.weather });
  while (history.length > MAX_HISTORY_SAMPLES) history.shift();
}

module.exports = { HISTORY_MS, HISTORY_INTERVAL_MS, MAX_HISTORY_SAMPLES, recordHistory };
