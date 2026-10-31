const { app, BrowserWindow, Menu, Tray, ipcMain, nativeImage, nativeTheme, screen, session, powerMonitor, Notification } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { MetricsSampler } = require('./metrics.cjs');
const { makeTrayIcon } = require('./tray-icon.cjs');
const { loginItemTarget } = require('./login-item.cjs');
const { loadPreferences } = require('./preferences.cjs');
const themes = require('../shared/themes.json');
const { defaults, normalizePreferences } = require('./settings.cjs');
const { samplingPolicy } = require('./runtime-policy.cjs');
const { WeatherController } = require('../shared/weather-state.cjs');
const { RainbowController } = require('../shared/rainbow.cjs');
const { AlertMonitor } = require('./alerts.cjs');
const { recordHistory } = require('./history.cjs');

app.setName('Cirrus');
if (process.env.WEATHER_STATION_USER_DATA) app.setPath('userData', path.resolve(process.env.WEATHER_STATION_USER_DATA));

let preferences = { ...defaults };
let window = null;
let tray = null;
let sampler = null;
let expanded = false;
let quitting = false;
let lastWeather = '';
let settingsPath;
let movingWindow = false;
let placementReady = false;
let moveTimer;
let lastRetry = 0;
let notificationStatus = 'Off';
const power = { locked: false, battery: false };
const weatherController = new WeatherController();
const rainbowController = new RainbowController();
const rainbowKey = () => `${preferences.source}:${preferences.stormThreshold}:${preferences.smoothWeather}`;
const alertMonitor = new AlertMonitor();
const history = [];
const notifications = new Set();

