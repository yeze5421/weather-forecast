const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { EventEmitter } = require('node:events');

const GiB = 1024 ** 3;
const percentage = value => Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : null;
const positive = value => Number.isFinite(value) && value >= 0 ? value : null;

function cpuTimes() {
  return os.cpus().reduce((sum, cpu) => {
    sum.idle += cpu.times.idle;
    sum.total += Object.values(cpu.times).reduce((a, b) => a + b, 0);
    return sum;
  }, { idle: 0, total: 0 });
}

class MetricsSampler extends EventEmitter {
  constructor(interval = 2000) {
    super();
    this.interval = interval;
    this.previousCpu = cpuTimes();
    this.cpuUsage = null;
    this.gpu = { usage: null, name: '未检测到 GPU 传感器', temperature: null };
    this.fan = { rpm: null, source: null };
    this.gpuUpdated = 0;
    this.fanUpdated = 0;
    this.children = new Set();
    this.stopped = false;
  }

  start() {
    this.stopped = false;
    this.startTimer();
    if (process.platform === 'win32') {
      this.startNvidia();
      this.startWindowsSensors(false);
    } else {
      this.startNvidia();
    }
    return this;
  }

  startTimer() {
    clearInterval(this.timer);
    this.timer = setInterval(() => this.sample(), this.interval);
    this.timer.unref?.();
  }

  setInterval(interval) {
    this.interval = interval;
    this.startTimer();
  }

  sample() {
    const now = cpuTimes();
    const total = now.total - this.previousCpu.total;
    this.cpuUsage = total > 0 ? percentage(100 * (1 - (now.idle - this.previousCpu.idle) / total)) : null;
    this.previousCpu = now;
    this.emit('snapshot', this.getSnapshot());
  }

  getSnapshot() {
    const timestamp = Date.now();
    const total = os.totalmem();
    const used = Math.max(0, total - os.freemem());
    return {
      timestamp,
      cpu: { usage: this.cpuUsage, name: os.cpus()[0]?.model?.trim() || 'CPU' },
      gpu: timestamp - this.gpuUpdated < 20000 ? { ...this.gpu } : { ...this.gpu, usage: null, temperature: null },
      memory: { usage: total > 0 ? percentage(used / total * 100) : 0, usedGB: used / GiB, totalGB: total / GiB },
      fan: timestamp - this.fanUpdated < 35000 ? { ...this.fan } : { rpm: null, source: null },
      uptime: os.uptime(),
    };
  }

  track(child) {
    this.children.add(child);
    child.once('exit', () => this.children.delete(child));
    child.once('error', () => this.children.delete(child));
    return child;
  }

  readLines(stream, onLine) {
    let pending = '';
    stream.setEncoding('utf8');
    stream.on('data', chunk => {
      pending += chunk;
      // A failing sensor must never grow an unbounded buffer.
      if (pending.length > 65536) pending = '';
      let end;
      while ((end = pending.indexOf('\n')) !== -1) {
        const line = pending.slice(0, end).trim();
        pending = pending.slice(end + 1);
        if (line) onLine(line);
      }
    });
  }

  startNvidia() {
    const child = this.track(spawn('nvidia-smi', [
      '--query-gpu=name,utilization.gpu,temperature.gpu',
      '--format=csv,noheader,nounits', '--loop=4',
    ], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }));
    let batch = [];
    let failed = false;
    const fallback = () => {
      if (failed || this.stopped) return;
      failed = true;
      if (process.platform === 'win32') this.startWindowsSensors(true);
    };
    child.once('error', fallback);
    child.once('exit', fallback);
    this.readLines(child.stdout, line => {
      const fields = line.split(',').map(value => value.trim());
      if (fields.length < 3) return;
      const usage = Number.parseFloat(fields[fields.length - 2]);
      if (!Number.isFinite(usage)) return;
      batch.push({
        name: fields.slice(0, -2).join(', '),
        usage: percentage(usage),
        temperature: positive(Number.parseFloat(fields[fields.length - 1])),
      });
      clearTimeout(this.nvidiaBatchTimer);
      this.nvidiaBatchTimer = setTimeout(() => {
        // On multi-GPU machines show the busiest adapter and its own temperature.
        this.gpu = batch.reduce((best, entry) => entry.usage > best.usage ? entry : best);
        this.gpuUpdated = Date.now();
        batch = [];
      }, 120);
    });
  }

  startWindowsSensors(includeGpu) {
    if (this.stopped || (includeGpu && this.windowsGpuStarted)) return;
    if (includeGpu) {
      this.windowsGpuStarted = true;
      // Replace the fan-only sampler; keep exactly one persistent PowerShell host.
      this.windowsChild?.kill();
    }
    // External programs cannot open Electron's virtual ASAR filesystem.
    const sensorScript = path.join(__dirname, 'sensors.ps1').replace(/([\\/])app\.asar([\\/])/i, '$1app.asar.unpacked$2');
    const child = this.track(spawn('powershell.exe', [
      '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-File', sensorScript, ...(includeGpu ? ['-IncludeGpu'] : []),
    ], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }));
    this.windowsChild = child;
    child.on('error', () => {});
    this.readLines(child.stdout, line => {
      try {
        const data = JSON.parse(line);
        if (data.kind !== 'sensors') return;
        this.fan = { rpm: positive(data.fanRpm), source: typeof data.fanSource === 'string' ? data.fanSource : null };
        this.fanUpdated = Date.now();
        if (includeGpu && typeof data.gpuUsage === 'number') {
          this.gpu = { usage: percentage(data.gpuUsage), name: data.gpuName || 'Windows GPU', temperature: null };
          this.gpuUpdated = Date.now();
        }
      } catch { /* Ignore diagnostics that are not sensor records. */ }
    });
  }

  stop() {
    this.stopped = true;
    clearInterval(this.timer);
    clearTimeout(this.nvidiaBatchTimer);
    for (const child of this.children) child.kill();
    this.children.clear();
    this.removeAllListeners();
  }
}

module.exports = { MetricsSampler, percentage };
