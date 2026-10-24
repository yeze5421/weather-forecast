const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { _electron: electron } = require('playwright');
const { loginItemTarget } = require('../electron/login-item.cjs');

const root = path.resolve(__dirname, '..');
const artifacts = path.join(root, 'artifacts');
const userData = path.join(artifacts, 'smoke-profile');
fs.mkdirSync(userData, { recursive: true });
const defaults = { source: 'cpu', launchAtLogin: false, pinned: true, reducedMotion: true, refreshInterval: 1000, stormThreshold: 90 };
fs.writeFileSync(path.join(userData, 'preferences.json'), JSON.stringify(defaults));
const env = { ...process.env, WEATHER_STATION_USER_DATA: userData };
const packagedExecutable = process.env.WEATHER_STATION_SMOKE_EXECUTABLE;
delete env.ELECTRON_RUN_AS_NODE;
delete env.VITE_DEV_SERVER_URL;
let desktop;
const checks = [];
const layoutIssues = [];
const check = name => { checks.push(name); console.log(`PASS ${name}`); };

async function launch() {
  desktop = await electron.launch({ executablePath: packagedExecutable || require('electron'), args: packagedExecutable ? [] : ['.'], cwd: root, env, timeout: 30000 });
  const page = await desktop.firstWindow();
  await page.waitForFunction(() => window.weatherStation && document.querySelector('#connection-label')?.textContent === '实时观测中');
  return page;
}