function writePreferences() {
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  const temporary = `${settingsPath}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(preferences, null, 2));
  fs.renameSync(temporary, settingsPath);
}

function currentSnapshot() {
  const snapshot = sampler.getSnapshot();
  snapshot.weather = weatherController.update(snapshot, preferences.source, preferences.stormThreshold, preferences.smoothWeather);
  snapshot.weather.rainbow = rainbowController.active(snapshot.weather.id, snapshot.timestamp, rainbowKey());
  snapshot.notificationStatus = notificationStatus;
  return snapshot;
}

function updatePolicy() {
  if (!sampler) return;
  sampler.setPolicy(samplingPolicy(preferences, { ...power, visible: Boolean(window?.isVisible()) }));
  if (window && !window.isDestroyed()) window.webContents.send('weather:activity', { active: window.isVisible() && !power.locked });
}

function persistMiniPosition() {
  if (!window || window.isDestroyed() || preferences.windowMode !== 'mini' || movingWindow || !placementReady) return;
  const { x, y } = window.getBounds();
  preferences = { ...preferences, miniPosition: { x, y } };
  try { writePreferences(); } catch { /* A read-only profile must not interrupt dragging. */ }
}

function showAlert(alert) {
  if (!Notification.isSupported()) { notificationStatus = 'Notifications are unavailable on this system'; return; }
  try {
  const notification = new Notification({ title: `Cirrus · ${alert.title}`, body: alert.body, silent: true, icon: path.join(__dirname, '..', 'build', 'icon.png') });
  notifications.add(notification);
  notification.once('click', () => showWindow());
  notification.once('failed', () => { notificationStatus = 'Windows could not show the notification'; notifications.delete(notification); });
  notification.once('close', () => notifications.delete(notification));
  notificationStatus = 'Enabled · Windows notification settings apply';
  notification.show();
  } catch { notificationStatus = 'Windows could not show the notification'; }
}

function savePreferences(patch) {
  const next = normalizePreferences(patch, preferences);
  const modeChanged = next.windowMode !== preferences.windowMode;
  if (modeChanged && preferences.windowMode === 'mini' && window && !('miniPosition' in patch)) { const { x, y } = window.getBounds(); next.miniPosition = { x, y }; }
  if (['alertsEnabled', 'source', 'stormThreshold', 'alertDuration', 'temperatureThreshold'].some(key => next[key] !== preferences[key])) alertMonitor.clearPending();
  if (next.launchAtLogin !== preferences.launchAtLogin) {
    app.setLoginItemSettings({
      openAtLogin: next.launchAtLogin,
      ...loginItemTarget({
        packaged: app.isPackaged, executable: process.execPath, appPath: app.getAppPath(),
        portableExecutable: process.env.PORTABLE_EXECUTABLE_FILE,
      }),
    });
  }
  preferences = next;
  sampler?.setFanSelection(next.fanSelection);
  writePreferences();
  notificationStatus = preferences.alertsEnabled ? 'Enabled · Windows notification settings apply' : 'Off';
  if (!preferences.alertsEnabled) { for (const notification of notifications) notification.close(); notifications.clear(); }
  applyNativeTheme();
  updatePolicy();
  window?.setAlwaysOnTop(next.pinned);
  expanded = next.windowMode === 'station';
  if (modeChanged && window) { window.setSkipTaskbar(!expanded); positionWindow(next.windowMode === 'widget'); }
  window?.webContents.send('weather:preferences-changed', { ...next });
  refreshTrayMenu();
  if (sampler) updateTray(currentSnapshot());
  return { ...next };
}

function boundedSize(display) {
  const area = display.workArea;
  return {
    width: Math.min(preferences.windowMode === 'mini' ? 320 : expanded ? 1120 : 432, area.width - 16),
    height: Math.min(preferences.windowMode === 'mini' ? 210 : expanded ? 820 : 760, area.height - 16),
  };
}

function positionWindow(nearTray = true) {
  if (!window || window.isDestroyed()) return;
  const bounds = tray?.getBounds();
  const hasTrayBounds = bounds && bounds.width > 0 && bounds.height > 0;
  const mini = preferences.windowMode === 'mini';
  const savedPosition = mini ? preferences.miniPosition : null;
  const display = savedPosition ? screen.getDisplayNearestPoint(savedPosition) : nearTray && hasTrayBounds ? screen.getDisplayNearestPoint({ x: bounds.x, y: bounds.y }) : screen.getDisplayMatching(window.getBounds());
  const area = display.workArea;
  const size = boundedSize(display);
  let x = Math.round(area.x + (area.width - size.width) / 2);
  let y = Math.round(area.y + (area.height - size.height) / 2);
  if (savedPosition) { x = savedPosition.x; y = savedPosition.y; }
  else if (mini) { x = area.x + area.width - size.width - 24; y = area.y + area.height - size.height - 24; }
  else if (nearTray && hasTrayBounds && !expanded) {
    x = Math.round(bounds.x + bounds.width / 2 - size.width / 2);
    y = bounds.y < area.y + area.height / 2 ? bounds.y + bounds.height + 8 : bounds.y - size.height - 8;
  }
  x = Math.max(area.x + 8, Math.min(x, area.x + area.width - size.width - 8));
  y = Math.max(area.y + 8, Math.min(y, area.y + area.height - size.height - 8));
  movingWindow = true;
  window.setBounds({ ...size, x, y });
  movingWindow = false;
  placementReady = true;
}

function showWindow(nearTray = true) {
  if (!window) return;
  positionWindow(nearTray);
  window.show();
  window.focus();
}

function applyNativeTheme() {
  const theme = themes.find(theme => theme.id === preferences.theme) || themes[0];
  nativeTheme.themeSource = theme.dark ? 'dark' : 'light';
  window?.setBackgroundColor(theme.colors.bg);
}

function refreshTrayMenu() {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open Cirrus', click: () => showWindow() },
    { label: 'Window mode', submenu: [['mini', 'Mini desktop'], ['widget', 'Tray widget'], ['station', 'Full station']].map(([id, label]) => ({ label, type: 'radio', checked: preferences.windowMode === id, click: () => { savePreferences({ windowMode: id }); showWindow(id === 'widget'); } })) },
    { type: 'separator' },
    { label: 'Weather follows CPU', type: 'radio', checked: preferences.source === 'cpu', click: () => savePreferences({ source: 'cpu' }) },
    { label: 'Weather follows GPU', type: 'radio', checked: preferences.source === 'gpu', click: () => savePreferences({ source: 'gpu' }) },
    { type: 'separator' },
    { label: 'Always on top', type: 'checkbox', checked: preferences.pinned, click: item => savePreferences({ pinned: item.checked }) },
    { label: 'Appearance', submenu: themes.map(theme => ({ label: theme.name, type: 'radio', checked: preferences.theme === theme.id, click: () => savePreferences({ theme: theme.id }) })) },
    { label: 'Quit Cirrus', click: () => app.quit() },
  ]));
}

function updateTray(snapshot) {
  if (!tray) return;
  const usage = snapshot[preferences.source].usage;
  let weather = snapshot.weather?.id || 'unknown';
  if (weather === 'rainy') weather = 'rain';
  if (weather !== lastWeather) {
    tray.setImage(makeTrayIcon(nativeImage, weather));
    lastWeather = weather;
  }
  const names = { sunny: 'Sunny', cloudy: 'Cloudy', unknown: 'Awaiting sensor', rain: 'Heavy rain', storm: 'Storm' };
  tray.setToolTip(`Cirrus · ${names[weather]}\n${preferences.source.toUpperCase()} ${usage == null ? 'Unavailable' : `${Math.round(usage)}%`} · Memory ${Math.round(snapshot.memory.usage)}%`);
}

function validateSender(event) {
  if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) {
    throw new Error('Untrusted renderer');
  }
}

function handle(channel, handler) {
  ipcMain.handle(channel, (event, ...args) => {
    validateSender(event);
    return handler(...args);
  });
}

function wireIpc() {
  handle('weather:snapshot', () => currentSnapshot());
  handle('weather:history', () => history.slice());
  handle('weather:mode', mode => { savePreferences({ windowMode: mode }); return mode; });
  handle('weather:retry-sensors', () => {
    if (Date.now() - lastRetry < 10000) return false;
    lastRetry = Date.now(); sampler.restartSensors(); return true;
  });
  handle('weather:preferences', () => ({ ...preferences }));
  handle('weather:save-preferences', patch => savePreferences(patch));
  handle('weather:expanded', value => {
    if (typeof value !== 'boolean') throw new TypeError('Expanded must be boolean');
    savePreferences({ windowMode: value ? 'station' : 'widget' });
    return value;
  });
  handle('weather:pinned', value => savePreferences({ pinned: value }));
  handle('weather:hide', () => window.hide());
  handle('weather:quit', () => { setImmediate(() => app.quit()); });
}

function createWindow() {
  const size = boundedSize(screen.getPrimaryDisplay());
  window = new BrowserWindow({
    ...size, show: false, frame: false, resizable: false,
    maximizable: false, fullscreenable: false, skipTaskbar: !expanded,
    title: 'Cirrus', backgroundColor: (themes.find(theme => theme.id === preferences.theme) || themes[0]).colors.bg,
    icon: makeTrayIcon(nativeImage, 'sunny'),
    alwaysOnTop: preferences.pinned,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true, sandbox: true, nodeIntegration: false,
      webSecurity: true, spellcheck: false,
    },
  });
  window.setMenu(null);
  window.on('close', event => {
    if (!quitting) { event.preventDefault(); window.hide(); }
  });
  window.on('blur', () => {
    if (preferences.windowMode === 'widget' && !preferences.pinned) window.hide();
  });
  window.on('show', () => { updatePolicy(); if (sampler) window.webContents.send('weather:snapshot-changed', currentSnapshot()); });
  window.on('hide', updatePolicy);
  window.on('move', () => { if (movingWindow || !placementReady || preferences.windowMode !== 'mini') return; clearTimeout(moveTimer); moveTimer = setTimeout(persistMiniPosition, 250); });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.webContents.on('will-attach-webview', event => event.preventDefault());
  window.once('ready-to-show', () => {
    if (!process.argv.includes('--hidden')) showWindow(false);
  });
  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl && !app.isPackaged) {
    const parsed = new URL(devUrl);
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname) || parsed.protocol !== 'http:') throw new Error('The development server must use loopback HTTP');
    window.loadURL(parsed.href);
  } else {
    window.loadURL(pathToFileURL(path.join(__dirname, '..', 'dist', 'index.html')).href);
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => showWindow());
  app.whenReady().then(() => {
    app.setAppUserModelId('local.cirrus.weatherstation');
    settingsPath = path.join(app.getPath('userData'), 'preferences.json');
    // v1.0.0 used a localized product name. Keep its spelling out of the English UI.
    const legacyAppName = '\u673a\u5185\u6c14\u8c61';
    const loaded = loadPreferences({
      settingsPath, defaults, normalize: normalizePreferences,
      legacySettingsPath: process.env.WEATHER_STATION_USER_DATA ? null : path.join(app.getPath('appData'), legacyAppName, 'preferences.json'),
    });
    preferences = loaded.preferences;
    expanded = preferences.windowMode === 'station';
    notificationStatus = preferences.alertsEnabled ? 'Enabled · Windows notification settings apply' : 'Off';
    applyNativeTheme();
    if (loaded.migrated && preferences.launchAtLogin) {
      try {
        app.setLoginItemSettings({
          openAtLogin: true,
          ...loginItemTarget({
            packaged: app.isPackaged, executable: process.execPath, appPath: app.getAppPath(),
            portableExecutable: process.env.PORTABLE_EXECUTABLE_FILE,
          }),
        });
      } catch { console.warn('Could not refresh the login item after the app rename.'); }
    }
    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    tray = new Tray(makeTrayIcon(nativeImage));
    tray.setToolTip('Cirrus · Observing');
    tray.on('click', () => window?.isVisible() ? window.hide() : showWindow());
    refreshTrayMenu();
    sampler = new MetricsSampler(preferences.refreshInterval);
    sampler.setFanSelection(preferences.fanSelection);
    sampler.start();
    sampler.on('snapshot', snapshot => {
      snapshot.weather = weatherController.update(snapshot, preferences.source, preferences.stormThreshold, preferences.smoothWeather);
      snapshot.weather.rainbow = rainbowController.update(snapshot.weather.id, snapshot.timestamp, rainbowKey());
      snapshot.notificationStatus = notificationStatus;
      recordHistory(history, snapshot);
      updateTray(snapshot);
      if (power.locked) alertMonitor.clearPending();
      else for (const alert of alertMonitor.update(snapshot, preferences)) showAlert(alert);
      if (window && !window.isDestroyed() && window.isVisible() && !power.locked) window.webContents.send('weather:snapshot-changed', snapshot);
    });
    wireIpc();
    createWindow();
    try { power.battery = powerMonitor.isOnBatteryPower(); } catch {}
    updatePolicy();
    powerMonitor.on('lock-screen', () => { power.locked = true; updatePolicy(); });
    powerMonitor.on('unlock-screen', () => { power.locked = false; updatePolicy(); if (window?.isVisible()) window.webContents.send('weather:snapshot-changed', currentSnapshot()); });
    powerMonitor.on('on-battery', () => { power.battery = true; updatePolicy(); });
    powerMonitor.on('on-ac', () => { power.battery = false; updatePolicy(); });
    powerMonitor.on('suspend', () => { sampler.suspend(); weatherController.reset(); rainbowController.reset(); alertMonitor.clearPending(); });
    powerMonitor.on('resume', () => { sampler.resume(); weatherController.reset(); rainbowController.reset(); alertMonitor.clearPending(); updatePolicy(); });
    screen.on('display-metrics-changed', () => { if (window?.isVisible()) positionWindow(false); });
    app.on('activate', () => showWindow());
  }).catch(error => {
    console.error('Unable to start weather station:', error);
    app.quit();
  });
  app.on('window-all-closed', () => { /* The tray owns the lifetime of this app. */ });
  app.on('before-quit', () => {
    quitting = true;
    clearTimeout(moveTimer);
    persistMiniPosition();
    sampler?.stop();
    tray?.destroy();
    tray = null;
  });
  process.on('SIGINT', () => app.quit());
  process.on('SIGTERM', () => app.quit());
}
