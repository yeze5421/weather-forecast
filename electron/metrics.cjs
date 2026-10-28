const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { EventEmitter } = require('node:events');
const GiB = 1024 ** 3;
const percentage = value => typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : null;
const positive = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
function cpuTimes() {
  return os.cpus().reduce((sum, cpu) => ({ idle: sum.idle + cpu.times.idle, total: sum.total + Object.values(cpu.times).reduce((a, b) => a + b, 0) }), { idle: 0, total: 0 });
}
class MetricsSampler extends EventEmitter {
  constructor(interval = 2000, dependencies = {}) {
    super();
    this.spawn = dependencies.spawn || spawn;
    this.clock = dependencies.clock || Date.now;
    this.platform = dependencies.platform || process.platform;
    this.interval = interval;
    this.gpuInterval = 4;
    this.sensorInterval = 10;
    this.mode = 'active';
    this.previousCpu = cpuTimes();
    this.cpuUsage = null;
    this.gpu = { usage: null, name: 'GPU sensor unavailable', temperature: null };
    this.fan = { rpm: null, source: null };
    this.gpuUpdated = null;
    this.fanUpdated = null;
    this.gpuDetail = 'Starting the GPU sensor.';
    this.fanDetail = 'Looking for fan sensors.';
    this.children = new Set();
    this.retries = new Map();
    this.failures = {};
    this.stopped = true;
    this.suspended = false;
    this.nvidiaHealthy = false;
  }
  start() {
    this.stopped = false;
    this.previousCpu = cpuTimes();
    this.startTimer();
    this.startNvidia();
    if (this.platform === 'win32') this.startWindowsSensors(false);
    return this;
  }
  startTimer() {
    clearInterval(this.timer);
    if (!this.stopped && !this.suspended) {
      this.timer = setInterval(() => this.sample(), this.interval);
      this.timer.unref?.();
    }
  }
  setInterval(interval) { this.setPolicy({ interval }); }
  setPolicy(policy) {
    const workersChanged = (policy.gpuInterval != null && policy.gpuInterval !== this.gpuInterval) || (policy.sensorInterval != null && policy.sensorInterval !== this.sensorInterval);
    const timerChanged = policy.interval != null && policy.interval !== this.interval;
    Object.assign(this, Object.fromEntries(Object.entries(policy).filter(([key]) => ['interval', 'gpuInterval', 'sensorInterval', 'mode'].includes(key))));
    if (timerChanged) this.startTimer();
    if (workersChanged && !this.stopped && !this.suspended) this.restartSensors();
  }
  sample() {
    if (this.stopped || this.suspended) return;
    const now = cpuTimes();
    const total = now.total - this.previousCpu.total;
    this.cpuUsage = total > 0 ? percentage(100 * (1 - (now.idle - this.previousCpu.idle) / total)) : null;
    this.previousCpu = now;
    const timestamp = this.clock();
    const gpuSilent = this.nvidiaChild && timestamp - (this.nvidiaLastRead ?? this.nvidiaStarted) > this.gpuInterval * 3000 + 15000;
    if (gpuSilent) {
      this.killWorker('nvidia');
      this.nvidiaHealthy = false;
      this.gpuDetail = 'GPU sensor stopped responding. Retrying automatically.';
      this.startWindowsSensors(true);
      this.schedule('nvidia', () => this.startNvidia());
    }
    if (this.windowsChild && timestamp - this.windowsStarted > this.sensorInterval * 3000 + 15000 && (this.fanUpdated === null || timestamp - this.fanUpdated > this.sensorInterval * 3000 + 15000)) {
      this.killWorker('windows');
      this.fanDetail = 'Sensor service stopped responding. Retrying automatically.';
      this.schedule('windows', () => this.startWindowsSensors(!this.nvidiaHealthy));
    }
    this.emit('snapshot', this.getSnapshot());
  }
  getSnapshot() {
    const timestamp = this.clock();
    const total = os.totalmem();
    const used = Math.max(0, total - os.freemem());
    const gpuFresh = this.gpuUpdated !== null && timestamp - this.gpuUpdated <= Math.max(this.gpuInterval, this.sensorInterval) * 2000 + 5000;
    const fanFresh = this.fanUpdated !== null && timestamp - this.fanUpdated <= this.sensorInterval * 2000 + 5000;
    const gpu = gpuFresh ? { ...this.gpu } : { ...this.gpu, usage: null, temperature: null };
    const fan = fanFresh ? { ...this.fan } : { rpm: null, source: null };
    return {
      timestamp,
      cpu: { usage: this.cpuUsage, name: os.cpus()[0]?.model?.trim() || 'CPU' },
      gpu, memory: { usage: total > 0 ? percentage(used / total * 100) : 0, usedGB: used / GiB, totalGB: total / GiB },
      fan, uptime: os.uptime(),
      sensors: {
        gpu: { state: this.suspended ? 'paused' : gpu.usage !== null ? 'live' : this.gpuUpdated !== null && !gpuFresh ? 'stale' : 'unavailable', detail: gpu.usage !== null ? (this.nvidiaHealthy ? 'NVIDIA driver sensor is connected.' : 'Windows GPU performance counters are connected.') : this.gpuDetail, updatedAt: this.gpuUpdated },
        fan: { state: this.suspended ? 'paused' : fan.rpm !== null ? 'live' : !fanFresh && this.fanUpdated !== null ? 'stale' : 'unavailable', detail: fan.rpm !== null ? fan.kind === 'gpu' ? `NVIDIA GPU fan RPM from the driver. ${fan.label || 'Fastest supported GPU fan'}; ${fan.count || 1} fan sensor(s). This is not the CPU fan.` : `${fan.source} fan sensor is connected.` : this.fanDetail, updatedAt: this.fanUpdated },
      },
      runtime: { mode: this.suspended ? 'suspended' : this.mode, interval: this.interval, gpuInterval: this.gpuInterval, sensorInterval: this.sensorInterval },
    };
  }
  track(child) {
    this.children.add(child);
    child.once('exit', () => this.children.delete(child));
    child.once('error', () => this.children.delete(child));
    return child;
  }
  readLines(stream, onLine) {
    if (!stream) return;
    let pending = '';
    stream.setEncoding('utf8');
    stream.on('data', chunk => {
      pending += chunk;
      if (pending.length > 65536) pending = '';
      let end;
      while ((end = pending.indexOf('\n')) !== -1) {
        const line = pending.slice(0, end).trim();
        pending = pending.slice(end + 1);
        if (line) onLine(line);
      }
    });
  }
  schedule(kind, callback, minimum = 5000) {
    if (this.stopped || this.suspended || this.retries.has(kind)) return;
    this.failures[kind] = (this.failures[kind] || 0) + 1;
    const delay = Math.max(minimum, Math.min(60000, 5000 * 2 ** Math.min(this.failures[kind] - 1, 4)));
    const timer = setTimeout(() => { this.retries.delete(kind); if (!this.stopped && !this.suspended) callback(); }, delay);
    timer.unref?.();
    this.retries.set(kind, timer);
  }
  killWorker(kind) {
    const key = kind === 'nvidia' ? 'nvidiaChild' : 'windowsChild';
    const child = this[key];
    this[key] = null;
    if (child) child.kill();
  }
  startNvidia() {
    if (this.stopped || this.suspended || this.nvidiaChild) return;
    let child;
    const fail = error => {
      if (child && this.nvidiaChild !== child) return;
      this.nvidiaChild = null;
      if (this.nvidiaHealthy) this.gpuUpdated = null;
      this.nvidiaHealthy = false;
      this.gpuDetail = 'NVIDIA sensor unavailable. Trying Windows counters and retrying automatically.';
      if (this.platform === 'win32') this.startWindowsSensors(true);
      this.schedule('nvidia', () => this.startNvidia(), error?.code === 'ENOENT' ? 60000 : 5000);
    };
    try {
      child = this.track(this.spawn('nvidia-smi', ['--query-gpu=name,utilization.gpu,temperature.gpu', '--format=csv,noheader,nounits', `--loop=${this.gpuInterval}`], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }));
      this.nvidiaChild = child;
      this.nvidiaStarted = this.clock();
      this.nvidiaLastRead = null;
    } catch (error) { fail(error); return; }
    child.once('error', fail);
    child.once('exit', () => fail());
    let batch = [];
    this.readLines(child.stdout, line => {
      if (this.nvidiaChild !== child) return;
      const fields = line.split(',').map(value => value.trim());
      if (fields.length < 3) return;
      const usage = Number.parseFloat(fields.at(-2));
      if (!Number.isFinite(usage)) return;
      batch.push({ name: fields.slice(0, -2).join(', '), usage: percentage(usage), temperature: positive(Number.parseFloat(fields.at(-1))) });
      if (batch.length > 64) batch = batch.slice(-64);
      clearTimeout(this.nvidiaBatchTimer);
      this.nvidiaBatchTimer = setTimeout(() => {
        if (this.nvidiaChild !== child) return;
        this.gpu = batch.reduce((best, entry) => entry.usage > best.usage ? entry : best);
        this.gpuUpdated = this.clock();
        this.nvidiaLastRead = this.gpuUpdated;
        batch = [];
        this.failures.nvidia = 0;
        const wasHealthy = this.nvidiaHealthy;
        this.nvidiaHealthy = true;
        if (!wasHealthy && this.windowsIncludesGpu) this.startWindowsSensors(false);
      }, 120);
    });
  }
  startWindowsSensors(includeGpu) {
    if (this.platform !== 'win32' || this.stopped || this.suspended) return;
    if (this.windowsChild && this.windowsIncludesGpu === includeGpu) return;
    this.killWorker('windows');
    this.windowsIncludesGpu = includeGpu;
    const sensorScript = path.join(__dirname, 'sensors.ps1').replace(/([\\/])app\.asar([\\/])/i, '$1app.asar.unpacked$2');
    let child;
    const fail = () => {
      if (child && this.windowsChild !== child) return;
      this.windowsChild = null;
      this.fanDetail = 'Sensor service unavailable or blocked. Retrying automatically.';
      this.schedule('windows', () => this.startWindowsSensors(!this.nvidiaHealthy));
    };
    try {
      child = this.track(this.spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', sensorScript, '-IntervalSeconds', String(this.sensorInterval), ...(includeGpu ? ['-IncludeGpu'] : [])], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }));
      this.windowsChild = child;
      this.windowsStarted = this.clock();
    } catch { fail(); return; }
    child.once('error', fail);
    child.once('exit', fail);
    this.readLines(child.stdout, line => {
      if (this.windowsChild !== child) return;
      try {
        const data = JSON.parse(line);
        if (data.kind !== 'sensors') return;
        this.failures.windows = 0;
        const source = ['LibreHardwareMonitor', 'OpenHardwareMonitor', 'NVIDIA NVML'].includes(data.fanSource) ? data.fanSource : null;
        this.fan = { rpm: source ? positive(data.fanRpm) : null, source, kind: source === 'NVIDIA NVML' ? 'gpu' : 'system', count: Number.isInteger(data.fanCount) && data.fanCount > 0 && data.fanCount <= 256 ? data.fanCount : null, label: source === 'NVIDIA NVML' && typeof data.fanLabel === 'string' && /^GPU \d+ - Fan \d+$/.test(data.fanLabel) ? data.fanLabel : null };
        this.fanUpdated = this.clock();
        const explanations = { provider_missing: 'No supported fan RPM source is connected. NVIDIA driver RPM is used when available; other fans require a compatible WMI provider. LibreHardwareMonitor 0.9.5+ no longer provides WMI.', no_sensor: 'The monitor is connected, but no supported fan RPM reading is available.', access_denied: 'Windows denied access to the fan sensor provider and no supported NVIDIA RPM reading is available.' };
        this.fanDetail = explanations[data.fanStatus] || 'Fan RPM is not available from this hardware.';
        if (includeGpu && !this.nvidiaHealthy) {
          this.gpu = { usage: percentage(data.gpuUsage), name: typeof data.gpuName === 'string' ? data.gpuName.slice(0, 200) : 'Windows GPU', temperature: null };
          this.gpuUpdated = this.clock();
          this.gpuDetail = 'Windows GPU counters returned no reading. Check driver support; retrying automatically.';
        }
      } catch { /* Ignore anything other than sensor records. */ }
    });
  }
  stopWorkers() {
    clearTimeout(this.nvidiaBatchTimer);
    for (const timer of this.retries.values()) clearTimeout(timer);
    this.retries.clear();
    this.killWorker('nvidia');
    this.killWorker('windows');
    for (const child of this.children) child.kill();
    this.children.clear();
  }
  suspend() {
    this.suspended = true;
    clearInterval(this.timer);
    this.stopWorkers();
    this.cpuUsage = null;
    this.gpuUpdated = this.fanUpdated = null;
  }
  resume() {
    if (this.stopped) return;
    this.suspended = false;
    this.previousCpu = cpuTimes();
    this.nvidiaHealthy = false;
    this.startTimer();
    this.restartSensors();
  }
  restartSensors() {
    if (this.stopped || this.suspended) return;
    this.stopWorkers();
    this.nvidiaHealthy = false;
    this.gpuUpdated = this.fanUpdated = null;
    this.gpuDetail = 'Reconnecting the GPU sensor.';
    this.fanDetail = 'Reconnecting the fan sensor service.';
    this.startNvidia();
    if (this.platform === 'win32') this.startWindowsSensors(false);
  }
  stop() {
    this.stopped = true;
    clearInterval(this.timer);
    this.stopWorkers();
    this.removeAllListeners();
  }
}
module.exports = { MetricsSampler, percentage };
