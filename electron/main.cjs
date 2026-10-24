const { app, BrowserWindow, Menu, Tray, ipcMain, nativeImage, screen, session } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { MetricsSampler } = require('./metrics.cjs');
const { makeTrayIcon } = require('./tray-icon.cjs');
const { loginItemTarget } = require('./login-item.cjs');

app.setName('机内气象');
if (process.env.WEATHER_STATION_USER_DATA) app.setPath('userData', path.resolve(process.env.WEATHER_STATION_USER_DATA));

const defaults = Object.freeze({
  source: 'cpu', launchAtLogin: false, pinned: false, reducedMotion: false,
  refreshInterval: 2000, stormThreshold: 90,
});
let preferences = { ...defaults };
let window = null;
let tray = null;
let sampler = null;
let expanded = false;
let quitting = false;
let lastWeather = '';
let settingsPath;

function normalizePreferences(patch, base = preferences) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new TypeError('Invalid preferences');
  const next = { ...base };
  if ('source' in patch) {
    if (!['cpu', 'gpu'].includes(patch.source)) throw new TypeError('Unknown weather source');
    next.source = patch.source;
  }
  for (const key of ['launchAtLogin', 'pinned', 'reducedMotion']) {
    if (key in patch) {
      if (typeof patch[key] !== 'boolean') throw new TypeError(`Invalid ${key}`);
      next[key] = patch[key];
    }
  }
  if ('refreshInterval' in patch) {
    if (![1000, 2000, 5000, 10000].includes(patch.refreshInterval)) throw new TypeError('Invalid refresh interval');
    next.refreshInterval = patch.refreshInterval;
  }
  if ('stormThreshold' in patch) {
    if (!Number.isFinite(patch.stormThreshold) || patch.stormThreshold < 70 || patch.stormThreshold > 99) throw new TypeError('Invalid storm threshold');
    next.stormThreshold = Math.round(patch.stormThreshold);
  }
  return next;
}

function savePreferences(patch) {
  const next = normalizePreferences(patch);
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  const temporary = `${settingsPath}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(next, null, 2));
  fs.renameSync(temporary, settingsPath);
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
  sampler?.setInterval(next.refreshInterval);
  window?.setAlwaysOnTop(next.pinned);
  window?.webContents.send('weather:preferences-changed', { ...next });
  refreshTrayMenu();
  if (sampler) updateTray(sampler.getSnapshot());
  return { ...next };
}

function boundedSize(display) {
  const area = display.workArea;
  return {
    width: Math.min(expanded ? 1120 : 432, area.width - 16),
    height: Math.min(expanded ? 820 : 760, area.height - 16),
  };
}

function positionWindow(nearTray = true) {
  if (!window || window.isDestroyed()) return;
  const bounds = tray?.getBounds();
  const hasTrayBounds = bounds && bounds.width > 0 && bounds.height > 0;
  const display = nearTray && hasTrayBounds ? screen.getDisplayNearestPoint({ x: bounds.x, y: bounds.y }) : screen.getDisplayMatching(window.getBounds());
  const area = display.workArea;
  const size = boundedSize(display);
  let x = Math.round(area.x + (area.width - size.width) / 2);
  let y = Math.round(area.y + (area.height - size.height) / 2);
  if (nearTray && hasTrayBounds && !expanded) {
    x = Math.round(bounds.x + bounds.width / 2 - size.width / 2);
    y = bounds.y < area.y + area.height / 2 ? bounds.y + bounds.height + 8 : bounds.y - size.height - 8;
  }
  x = Math.max(area.x + 8, Math.min(x, area.x + area.width - size.width - 8));
  y = Math.max(area.y + 8, Math.min(y, area.y + area.height - size.height - 8));
  window.setBounds({ ...size, x, y });
}

function showWindow(nearTray = true) {
  if (!window) return;
  positionWindow(nearTray);
  window.show();
  window.focus();
}

function refreshTrayMenu() {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '打开机内气象', click: () => showWindow() },
    { type: 'separator' },
    { label: '天气跟随 CPU', type: 'radio', checked: preferences.source === 'cpu', click: () => savePreferences({ source: 'cpu' }) },
    { label: '天气跟随 GPU', type: 'radio', checked: preferences.source === 'gpu', click: () => savePreferences({ source: 'gpu' }) },
    { type: 'separator' },
    { label: '窗口置顶', type: 'checkbox', checked: preferences.pinned, click: item => savePreferences({ pinned: item.checked }) },
    { label: '退出机内气象', click: () => app.quit() },
  ]));
}

function updateTray(snapshot) {
  if (!tray) return;
  const usage = snapshot[preferences.source].usage;
  let weather = 'cloudy';
  if (snapshot.memory.usage >= preferences.stormThreshold) weather = 'storm';
  else if (usage != null) weather = usage >= 80 ? 'rain' : usage >= 40 ? 'cloudy' : 'sunny';
  if (weather !== lastWeather) {
    tray.setImage(makeTrayIcon(nativeImage, weather));
    lastWeather = weather;
  }
  const names = { sunny: '晴天', cloudy: usage == null ? '等待传感器' : '多云', rain: '暴雨', storm: '雷暴' };
  tray.setToolTip(`机内气象 · ${names[weather]}\n${preferences.source.toUpperCase()} ${usage == null ? '不可用' : `${Math.round(usage)}%`} · 内存 ${Math.round(snapshot.memory.usage)}%`);
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
  handle('weather:snapshot', () => sampler.getSnapshot());
  handle('weather:preferences', () => ({ ...preferences }));
  handle('weather:save-preferences', patch => savePreferences(patch));
  handle('weather:expanded', value => {
    if (typeof value !== 'boolean') throw new TypeError('Expanded must be boolean');
    expanded = value;
    window.setSkipTaskbar(!value);
    positionWindow(!value);
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
    maximizable: false, fullscreenable: false, skipTaskbar: true,
    title: '机内气象', backgroundColor: '#f6f8fc',
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
    if (!expanded && !preferences.pinned) window.hide();
  });
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
    try { preferences = normalizePreferences(JSON.parse(fs.readFileSync(settingsPath, 'utf8')), defaults); } catch { preferences = { ...defaults }; }
    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    tray = new Tray(makeTrayIcon(nativeImage));
    tray.setToolTip('机内气象 · 正在观测');
    tray.on('click', () => window?.isVisible() ? window.hide() : showWindow());
    refreshTrayMenu();
    sampler = new MetricsSampler(preferences.refreshInterval).start();
    sampler.on('snapshot', snapshot => {
      updateTray(snapshot);
      if (window && !window.isDestroyed()) window.webContents.send('weather:snapshot-changed', snapshot);
    });
    wireIpc();
    createWindow();
    screen.on('display-metrics-changed', () => { if (window?.isVisible()) positionWindow(false); });
    app.on('activate', () => showWindow());
  }).catch(error => {
    console.error('Unable to start weather station:', error);
    app.quit();
  });
  app.on('window-all-closed', () => { /* The tray owns the lifetime of this app. */ });
  app.on('before-quit', () => {
    quitting = true;
    sampler?.stop();
    tray?.destroy();
    tray = null;
  });
  process.on('SIGINT', () => app.quit());
  process.on('SIGTERM', () => app.quit());
}
