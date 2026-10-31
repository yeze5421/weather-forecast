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

async function assertEnglishInterface(page, view) {
  const text = await page.evaluate(() => [document.body.innerText, ...Array.from(document.querySelectorAll('[aria-label], [title]')).filter(element => element.id !== 'cpu-caption').map(element => `${element.getAttribute('aria-label') || ''} ${element.getAttribute('title') || ''}`)].join('\n'));
  assert(!/\p{Script=Han}/u.test(text), `Untranslated interface text in ${view}`);
}

async function launch() {
  desktop = await electron.launch({ executablePath: packagedExecutable || require('electron'), args: packagedExecutable ? [] : ['.'], cwd: root, env, timeout: 30000 });
  const page = await desktop.firstWindow();
  await page.waitForFunction(() => window.weatherStation && document.querySelector('#connection-label')?.textContent === 'Live');
  return page;
}

(async () => {
  assert.deepEqual(loginItemTarget({ packaged: true, executable: 'C:\\Temp\\extracted\\Cirrus.exe', appPath: 'unused', portableExecutable: 'H:\\Apps\\Cirrus.exe' }), {
    name: 'CirrusWeatherStation', path: 'H:\\Apps\\Cirrus.exe', args: ['--hidden'],
  });
  check('portable startup targets the original persistent executable');
  let page = await launch();
  const identity = await desktop.evaluate(({ app, BrowserWindow }) => ({ name: app.getName(), title: BrowserWindow.getAllWindows()[0].getTitle() }));
  assert.equal(identity.name, 'Cirrus');
  assert.equal(identity.title, 'Cirrus · Desktop Weather');
  await assertEnglishInterface(page, 'overview');
  check('English app name, window title and overview labels');
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
  assert(snapshot.cpu.name && !snapshot.cpu.name.includes('Demo'));
  assert(snapshot.memory.totalGB > 0 && snapshot.memory.usedGB <= snapshot.memory.totalGB);
  assert(snapshot.memory.usage >= 0 && snapshot.memory.usage <= 100);
  assert(snapshot.fan.rpm === null || snapshot.fan.rpm >= 0);
  assert(snapshot.timestamp > Date.now() - 10000);
  await page.waitForFunction(() => /^\d/.test(document.querySelector('#cpu-value').textContent));
  assert.equal(await page.locator('#connection-label').textContent(), 'Live');
  assert.equal(await page.locator('#station-label').textContent(), 'Local · Live readings');
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
    assert.equal(await page.locator('#connection-label').textContent(), 'Preview');
    await assertEnglishInterface(page, `${weather} preview`);
  }
  await page.locator('#toast').waitFor({ state: 'hidden', timeout: 5000 });
  const stormSurface = await page.locator('.weather-card').evaluate(element => getComputedStyle(element).backgroundColor);
  const themeSurface = await page.locator('nav .nav-item.active').evaluate(element => getComputedStyle(element).backgroundColor);
  assert.equal(stormSurface, themeSurface, 'Thunderstorms must keep the selected theme background');
  await page.screenshot({ path: path.join(artifacts, 'desktop-storm.png') });
  await page.locator('#preview-toggle').click();
  await page.locator('#return-live').click();
  assert.equal(await page.locator('#connection-label').textContent(), 'Live');
  check('rain and storm previews are labelled and return to live');
  await page.evaluate(() => window.weatherStation.savePreferences({ reducedMotion: false }));
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.locator('#preview-toggle').click();
  await page.locator('[data-demo="rainy"]').click();
  await page.waitForFunction(() => document.querySelector('.weather-card .weather-scene').dataset.wind === 'moving');
  const rotor = page.locator('.weather-card .ws-fan-rotor');
  const beforeRotation = await rotor.evaluate(element => getComputedStyle(element).transform);
  await page.waitForTimeout(300);
  const afterRotation = await rotor.evaluate(element => getComputedStyle(element).transform);
  assert.notEqual(beforeRotation, afterRotation, 'A positive RPM must visibly rotate the windmill');
  assert.equal(await page.locator('#fan-value').textContent(), '2,460');
  await page.evaluate(() => window.weatherStation.savePreferences({ reducedMotion: true }));
  await page.locator('#preview-toggle').click();
  await page.locator('#return-live').click();
  check('positive fan RPM rotates the actual windmill and reduce-motion remains available');

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
  await assertEnglishInterface(page, 'history');
  await page.locator('#export-history').click();
  let download;
  for (let attempt = 0; attempt < 100; attempt++) {
    download = await desktop.evaluate(({ app }) => app.__smokeDownload);
    if (download) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal(download?.state, 'completed');
  const csv = fs.readFileSync(csvPath, 'utf8');
  assert(csv.includes('"Mode","Time","Weather source"'));
  assert(csv.includes('"live"'));
  assert(!csv.includes('"preview"'));
  assert(csv.trim().split(/\r?\n/).length > 1);
  assert.match(await page.locator('.history-stats').innerText(), /Last 24 hours/);
  assert.equal(await page.locator('#history-page-label').textContent(), 'Page 1 / 1');
  await page.locator('nav [data-view="overview"]').click();
  await page.locator('[data-period="1440"]').click();
  assert.match(await page.locator('#chart-container svg').getAttribute('aria-label'), /24h/);
  await page.locator('[data-period="5"]').click();
  check('live CSV export contains actual records and excludes preview data');

  await page.locator('nav [data-view="settings"]').click();
  await assertEnglishInterface(page, 'settings');
  const detectedFans = await page.evaluate(async () => {
    for (let i = 0; i < 100; i++) {
      const snapshot = await window.weatherStation.getSnapshot();
      if (snapshot.fans?.length) return snapshot.fans;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return [];
  });
  if (detectedFans.length) {
    const chosen = detectedFans[0];
    await page.waitForFunction(id => [...document.querySelector('#setting-fan').options].some(o => o.value === id), chosen.id);
    await page.locator('#setting-fan').selectOption(chosen.id);
    await page.waitForFunction(async id => (await window.weatherStation.getSnapshot()).fan.id === id, chosen.id);
    assert.equal((await page.evaluate(() => window.weatherStation.getPreferences())).fanSelection, chosen.id);
    await page.locator('#setting-fan').selectOption('auto');
    await page.waitForFunction(async () => (await window.weatherStation.getPreferences()).fanSelection === 'auto');
    check('detected fan selection updates the live reading and is saved');
  }
  await page.screenshot({ path: path.join(artifacts, 'desktop-settings.png'), fullPage: true });
  await page.locator('nav [data-view="overview"]').click();
  check('English history, settings and preview interfaces');

  const themes = require('../shared/themes.json');
  assert.equal((await page.evaluate(() => window.weatherStation.getPreferences())).theme, 'midnight');
  await page.locator('nav [data-view="settings"]').click();
  for (const theme of themes) {
    await page.locator(`[data-theme-option="${theme.id}"]`).click();
    await page.waitForFunction(id => document.documentElement.dataset.theme === id, theme.id);
    assert.equal((await page.evaluate(() => window.weatherStation.getPreferences())).theme, theme.id);
    assert.equal(await page.locator(`[data-theme-option="${theme.id}"]`).getAttribute('aria-pressed'), 'true');
    assert.equal(await desktop.evaluate(({ nativeTheme }) => nativeTheme.shouldUseDarkColors), theme.dark);
    const colors = await page.evaluate(() => ({ background: getComputedStyle(document.body).backgroundColor, text: getComputedStyle(document.body).color }));
    assert.notEqual(colors.background, colors.text);
    await page.screenshot({ path: path.join(artifacts, `theme-${theme.id}.png`), fullPage: true });
  }
  const invalidThemeRejected = await page.evaluate(async () => {
    try { await window.weatherStation.savePreferences({ theme: '../../invalid' }); return false; } catch { return true; }
  });
  assert(invalidThemeRejected);
  const brightness = page.locator('#setting-brightness');
  await brightness.scrollIntoViewIfNeeded();
  const slider = await brightness.boundingBox();
  await page.mouse.move(slider.x + slider.width - 8, slider.y + slider.height / 2);
  await page.mouse.down();
  await page.mouse.move(slider.x + slider.width / 2, slider.y + slider.height / 2, { steps: 8 });
  await page.mouse.up();
  const selectedBrightness = Number(await brightness.inputValue());
  assert(selectedBrightness > 60 && selectedBrightness < 100);
  await page.waitForFunction(async value => (await window.weatherStation.getPreferences()).brightness === value, selectedBrightness);
  assert(Math.abs(Number(await page.locator('#brightness-overlay').evaluate(e => getComputedStyle(e).opacity)) - (100 - selectedBrightness) / 100) < 0.01);
  assert.equal(await page.locator('#brightness-overlay').evaluate(e => getComputedStyle(e).pointerEvents), 'none');
  await page.locator('[data-theme-option="forest"]').click();
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'forest');
  assert.equal(Number(await brightness.inputValue()), selectedBrightness);
  check('mouse drag adjusts and saves window brightness across themes');
  await page.locator('nav [data-view="overview"]').click();
  check('all five themes switch through settings, update native colors and reject invalid IDs');

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
  // Exercise real native lifecycle events without locking or suspending the host.
  const upgradePreferences = await page.evaluate(() => window.weatherStation.getPreferences());
  assert.equal(upgradePreferences.energySaving, true);
  assert.equal(upgradePreferences.alertsEnabled, false);
  assert.equal(upgradePreferences.smoothWeather, true);
  for (const patch of [{ windowMode: 'shell' }, { alertsEnabled: 'yes' }, { alertDuration: -1 }, { miniPosition: { x: 1e12, y: 0 } }]) {
    assert(await page.evaluate(async value => { try { await window.weatherStation.savePreferences(value); return false; } catch { return true; } }, patch));
  }
  await page.evaluate(() => window.weatherStation.savePreferences({ refreshInterval: 1000, energySaving: true }));
  await desktop.evaluate(({ powerMonitor }) => powerMonitor.emit('on-battery'));
  assert.equal((await page.evaluate(() => window.weatherStation.getSnapshot())).runtime.mode, 'battery');
  await desktop.evaluate(({ powerMonitor }) => powerMonitor.emit('lock-screen'));
  assert.equal((await page.evaluate(() => window.weatherStation.getSnapshot())).runtime.interval, 15000);
  await desktop.evaluate(({ powerMonitor }) => { powerMonitor.emit('unlock-screen'); powerMonitor.emit('on-ac'); });
  assert.equal((await page.evaluate(() => window.weatherStation.getSnapshot())).runtime.interval, 1000);
  check('upgrade defaults, new IPC validation and battery / lock policies');

  const historyBefore = (await page.evaluate(() => window.weatherStation.getHistory())).length;
  await page.evaluate(() => { window.__smokePushes = 0; window.__smokeOff = window.weatherStation.onSnapshot(() => window.__smokePushes++); return window.weatherStation.hide(); });
  await page.waitForTimeout(100);
  await page.evaluate(() => { window.__smokePushes = 0; });
  await page.waitForTimeout(5500);
  assert.equal(await page.evaluate(() => window.__smokePushes), 0);
  await page.waitForFunction(async previous => (await window.weatherStation.getHistory()).length > previous, historyBefore, { timeout: 25000 });
  assert.equal((await page.evaluate(() => window.weatherStation.getSnapshot())).runtime.mode, 'background');
  await desktop.evaluate(({ app }) => app.emit('second-instance', {}, [], ''));
  await page.waitForFunction(() => !document.body.classList.contains('inactive'));
  await page.evaluate(() => window.__smokeOff());
  check('hidden window receives no reading pushes while session history continues');

  await desktop.evaluate(({ powerMonitor }) => powerMonitor.emit('suspend'));
  const sleeping = await page.evaluate(() => window.weatherStation.getSnapshot());
  assert.equal(sleeping.runtime.mode, 'suspended');
  assert.equal(sleeping.cpu.usage, null);
  assert.equal(sleeping.gpu.usage, null);
  await desktop.evaluate(({ powerMonitor }) => powerMonitor.emit('resume'));
  await page.waitForFunction(async () => Number.isFinite((await window.weatherStation.getSnapshot()).cpu.usage), { timeout: 15000 });
  const retry = await page.evaluate(() => window.weatherStation.retrySensors());
  assert.equal(retry, true);
  assert.equal(await page.evaluate(() => window.weatherStation.retrySensors()), false);
  await page.waitForFunction(() => document.querySelector('#fan-detail').textContent.length > 15);
  check('sleep invalidates readings, resume reconnects and manual retry is rate limited');

  await page.locator('#mini-button').click();
  await page.waitForFunction(() => innerWidth === 320 && document.body.classList.contains('mini-mode'));
  assert(Math.abs(Number(await page.locator('#brightness-overlay').evaluate(e => getComputedStyle(e).opacity)) - (100 - selectedBrightness) / 100) < 0.01);
  assert.equal(await page.locator('.mini-widget').isVisible(), true);
  const miniLayout = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight }));
  assert.equal(miniLayout.height, 210);
  assert(miniLayout.scrollWidth <= miniLayout.width && miniLayout.scrollHeight <= miniLayout.height);
  await assertEnglishInterface(page, 'mini mode');
  await desktop.evaluate(({ BrowserWindow, screen }) => { const w = BrowserWindow.getAllWindows()[0]; const area = screen.getPrimaryDisplay().workArea; w.setPosition(area.x + 40, area.y + 50); w.emit('move'); w.emit('blur'); });
  await page.waitForTimeout(500);
  assert.equal(await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()), true);
  const miniPosition = (await page.evaluate(() => window.weatherStation.getPreferences())).miniPosition;
  assert(Number.isInteger(miniPosition.x) && Number.isInteger(miniPosition.y));
  await page.locator('#mini-source').click();
  await page.waitForFunction(() => document.querySelector('#mini-source').textContent === 'CPU');
  await page.screenshot({ path: path.join(artifacts, 'desktop-mini.png') });
  await desktop.close(); desktop = null;
  page = await launch();
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.waitForFunction(() => document.body.classList.contains('mini-mode'));
  for (let attempt = 0; attempt < 50; attempt++) {
    if (await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible())) break;
    await page.waitForTimeout(100);
  }
  const restoredMini = await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds());
  assert.equal(restoredMini.x, miniPosition.x);
  assert.equal(restoredMini.y, miniPosition.y);
  await page.locator('#mini-open').click();
  await page.waitForFunction(() => innerWidth > 700 && !document.body.classList.contains('mini-mode'));
  check('mini desktop fits, stays open on blur, switches source and restores its dragged position');

  await page.locator('nav [data-view="settings"]').click();
  assert.equal(await page.locator('#setting-alerts').isChecked(), false);
  await page.locator('#setting-alerts').check();
  await page.locator('#setting-alert-duration').selectOption('30');
  await page.locator('#setting-temperature').selectOption('90');
  await page.waitForFunction(async () => (await window.weatherStation.getPreferences()).temperatureThreshold === 90);
  await page.locator('#setting-alerts').uncheck();
  assert.equal((await page.evaluate(() => window.weatherStation.getPreferences())).alertsEnabled, false);
  await assertEnglishInterface(page, 'sensor diagnostics and alert settings');
  await page.screenshot({ path: path.join(artifacts, 'desktop-upgrade-settings.png'), fullPage: true });
  await page.locator('nav [data-view="overview"]').click();
  await page.locator('#preview-toggle').click();
  await page.locator('[data-demo="rainy"]').click();
  assert.equal(await page.locator('#gpu-temperature').textContent(), '73 °C');
  await page.locator('#preview-toggle').click();
  await page.locator('#return-live').click();
  check('temperature preview, English diagnostics and opt-in alert settings');
  await page.evaluate(() => window.weatherStation.savePreferences({ reducedMotion: true, stormThreshold: 92, source: 'gpu', theme: 'forest' }));
  await desktop.close();
  desktop = null;
  page = await launch();
  page.on('pageerror', error => pageErrors.push(error.message));
  const restored = await page.evaluate(() => window.weatherStation.getPreferences());
  assert.equal(restored.source, 'gpu');
  assert.equal(restored.stormThreshold, 92);
  assert.equal(restored.reducedMotion, true);
  assert.equal(restored.launchAtLogin, false);
  assert.equal(restored.theme, 'forest');
  assert.equal(restored.brightness, selectedBrightness);
  assert(Math.abs(Number(await page.locator('#brightness-overlay').evaluate(e => getComputedStyle(e).opacity)) - (100 - selectedBrightness) / 100) < 0.01);
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'forest');
  check('preferences persist across process relaunch');
  assert.deepEqual(pageErrors, []);
  await page.evaluate(() => window.weatherStation.savePreferences({ source: 'cpu', launchAtLogin: false, pinned: false, reducedMotion: false, refreshInterval: 2000, stormThreshold: 90, theme: 'midnight', brightness: 100, windowMode: 'widget', alertsEnabled: false, energySaving: true }));
  const result = { passed: checks.length, checks, snapshot, webPreferences, compactLayout, expandedLayout, layoutIssues, screenshots: ['desktop-compact.png', 'desktop-storm.png', 'desktop-expanded.png'], timestamp: new Date().toISOString() };
  fs.writeFileSync(path.join(artifacts, 'desktop-smoke-results.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ passed: result.passed, checks, compactLayout, expandedLayout, layoutIssues, screenshots: result.screenshots }, null, 2));
  assert.deepEqual(layoutIssues, [], 'Compact layout must not overflow the viewport');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  if (desktop) await desktop.close();
});
