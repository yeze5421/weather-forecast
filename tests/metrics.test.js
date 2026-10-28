import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { MetricsSampler } from '../electron/metrics.cjs';

function harness(t) {
  let now = 0;
  const workers = [];
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const sampler = new MetricsSampler(2000, { platform: 'win32', clock: () => now, spawn: (command, args) => {
    const worker = new EventEmitter();
    worker.command = command; worker.args = args; worker.stdout = new PassThrough();
    worker.kill = () => { worker.killed = true; worker.emit('exit', 0); };
    workers.push(worker);
    return worker;
  } });
  t.after(() => sampler.stop());
  sampler.start();
  return { sampler, workers, time: value => { now = value; }, latest: name => workers.filter(worker => worker.command === name).at(-1) };
}

test('sensor exit schedules recovery without duplicate hosts; stop cancels retries', t => {
  const { sampler, workers, latest } = harness(t);
  latest('powershell.exe').emit('exit', 1);
  assert.equal(sampler.retries.has('windows'), true);
  t.mock.timers.tick(5000);
  assert.equal(workers.filter(worker => worker.command === 'powershell.exe').length, 2);
  latest('powershell.exe').emit('error', new Error('blocked'));
  sampler.stop();
  const count = workers.length;
  t.mock.timers.tick(60000);
  assert.equal(workers.length, count);
});

test('missing NVIDIA falls back to Windows, explains absent fans and preserves measured zero RPM', t => {
  const h = harness(t);
  h.latest('nvidia-smi').emit('error', Object.assign(new Error('missing'), { code: 'ENOENT' }));
  const windows = h.latest('powershell.exe');
  assert(windows.args.includes('-IncludeGpu'));
  windows.stdout.write(JSON.stringify({ kind: 'sensors', gpuUsage: 35, fanRpm: null, fanStatus: 'provider_missing' }) + '\n');
  let snapshot = h.sampler.getSnapshot();
  assert.equal(snapshot.gpu.usage, 35);
  assert.equal(snapshot.fan.rpm, null);
  assert.match(snapshot.sensors.fan.detail, /LibreHardwareMonitor/);
  windows.stdout.write(JSON.stringify({ kind: 'sensors', gpuUsage: null, fanRpm: 0, fanSource: 'LibreHardwareMonitor' }) + '\n');
  snapshot = h.sampler.getSnapshot();
  assert.equal(snapshot.gpu.usage, null);
  assert.equal(snapshot.fan.rpm, 0);
  assert.equal(snapshot.sensors.fan.state, 'live');
  h.time(40000);
  assert.equal(h.sampler.getSnapshot().fan.rpm, null);
  assert.equal(h.sampler.getSnapshot().sensors.fan.state, 'stale');
});

test('NVIDIA selects a real adapter and its temperature, and sleeping restarts fresh workers', t => {
  const h = harness(t);
  h.latest('nvidia-smi').stdout.write('GPU A, 10, 40\nGPU B, 95, 72\n');
  t.mock.timers.tick(120);
  assert.equal(h.sampler.getSnapshot().gpu.name, 'GPU B');
  assert.equal(h.sampler.getSnapshot().gpu.temperature, 72);
  h.sampler.suspend();
  assert.equal(h.sampler.getSnapshot().gpu.usage, null);
  assert.equal(h.sampler.retries.size, 0);
  assert(h.workers.every(worker => worker.killed));
  h.sampler.resume();
  assert.equal(h.sampler.getSnapshot().cpu.usage, null);
  assert.equal(h.workers.length, 4);
});

test('driver RPM fallback is identified as a GPU fan, accepts stopped fans and never invents RPM', t => {
  const h = harness(t);
  const windows = h.latest('powershell.exe');
  const send = value => windows.stdout.write(JSON.stringify({ kind: 'sensors', ...value }) + '\n');
  send({ fanRpm: 941, fanSource: 'NVIDIA NVML', fanKind: 'gpu', fanCount: 2, fanLabel: 'GPU 1 - Fan 2' });
  let snapshot = h.sampler.getSnapshot();
  assert.equal(snapshot.fan.rpm, 941);
  assert.equal(snapshot.fan.kind, 'gpu');
  assert.equal(snapshot.fan.count, 2);
  assert.match(snapshot.sensors.fan.detail, /not the CPU fan/);
  send({ fanRpm: 0, fanSource: 'NVIDIA NVML', fanCount: 2 });
  assert.equal(h.sampler.getSnapshot().fan.rpm, 0);
  assert.equal(h.sampler.getSnapshot().sensors.fan.state, 'live');
  send({ fanRpm: 35, fanSource: 'untrusted percentage sensor' });
  assert.equal(h.sampler.getSnapshot().fan.rpm, null);
  send({ fanRpm: null, fanSource: null, fanStatus: 'provider_missing' });
  assert.match(h.sampler.getSnapshot().sensors.fan.detail, /0\.9\.5\+/);
});

test('silent sensor services are supervised and cadence changes keep one host of each kind', t => {
  const h = harness(t);
  h.time(60000);
  h.sampler.sample();
  assert(h.sampler.retries.has('nvidia'));
  h.sampler.setPolicy({ interval: 5000, gpuInterval: 10, sensorInterval: 15, mode: 'background' });
  assert.equal(h.sampler.getSnapshot().runtime.mode, 'background');
  assert.equal(h.workers.filter(worker => !worker.killed && worker.command === 'powershell.exe').length, 1);
  assert(h.latest('nvidia-smi').args.includes('--loop=10'));
});