(async () => {
  assert.deepEqual(loginItemTarget({ packaged: true, executable: 'C:\\Temp\\extracted\\Cirrus.exe', appPath: 'unused', portableExecutable: 'H:\\Apps\\Cirrus.exe' }), {
    name: 'CirrusWeatherStation', path: 'H:\\Apps\\Cirrus.exe', args: ['--hidden'],
  });
  check('portable startup targets the original persistent executable');
  let page = await launch();
  if (packagedExecutable) {
    const unpackedScript = path.join(path.dirname(packagedExecutable), 'resources', 'app.asar.unpacked', 'electron', 'sensors.ps1');
    assert(fs.existsSync(unpackedScript), 'Packaged WMI sampler must be unpacked for PowerShell');
    const parentPid = await desktop.evaluate(() => process.pid);
    const command = `@(Get-CimInstance Win32_Process | Where-Object { $_.ParentProcessId -eq ${parentPid} -and $_.CommandLine -like '*app.asar.unpacked*electron*sensors.ps1*' }).Count`;
    const { stdout } = await promisify(execFile)('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', command], { windowsHide: true, timeout: 15000 });
    assert(Number(stdout.trim()) >= 1, 'Packaged PowerShell sensor sampler should be running');
    check('packaged WMI script is unpacked and sampler process is alive');
  }
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  let snapshot;
  for (let attempt = 0; attempt < 150; attempt++) {
    snapshot = await page.evaluate(() => window.weatherStation.getSnapshot());
    if (Number.isFinite(snapshot.cpu.usage)) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert(Number.isFinite(snapshot.cpu.usage) && snapshot.cpu.usage >= 0 && snapshot.cpu.usage <= 100);
  assert(snapshot.cpu.name && !snapshot.cpu.name.includes('演示'));
  assert(snapshot.memory.totalGB > 0 && snapshot.memory.usedGB <= snapshot.memory.totalGB);
  assert(snapshot.memory.usage >= 0 && snapshot.memory.usage <= 100);
  assert(snapshot.fan.rpm === null || snapshot.fan.rpm >= 0);
  assert(snapshot.timestamp > Date.now() - 10000);
  await page.waitForFunction(() => /^\d/.test(document.querySelector('#cpu-value').textContent));
  assert.equal(await page.locator('#connection-label').textContent(), '实时观测中');
  assert.equal(await page.locator('#station-label').textContent(), '本机 · 实况观测');
  check('real hardware snapshot and live UI display');

  const webPreferences = await desktop.evaluate(({ BrowserWindow }) => {
    const preferences = BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences();
    return { sandbox: preferences.sandbox, contextIsolation: preferences.contextIsolation, nodeIntegration: preferences.nodeIntegration };
  });
  assert.deepEqual(webPreferences, { sandbox: true, contextIsolation: true, nodeIntegration: false });
  assert.equal(await page.evaluate(() => typeof window.require), 'undefined');
  const rejected = await page.evaluate(async () => {
    try { await window.weatherStation.savePreferences({ source: 'shell' }); return false; } catch { return true; }
  });
  assert(rejected);
  check('sandbox isolation and invalid IPC preference rejection');

  const compactLayout = await page.evaluate(() => ({
    width: innerWidth, height: innerHeight,
    contentWidth: document.documentElement.scrollWidth,
    contentHeight: document.documentElement.scrollHeight,
  }));
  if (compactLayout.contentHeight > compactLayout.height + 1 || compactLayout.contentWidth > compactLayout.width + 1) {
    layoutIssues.push({ view: 'compact', ...compactLayout });
    console.error('LAYOUT compact viewport overflow:', compactLayout);
  } else check('compact overview fits viewport without document overflow');
  await page.screenshot({ path: path.join(artifacts, 'desktop-compact.png') });
  for (const weather of ['rainy', 'storm']) {
    await page.locator('#preview-toggle').click();
    await page.locator(`[data-demo="${weather}"]`).click();
    await page.waitForFunction(expected => document.querySelector('.weather-card').dataset.weather === expected, weather);
    assert.equal(await page.locator('#connection-label').textContent(), '预览模式');
  }
  await page.locator('#toast').waitFor({ state: 'hidden', timeout: 5000 });
  await page.screenshot({ path: path.join(artifacts, 'desktop-storm.png') });
  await page.locator('#preview-toggle').click();
  await page.locator('#return-live').click();
  assert.equal(await page.locator('#connection-label').textContent(), '实时观测中');
  check('rain and storm previews are labelled and return to live');

  await page.locator('[data-source="gpu"]').click();
  await page.waitForFunction(() => document.querySelector('#hero-source').textContent === 'GPU');
  assert.equal((await page.evaluate(() => window.weatherStation.getPreferences())).source, 'gpu');
  check('GPU source switches and saves through IPC');

  await page.locator('#expand-button').click();
  await page.waitForFunction(() => innerWidth > 700);
  await page.locator('#toast').waitFor({ state: 'hidden', timeout: 5000 });
  const expandedLayout = await page.evaluate(() => ({
    width: innerWidth, height: innerHeight,
    contentWidth: document.documentElement.scrollWidth,
    contentHeight: document.documentElement.scrollHeight,
  }));
  if (expandedLayout.contentHeight > expandedLayout.height + 1 || expandedLayout.contentWidth > expandedLayout.width + 1) {
    layoutIssues.push({ view: 'expanded', ...expandedLayout });
    console.error('LAYOUT expanded viewport overflow:', expandedLayout);
  } else check('expanded overview fits viewport without document overflow');
  await page.screenshot({ path: path.join(artifacts, 'desktop-expanded.png'), fullPage: true });

  const csvPath = path.join(artifacts, 'desktop-live-observations.csv');
  await desktop.evaluate(({ app, BrowserWindow }, destination) => {
    app.__smokeDownload = null;
    BrowserWindow.getAllWindows()[0].webContents.session.once('will-download', (_event, item) => {
      item.setSavePath(destination);
      item.once('done', (_downloadEvent, state) => { app.__smokeDownload = { state, filename: item.getFilename() }; });
    });
  }, csvPath);
  await page.locator('nav [data-view="history"]').click();
  await page.locator('#export-history').click();
  let download;
  for (let attempt = 0; attempt < 100; attempt++) {
    download = await desktop.evaluate(({ app }) => app.__smokeDownload);
    if (download) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal(download?.state, 'completed');
  const csv = fs.readFileSync(csvPath, 'utf8');
  assert(csv.includes('"数据模式","时间","天气依据"'));
  assert(csv.includes('"实时"'));
  assert(!csv.includes('"预览"'));
  assert(csv.trim().split(/\r?\n/).length > 1);
  await page.locator('nav [data-view="overview"]').click();
  check('live CSV export contains actual records and excludes preview data');

  assert.equal(await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isAlwaysOnTop()), true);
  await page.evaluate(() => window.weatherStation.hide());
  assert.equal(await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()), false);
  await desktop.evaluate(({ app }) => app.emit('second-instance', {}, [], ''));
  assert.equal(await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()), true);
  await page.locator('#expand-button').click();
  await page.waitForFunction(() => innerWidth <= 432);
  await page.evaluate(() => window.weatherStation.setPinned(false));
  assert.equal(await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isAlwaysOnTop()), false);
  await page.evaluate(() => window.weatherStation.setPinned(true));
  await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
  assert.equal(await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length), 1);
  assert.equal(await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()), false);
  await desktop.evaluate(({ app }) => app.emit('second-instance', {}, [], ''));
  check('pin, expanded view, hide, close-to-tray and reopen');

  // Observe login-item configuration without writing to the host startup registry.
  await desktop.evaluate(({ app }) => {
    app.__smokeLoginCalls = [];
    app.__smokeOriginalLogin = app.setLoginItemSettings;
    app.setLoginItemSettings = options => app.__smokeLoginCalls.push(options);
  });
  await page.evaluate(() => window.weatherStation.savePreferences({ launchAtLogin: true }));
  await page.evaluate(() => window.weatherStation.savePreferences({ launchAtLogin: false }));
  const loginCalls = await desktop.evaluate(({ app }) => {
    app.setLoginItemSettings = app.__smokeOriginalLogin;
    return app.__smokeLoginCalls;
  });
  assert.equal(loginCalls.length, 2);
  assert.equal(loginCalls[0].name, 'CirrusWeatherStation');
  assert.equal(loginCalls[0].openAtLogin, true);
  assert.equal(loginCalls[1].openAtLogin, false);
  assert.deepEqual(loginCalls[0].args, packagedExecutable ? ['--hidden'] : [root, '--hidden']);
  check('startup toggle targets are configured without modifying host startup');
  await page.evaluate(() => window.weatherStation.savePreferences({ reducedMotion: true, stormThreshold: 92, source: 'gpu' }));
  await desktop.close();
  desktop = null;
  page = await launch();
  page.on('pageerror', error => pageErrors.push(error.message));
  const restored = await page.evaluate(() => window.weatherStation.getPreferences());
  assert.equal(restored.source, 'gpu');
  assert.equal(restored.stormThreshold, 92);
  assert.equal(restored.reducedMotion, true);
  assert.equal(restored.launchAtLogin, false);
  check('preferences persist across process relaunch');
  assert.deepEqual(pageErrors, []);
  await page.evaluate(() => window.weatherStation.savePreferences({ source: 'cpu', launchAtLogin: false, pinned: false, reducedMotion: false, refreshInterval: 2000, stormThreshold: 90 }));
  const result = { passed: checks.length, checks, snapshot, webPreferences, compactLayout, expandedLayout, layoutIssues, screenshots: ['desktop-compact.png', 'desktop-storm.png', 'desktop-expanded.png'], timestamp: new Date().toISOString() };
  fs.writeFileSync(path.join(artifacts, 'desktop-smoke-results.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  assert.deepEqual(layoutIssues, [], 'Compact layout must not overflow the viewport');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  if (desktop) await desktop.close();
});
