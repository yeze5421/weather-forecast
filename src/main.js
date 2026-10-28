import './style.css';
import './themes.css';
import './upgrades.css';
import { version } from '../package.json';
import { DEFAULT_THEME, resolveTheme, applyTheme } from './themes.js';
import { themePickerMarkup } from './theme-picker.js';
import { WEATHER_STATES, deriveWeather, createDemoSnapshot, formatPercent, summarizeHistory } from './weather-model.js';
import { weatherSceneMarkup, updateWeatherScene } from './weather-scene.js';

const iconPaths = {
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
  cloud: '<path d="M6 18a5 5 0 0 1-.6-10A7 7 0 0 1 19 10a4 4 0 0 1-1 8Z"/>',
  rain: '<path d="M5 15a4 4 0 0 1 .4-8A6 6 0 0 1 17 8a4 4 0 0 1 2 7M8 17l-1 4m6-4-1 4m6-4-1 4"/>',
  storm: '<path d="M5 15a4 4 0 0 1 .4-8A6 6 0 0 1 17 8a4 4 0 0 1 2 7M13 12l-4 6h4l-2 5 6-8h-5"/>',
  cpu: '<rect x="6" y="6" width="12" height="12" rx="3"/><rect x="9" y="9" width="6" height="6" rx="1"/><path d="M9 2v4m6-4v4M9 18v4m6-4v4M2 9h4m-4 6h4m12-6h4m-4 6h4"/>',
  gpu: '<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="14" cy="12" r="3"/><path d="M6 10h2m-2 4h2m-1 4v3m4-3v3"/>',
  memory: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 10v4m5-4v4m5-4v4M6 18v3m4-3v3m4-3v3m4-3v3"/>',
  fan: '<circle cx="12" cy="12" r="2"/><path d="M11 10C3 8 8 0 12 4c2 2 1 4 0 6m2 1c2-8 10-3 6 1-2 2-4 1-6 0m-1 2c8 2 3 10-1 6-2-2-1-4 0-6m-2-1C8 20 0 15 4 11c2-2 4-1 6 0"/>',
  chart: '<path d="M4 3v17h17M7 14l4-5 4 3 5-7"/>',
  settings: '<path d="m10 3-1 3-3 1-2 3 2 2-1 3 3 3 3-1 2 2 3-1 1-3 3-1v-4l-3-1-1-3-3 1Z"/><circle cx="12" cy="11" r="3"/>',
  pin: '<path d="m9 3 6 0-1 6 4 4v2H6v-2l4-4ZM12 15v7"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  expand: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  play: '<path d="m9 5 10 7-10 7Z"/>',
  back: '<path d="m14 6-6 6 6 6"/>',
  monitor: '<rect x="3" y="3" width="18" height="14" rx="2"/><path d="M8 21h8m-4-4v4"/>',
  wind: '<path d="M3 8h12a3 3 0 1 0-3-3M2 12h17a3 3 0 1 1-3 3M4 16h5a2 2 0 1 1-2 2"/>',
  leaf: '<path d="M20 3C8 1 1 9 6 16s17 0 14-13ZM5 20 16 8"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
};
const icon = (name, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconPaths[name] || iconPaths.cloud}</svg>`;
const weatherIcon = id => ({ sunny: 'sun', cloudy: 'cloud', rainy: 'rain', storm: 'storm', unknown: 'cloud' }[id]);
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const desktop = Boolean(window.weatherStation);
const defaults = { source: 'cpu', launchAtLogin: false, pinned: false, reducedMotion: false, refreshInterval: 2000, stormThreshold: 90, theme: DEFAULT_THEME, energySaving: true, smoothWeather: true, alertsEnabled: false, alertDuration: 60, temperatureThreshold: 85, windowMode: desktop ? 'widget' : 'station' };
let preferences = { ...defaults };
try { if (!desktop) preferences = { ...defaults, ...JSON.parse(localStorage.getItem('cirrus-preferences') || '{}') }; } catch {}
if (!['cpu', 'gpu'].includes(preferences.source)) preferences.source = 'cpu';
preferences.theme = resolveTheme(preferences.theme).id;
applyTheme(preferences.theme);
let demo = !desktop;
let demoWeather = 'sunny';
let snapshot = desktop ? null : makeDemo(demoWeather);
let liveSnapshot = null;
let view = 'overview';
let expanded = !desktop;
let period = 5;
let histories = { live: [], demo: [] };
let toastTimer;
let lastSampleTime = 0;
let previewInterval;
let active = !document.hidden;
let activityGeneration = 0;
const app = $('#app');

app.innerHTML = `
  <div class="app-shell">
    <aside class="sidebar">
      <a class="brand" href="#" aria-label="Cirrus home"><span class="brand-mark">${icon('sun')}</span><span><strong>Cirrus</strong><small>DESKTOP WEATHER</small></span></a>
      <div class="sidebar-label">YOUR LITTLE SKY</div>
      <nav class="navigation" aria-label="Main navigation">
        <button class="nav-item active" data-view="overview">${icon('sun')}<span>Overview</span><span class="nav-indicator"></span></button>
        <button class="nav-item" data-view="history">${icon('chart')}<span>History</span></button>
        <button class="nav-item" data-view="settings">${icon('settings')}<span>Settings</span></button>
      </nav>
      <div class="sidebar-note"><div class="tiny-landscape"><span class="tiny-sun"></span><span class="tiny-hill h1"></span><span class="tiny-hill h2"></span></div><p>Every computer.<br>A sky of its own.</p><span>A LITTLE SKY, JUST FOR YOU.</span></div>
      <div class="sidebar-footer"><span class="local-dot"></span> Local readings <span>${version}</span></div>
    </aside>

    <div class="workspace">
      <header class="topbar">
        <div class="breadcrumb"><span class="compact-brand">${icon('sun')} Cirrus</span><span class="wide-crumb">My station <span>/</span> <b id="breadcrumb-title">Overview</b></span></div>
        <div class="window-actions">
          <div class="preview-anchor"><button id="preview-toggle" class="preview-button" aria-expanded="false" aria-controls="preview-popover">${icon('play')}<span>Preview</span></button>
            <div id="preview-popover" class="popover" hidden><div class="popover-heading">Change the weather <span>Demo data</span></div><div class="preview-options">${[['sunny','Sunny','sun'],['cloudy','Cloudy','cloud'],['rainy','Heavy rain','rain'],['storm','Storm','storm']].map(([id,label,i])=>`<button data-demo="${id}" aria-pressed="false">${icon(i)}<span>${label}</span></button>`).join('')}</div><p>Preview leaves your actual computer load unchanged.</p>${desktop ? '<button id="return-live" class="return-live">Back to live readings →</button>' : '<div class="browser-note">Browser preview. Use the desktop app for live readings.</div>'}</div>
          </div>
          <span class="toolbar-divider"></span>
          <button id="pin-button" class="icon-button desktop-action" title="Always on top" aria-label="Always on top" aria-pressed="false">${icon('pin')}</button>
          <button id="expand-button" class="icon-button" title="Toggle widget / full view" aria-label="Toggle widget / full view">${icon('expand')}</button>
          <button id="mobile-settings" class="icon-button mobile-only" title="Settings" aria-label="Settings">${icon('settings')}</button>
          <button id="hide-button" class="icon-button desktop-action" title="Hide to system tray" aria-label="Hide to system tray">${icon('close')}</button>
        </div>
      </header>

      <main>
        <section id="overview-view" class="view">
          <div class="page-heading"><div><div class="eyebrow">YOUR COMPUTER, A LITTLE WEATHER.</div><h1>Your desktop weather<span class="heading-dot">.</span></h1><p>A little sky for everything your computer does.</p></div><div class="connection-badge"><span></span><b id="connection-label">Connecting</b></div></div>
          <div class="dashboard-grid">
            <div class="primary-column">
              <section class="weather-card" data-weather="sunny" aria-label="Current desktop weather">
                <div class="weather-card-top"><span class="observation-label">${icon('monitor')} <span id="station-label">Local · Live readings</span></span><div class="source-toggle" aria-label="Weather source"><button data-source="cpu" aria-pressed="true">CPU</button><button data-source="gpu" aria-pressed="false">GPU</button></div></div>
                <div class="weather-summary"><div><div class="weather-kicker" id="weather-kicker">WEATHER RIGHT NOW</div><h2 id="weather-title">Awaiting data</h2><p id="weather-description">Finding the weather inside your computer.</p></div><div class="hero-load"><strong id="hero-load">—</strong><span><b id="hero-source">CPU</b> usage</span></div></div>
                <div class="weather-scene" aria-hidden="true">${weatherSceneMarkup()}</div>
                <div class="weather-card-bottom"><span id="weather-advice">Leave a little room for clear skies.</span><span class="weather-state-icon" id="weather-state-icon">${icon('sun')}</span></div>
              </section>
              <div class="metrics-grid">
                <article class="metric-card"><div class="metric-label"><span id="processor-icon">${icon('cpu')}</span><span id="processor-label">Processor</span><span class="metric-dot purple"></span></div><div class="metric-value"><strong id="cpu-value">—</strong><small>%</small></div><div class="meter"><span id="cpu-meter"></span></div><div class="metric-caption" id="cpu-caption">Awaiting data</div></article>
                <article class="metric-card"><div class="metric-label">${icon('memory')}<span>Memory</span><span class="metric-dot blue"></span></div><div class="metric-value"><strong id="memory-value">—</strong><small>%</small></div><div class="meter memory-meter"><span id="memory-meter"></span></div><div class="metric-caption" id="memory-caption">Awaiting data</div></article>
                <article class="metric-card fan-card"><div class="metric-label">${icon('fan','fan-icon')}<span>Fan</span><span class="metric-dot green"></span></div><div class="metric-value"><strong id="fan-value">—</strong><small>RPM</small></div><div class="wind-track">${icon('wind')}<span id="wind-caption">Awaiting wind</span></div><div class="metric-caption" id="fan-caption">Awaiting sensor</div></article>
              </div>
              <section class="trend-card"><div class="section-heading"><div><h3>Load over time <span id="chart-series">CPU</span></h3><p>Every little change, in view.</p></div><div class="period-toggle" aria-label="Time range"><button data-period="1">1 min</button><button class="active" data-period="5">5 min</button><button data-period="15">15 min</button></div></div><div id="chart-container" class="chart-container"></div><div class="chart-footer"><span><i></i><span id="chart-legend">CPU usage</span></span><span id="chart-average">Average —</span></div></section>
            </div>
            <aside class="secondary-column">
              <section class="interpretation-card"><div class="section-heading"><h3>How is your computer?</h3>${icon('leaf')}</div><div id="mood-label" class="mood-label">Room to breathe</div><p id="mood-description">Plenty of room.<br>Let your ideas grow.</p><div class="insight-divider"></div><div class="insight-row"><span>Weather source</span><strong id="current-source">CPU load</strong></div><div class="insight-row"><span>Uptime</span><strong id="uptime">—</strong></div><div class="insight-row"><span>Refresh interval</span><strong id="refresh-label">Every 2s</strong></div><div class="insight-foot">${icon('check')}<span>Your data stays on this computer</span></div></section>
              <section class="legend-card"><h3>Read the sky</h3><p class="legend-subtitle">A little less counting. A little more feeling.</p><div class="legend-row"><span class="legend-icon sunny">${icon('sun')}</span><div><b>Sunny</b><span>Light and easy</span></div><small>&lt; 40%</small></div><div class="legend-row"><span class="legend-icon cloudy">${icon('cloud')}</span><div><b>Cloudy</b><span>Getting things done</span></div><small>40–79%</small></div><div class="legend-row"><span class="legend-icon rainy">${icon('rain')}</span><div><b>Heavy rain</b><span>Working at full speed</span></div><small>≥ 80%</small></div><div class="legend-row"><span class="legend-icon storm">${icon('storm')}</span><div><b>Storm</b><span>Memory needs some room</span></div><small id="legend-threshold">≥ 90%</small></div><div class="legend-note">Memory warnings take priority over CPU / GPU weather</div></section>
              <button id="widget-button" class="widget-promo"><span class="mini-tray">${icon('sun')}<b id="mini-load">—</b><span>◷</span></span><strong>Keep a little sky nearby ${icon('arrow')}</strong><span>Switch to the compact widget</span></button>
            </aside>
          </div>
          <footer class="page-footer"><span>${icon('leaf')} Fewer numbers. A little more sky.</span><span id="updated-at">Awaiting the first reading</span><button class="mobile-only text-button" data-view="history">History ${icon('arrow')}</button></footer>
        </section>

        <section id="history-view" class="view" hidden><button class="back-button mobile-only" data-view="overview">${icon('back')} Back to overview</button><div class="page-heading"><div><div class="eyebrow">EVERY LITTLE CHANGE.</div><h1>A record of your sky<span class="heading-dot">.</span></h1><p>Keep track of the passing clouds.</p></div><button id="export-history" class="secondary-button">${icon('download')} Export CSV</button></div><div class="history-stats"><article><span>Readings</span><strong id="history-count">0</strong><small>This session · Last 30 minutes</small></article><article><span>Average load</span><strong id="history-average">—</strong><small id="history-source">CPU usage</small></article><article><span>Peak load</span><strong id="history-maximum">—</strong><small>The busiest moment in your sky</small></article></div><section class="records-card"><div class="section-heading"><h3>Recent readings</h3><span id="history-mode" class="subtle-label">Live data</span></div><div class="table-scroll"><table><thead><tr><th>Time</th><th>Weather</th><th>CPU</th><th>GPU</th><th>Memory</th><th>Fan RPM</th></tr></thead><tbody id="history-rows"></tbody></table></div><p class="records-note">Readings from this session. Preview and live records are kept separately.</p></section></section>

        <section id="settings-view" class="view" hidden><button class="back-button mobile-only" data-view="overview">${icon('back')} Back to overview</button><div class="page-heading"><div><div class="eyebrow">MAKE YOURSELF AT HOME.</div><h1>Make this sky yours<span class="heading-dot">.</span></h1><p>Set a rhythm that feels right.</p></div></div>${themePickerMarkup(icon)}<div class="settings-card"><h3>Observation preferences</h3><label class="setting-row"><span><b>Weather source</b><small>Choose which load sets the weather</small></span><select id="setting-source"><option value="cpu">CPU · Processor</option><option value="gpu">GPU · Graphics</option></select></label><label class="setting-row"><span><b>Sampling interval</b><small>Less frequent readings use fewer resources</small></span><select id="setting-refresh"><option value="1000">Every 1s</option><option value="2000">Every 2s</option><option value="5000">Every 5s</option></select></label><div class="setting-row threshold-row"><span><b>Storm threshold</b><small>Show a thunderstorm when memory reaches this level</small></span><label class="range-setting"><input id="setting-threshold" aria-label="Memory threshold for thunderstorms" type="range" min="70" max="98" step="1"><output id="threshold-output">90%</output></label></div><h3 class="settings-subheading">A quieter companion</h3><label class="setting-row"><span><b>Reduce motion</b><small>Pause clouds, rain and the windmill</small></span><input class="switch" id="setting-motion" type="checkbox" role="switch"></label><label class="setting-row"><span><b>Always on top</b><small id="pin-setting-note">Keep the weather in view while you work</small></span><input class="switch" id="setting-pinned" type="checkbox" role="switch"></label><label class="setting-row"><span><b>Launch at login</b><small id="login-setting-note">Start in the system tray when you sign in</small></span><input class="switch" id="setting-login" type="checkbox" role="switch"></label></div><div class="about-card"><span class="brand-mark">${icon('sun')}</span><div><strong>Cirrus <span>${version} · DESKTOP WEATHER</span></strong><p>Weather from your computer. A little calm for you.</p></div></div><p class="settings-footnote">GPU and fan readings depend on hardware and driver support. Missing values stay blank.</p></section>
      </main>
    </div>
  </div>
  <div id="toast" class="toast" role="status" hidden></div>
`;

$('#expand-button').insertAdjacentHTML('beforebegin', `<button id="mini-button" class="icon-button" title="Mini desktop mode" aria-label="Mini desktop mode">${icon('monitor')}</button>`);
$('.metrics-grid').insertAdjacentHTML('afterend', `<div class="thermal-strip"><span>GPU temperature <strong id="gpu-temperature">—</strong></span><span id="thermal-note">Waiting for a temperature sensor</span></div>`);
$('#settings-view .about-card').insertAdjacentHTML('beforebegin', `
  <div class="settings-card upgrades-settings">
    <h3>Desktop and power</h3>
    <label class="setting-row"><span><b>Window mode</b><small>Drag the mini header to keep a little sky anywhere</small></span><select id="setting-mode"><option value="mini">Mini desktop</option><option value="widget">Tray widget</option><option value="station">Full station</option></select></label>
    <label class="setting-row"><span><b>Energy saving</b><small>Slow sampling in the background, on battery and while locked</small></span><input class="switch" id="setting-energy" type="checkbox" role="switch"></label>
    <label class="setting-row"><span><b>Smooth weather</b><small>Soften short spikes and keep skies from changing too often</small></span><input class="switch" id="setting-smoothing" type="checkbox" role="switch"></label>
    <h3 class="settings-subheading">Quiet alerts</h3>
    <label class="setting-row"><span><b>Desktop alerts</b><small>Local notices for sustained load, memory pressure or GPU heat</small></span><input class="switch" id="setting-alerts" type="checkbox" role="switch"></label>
    <label class="setting-row"><span><b>Wait before notifying</b><small>Each kind of alert has a 15-minute cooldown</small></span><select id="setting-alert-duration"><option value="30">30 seconds</option><option value="60">1 minute</option><option value="120">2 minutes</option></select></label>
    <label class="setting-row"><span><b>GPU temperature alert</b><small>Only when a real temperature reading is available</small></span><select id="setting-temperature"><option value="60">60 °C</option><option value="65">65 °C</option><option value="70">70 °C</option><option value="75">75 °C</option><option value="80">80 °C</option><option value="85">85 °C</option><option value="90">90 °C</option><option value="95">95 °C</option><option value="100">100 °C</option></select></label>
    <p id="notification-status" class="diagnostic-note">Alerts are off by default.</p>
  </div>
  <section class="settings-card diagnostics-card" aria-label="Sensor diagnostics"><div class="diagnostic-heading"><h3>Sensor health</h3><button id="retry-sensors" class="secondary-button">Reconnect</button></div><p class="diagnostic-note">Actual sensor status, including while Preview is open.</p>
    <div class="sensor-row"><span>GPU <b id="gpu-status">Waiting</b></span><p id="gpu-detail">Waiting for sensor status.</p></div>
    <div class="sensor-row"><span>Fan <b id="fan-status">Waiting</b></span><p id="fan-detail">Waiting for sensor status.</p></div>
    <p id="power-status" class="diagnostic-note">Local sampling</p>
  </section>`);
app.insertAdjacentHTML('beforeend', `<section class="mini-widget" aria-label="Mini desktop weather"><header class="mini-header"><span>Cirrus <small id="mini-mode-label">LIVE SKY</small></span><div><button id="mini-source" aria-label="Switch CPU or GPU">CPU</button><button id="mini-open" title="Open full station" aria-label="Open full station">${icon('expand')}</button><button id="mini-hide" title="Hide to system tray" aria-label="Hide to system tray">${icon('close')}</button></div></header><div class="mini-sky"><div class="weather-scene mini-scene" aria-hidden="true">${weatherSceneMarkup()}</div><div class="mini-reading"><span id="mini-weather">Awaiting data</span><strong id="mini-usage">—</strong><small id="mini-sensor">CPU usage</small></div></div><footer class="mini-footer"><span>Memory <b id="mini-memory">—</b></span><span>GPU <b id="mini-temperature">—</b></span><span>Fan <b id="mini-fan">—</b></span></footer></section>`);

if (!desktop) $$('.desktop-action').forEach(el => { el.hidden = true; });

function toast(message) {
  clearTimeout(toastTimer);
  $('#toast').textContent = message;
  $('#toast').hidden = false;
  toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 3000);
}

async function savePreferences(patch) {
  try {
    if (desktop) preferences = { ...defaults, ...await window.weatherStation.savePreferences(patch) };
    else {
      preferences = { ...preferences, ...patch };
      localStorage.setItem('cirrus-preferences', JSON.stringify(preferences));
    }
    syncPreferences();
    if (demo && patch.source) { snapshot = makeDemo(demoWeather); seedDemoHistory(); }
    if (demo && patch.stormThreshold) { snapshot = makeDemo(demoWeather); seedDemoHistory(); }
    render();
  } catch { toast('Could not save preferences. Please try again.'); }
}

function syncPreferences() {
  const theme = applyTheme(preferences.theme);
  $$('[data-theme-option]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.themeOption === theme.id)));
  $('#current-theme').textContent = theme.name;
  $$('[data-source]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.source === preferences.source)));
  $('#setting-source').value = preferences.source;
  $('#setting-refresh').value = String(preferences.refreshInterval);
  $('#setting-threshold').value = preferences.stormThreshold;
  $('#threshold-output').value = `${preferences.stormThreshold}%`;
  $('#setting-motion').checked = preferences.reducedMotion;
  $('#setting-pinned').checked = preferences.pinned;
  $('#setting-login').checked = preferences.launchAtLogin;
  $('#setting-mode').value = preferences.windowMode;
  $('#setting-energy').checked = preferences.energySaving;
  $('#setting-smoothing').checked = preferences.smoothWeather;
  $('#setting-alerts').checked = preferences.alertsEnabled;
  $('#setting-alert-duration').value = String(preferences.alertDuration);
  $('#setting-temperature').value = String(preferences.temperatureThreshold);
  $('#setting-alert-duration').disabled = !preferences.alertsEnabled;
  $('#setting-temperature').disabled = !preferences.alertsEnabled;
  expanded = preferences.windowMode === 'station';
  document.body.classList.toggle('mini-mode', preferences.windowMode === 'mini');
  document.body.classList.toggle('widget-preview', !desktop && preferences.windowMode === 'widget');
  $('#pin-button').setAttribute('aria-pressed', String(preferences.pinned));
  $('#legend-threshold').textContent = `≥ ${preferences.stormThreshold}%`;
  $('#refresh-label').textContent = `Every ${preferences.refreshInterval / 1000}s`;
  document.documentElement.classList.toggle('reduced-motion', preferences.reducedMotion);
  if (!desktop) {
    $('#setting-pinned').disabled = true;
    $('#setting-login').disabled = true;
    $('#setting-energy').disabled = true;
    $('#setting-alerts').disabled = true;
    $('#retry-sensors').disabled = true;
    $('#pin-setting-note').textContent = 'Available in the desktop app';
    $('#login-setting-note').textContent = 'Available in the desktop app';
  }
}

function setView(next) {
  view = next;
  $$('.view').forEach(el => { el.hidden = el.id !== `${next}-view`; });
  $$('.nav-item').forEach(el => { el.classList.toggle('active', el.dataset.view === next); el.setAttribute('aria-current', el.dataset.view === next ? 'page' : 'false'); });
  $('#breadcrumb-title').textContent = { overview: 'Overview', history: 'History', settings: 'Settings' }[next];
  if (next === 'history') renderHistory();
  $('main').scrollTop = 0;
}

async function toggleExpanded() {
  expanded = !expanded;
  if (desktop) { try { await window.weatherStation.setExpanded(expanded); } catch { toast('Could not change the window size. Please try again.'); } }
  else await savePreferences({ windowMode: expanded ? 'station' : 'widget' });
}

async function setWindowMode(mode) {
  if (desktop) { try { await window.weatherStation.setWindowMode(mode); } catch { toast('Could not change window mode.'); } }
  else await savePreferences({ windowMode: mode });
}

function renderDiagnostics() {
  for (const type of ['gpu', 'fan']) {
    const sensor = liveSnapshot?.sensors?.[type];
    $(`#${type}-status`).textContent = sensor ? sensor.state[0].toUpperCase() + sensor.state.slice(1) : 'Preview only';
    $(`#${type}-detail`).textContent = sensor?.detail || 'Live sensor diagnostics are available in the desktop app.';
  }
  const runtime = liveSnapshot?.runtime;
  $('#power-status').textContent = runtime ? `${runtime.mode[0].toUpperCase() + runtime.mode.slice(1)} · CPU / memory every ${runtime.interval / 1000}s · GPU ${runtime.gpuInterval}s · Fan ${runtime.sensorInterval}s` : 'Browser preview uses demo readings.';
  $('#notification-status').textContent = !desktop ? 'Desktop alerts are available in the Windows app.' : preferences.alertsEnabled ? liveSnapshot?.notificationStatus || 'Enabled · Windows notification settings apply' : 'Alerts are off. No background notices will be shown.';
}

function number(value, digits = 0) { return Number.isFinite(value) ? value.toLocaleString('en-US', { maximumFractionDigits: digits }) : '—'; }
function time(timestamp) { return new Date(timestamp).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
function uptimeLabel(seconds) { if (!Number.isFinite(seconds)) return '—'; const hours = Math.floor(seconds / 3600); return hours > 24 ? `${Math.floor(hours / 24)}d ${hours % 24}h` : `${hours}h ${Math.floor(seconds % 3600 / 60)}m`; }
function selectedHistory() { return histories[demo ? 'demo' : 'live']; }
function sampleWeather(sample) {
  const raw = deriveWeather(sample, preferences.source, preferences.stormThreshold);
  return !demo && sample?.weather?.source === preferences.source ? { ...raw, ...WEATHER_STATES[sample.weather.id], ...sample.weather } : raw;
}

function makeDemo(weather = demoWeather, timestamp = Date.now()) {
  const sample = createDemoSnapshot(weather, preferences.source, timestamp);
  sample.memory.usage = weather === 'storm'
    ? Math.max(96, preferences.stormThreshold)
    : Math.min(sample.memory.usage, preferences.stormThreshold - 5);
  sample.memory.usedGB = sample.memory.totalGB * sample.memory.usage / 100;
  return sample;
}

function addSample(sample, key) {
  if (!sample || !Number.isFinite(sample.timestamp)) return;
  const list = histories[key];
  if (list.at(-1)?.timestamp === sample.timestamp) return;
  list.push(sample);
  const cutoff = Date.now() - 30 * 60 * 1000;
  while (list.length && (list[0].timestamp < cutoff || list.length > 1800)) list.shift();
}

function seedDemoHistory() {
  histories.demo = [];
  const now = Date.now();
  for (let i = 149; i >= 0; i--) {
    const sample = makeDemo(demoWeather, now - i * 2000);
    const channel = sample[preferences.source];
    channel.usage = Math.max(1, Math.min(100, channel.usage + Math.sin(i * .19) * 5 + Math.cos(i * .47) * 2.5));

    addSample(sample, 'demo');
  }
}

function setDemo(weather) {
  demo = true;
  demoWeather = weather;
  snapshot = makeDemo(weather);

  seedDemoHistory();
  closePreview();
  setView('overview');
  render();
  toast(`Preview: ${{ sunny: 'Sunny', cloudy: 'Cloudy', rainy: 'Heavy rain', storm: 'Storm' }[weather]} · Demo data`);
}

function render() {
  const reading = deriveWeather(snapshot, preferences.source, preferences.stormThreshold);
  const stable = !demo && snapshot?.weather?.source === preferences.source ? snapshot.weather : null;
  const state = stable ? { ...reading, ...WEATHER_STATES[stable.id], ...stable } : reading;
  const selected = snapshot?.[preferences.source];
  const load = Number.isFinite(selected?.usage) ? selected.usage : null;
  const mem = snapshot?.memory;
  const rpm = snapshot?.fan?.rpm;
  const weather = state.id;
  const temperature = snapshot?.gpu?.temperature;
  const hasTemperature = Number.isFinite(temperature);
  $('#gpu-temperature').textContent = hasTemperature ? `${number(temperature)} °C` : '—';
  $('#thermal-note').textContent = hasTemperature ? (demo ? 'Demo temperature' : 'NVIDIA GPU sensor') : 'Temperature unavailable on this sensor';
  $('.thermal-strip').classList.toggle('is-hot', hasTemperature && temperature >= preferences.temperatureThreshold);
  $('#mini-weather').textContent = state.label;
  $('#mini-usage').textContent = formatPercent(load);
  $('#mini-sensor').textContent = `${preferences.source.toUpperCase()} usage`;
  $('#mini-source').textContent = preferences.source.toUpperCase();
  $('#mini-memory').textContent = formatPercent(mem?.usage);
  $('#mini-temperature').textContent = hasTemperature ? `${number(temperature)}°` : '—';
  $('#mini-fan').textContent = Number.isFinite(rpm) ? `${number(rpm)} RPM` : '—';
  $('#mini-mode-label').textContent = demo ? 'PREVIEW' : 'LIVE SKY';
  renderDiagnostics();
  $('.weather-card').dataset.weather = weather;
  $('#weather-title').textContent = state.label;
  $('#weather-description').textContent = state.description;
  $('#weather-advice').textContent = state.advice;
  $('#weather-kicker').textContent = state.reason === 'memory' ? 'MEMORY PRESSURE RISING' : 'WEATHER RIGHT NOW';
  $('#hero-load').innerHTML = `${number(load)}${load !== null ? '<em>%</em>' : ''}`;
  $('#hero-source').textContent = preferences.source.toUpperCase();
  $('#station-label').textContent = demo ? 'Local · Preview' : 'Local · Live readings';
  $('#connection-label').textContent = demo ? 'Preview' : (snapshot ? 'Live' : 'Connecting');
  $('.connection-badge').classList.toggle('is-demo', demo);
  $('#preview-toggle').classList.toggle('is-demo', demo);
  $('#processor-label').textContent = preferences.source === 'cpu' ? 'Processor' : 'Graphics';
  $('#processor-icon').innerHTML = icon(preferences.source);
  $('#cpu-value').textContent = number(load);
  $('#memory-value').textContent = number(mem?.usage);
  $('#fan-value').textContent = number(rpm);
  $('#cpu-meter').style.width = `${Math.min(100, Math.max(0, load ?? 0))}%`;
  $('#memory-meter').style.width = `${Math.min(100, Math.max(0, mem?.usage ?? 0))}%`;
  $('#cpu-caption').textContent = load === null ? 'Sensor unavailable' : `${preferences.source.toUpperCase()} · ${{sunny:'Light load',cloudy:'Steady work',rainy:'Working hard',storm:'Active',unknown:'Awaiting data'}[weather]}`;
  $('#cpu-caption').title = selected?.name || '';
  $('#memory-caption').textContent = mem ? `${number(mem.usedGB, 1)} / ${number(mem.totalGB, 1)} GB` : 'Awaiting data';
  $('#memory-caption').classList.toggle('warning-text', (mem?.usage ?? 0) >= preferences.stormThreshold);
  $('#wind-caption').textContent = Number.isFinite(rpm) ? (rpm === 0 ? 'Fan stopped' : rpm < 1500 ? 'Light breeze' : rpm < 2500 ? 'Steady breeze' : 'Wind picking up') : 'No RPM source';
  $('#fan-caption').textContent = Number.isFinite(rpm) ? (demo ? 'Demo sensor' : snapshot.fan.kind === 'gpu' ? 'GPU fan · NVIDIA' : snapshot.fan.source || 'RPM sensor') : 'See Settings · Sensor health';
  $('#fan-caption').title = demo ? 'Demonstration readings' : snapshot?.sensors?.fan?.detail || 'No fan RPM sensor is connected.';
  $('#mini-fan').title = demo ? 'Demonstration readings' : snapshot?.sensors?.fan?.detail || 'No fan RPM sensor is connected.';
  $('.fan-icon').style.animationDuration = Number.isFinite(rpm) && rpm > 0 ? `${Math.max(.4, 2400 / rpm)}s` : '0s';
  $('.fan-icon').style.animationPlayState = Number.isFinite(rpm) && rpm > 0 ? 'running' : 'paused';
  $('#weather-state-icon').innerHTML = icon(weatherIcon(weather));
  $('#current-source').textContent = `${preferences.source.toUpperCase()} load`;
  $('#uptime').textContent = uptimeLabel(snapshot?.uptime);
  const mood = {
    sunny: ['Room to breathe', 'Plenty of room for your next idea.'],
    cloudy: ['A little busy', 'A few clouds as your computer gets things done.'],
    rainy: ['Working at full speed', 'Heavy computation ahead. Give it time or pause unused tasks.'],
    storm: ['Give memory some room', 'Memory is filling up. Try closing unused apps or tabs.'],
    unknown: ['Waiting for the sky', 'This sensor has no readings yet. Try the other weather source.'],
  }[weather];
  $('#mood-label').textContent = mood[0];
  $('#mood-description').textContent = mood[1];
  $('#mini-load').textContent = formatPercent(load);
  $('.mini-tray .icon').outerHTML = icon(weatherIcon(weather));
  $('#updated-at').textContent = snapshot ? `${demo ? 'Preview data' : 'Updated'} ${time(snapshot.timestamp)}` : 'Awaiting the first reading';
  $$('[data-demo]').forEach(button => button.setAttribute('aria-pressed', String(demo && button.dataset.demo === demoWeather)));
  $$('.weather-scene').forEach(scene => updateWeatherScene(scene, weather, rpm ?? null, { reducedMotion: preferences.reducedMotion }));
  if (preferences.windowMode === 'mini') return;
  renderChart();
  if (view === 'history') renderHistory();
}

function renderChart() {
  const list = selectedHistory().filter(s => s.timestamp >= Date.now() - period * 60000);
  const summary = summarizeHistory(list, preferences.source);
  const series = preferences.source.toUpperCase();
  $('#chart-series').textContent = series;
  $('#chart-legend').textContent = `${series} usage${demo ? ' · preview' : ''}`;
  $('#chart-average').textContent = `Average ${formatPercent(summary.avg)}`;
  if (!list.length || !summary.count) {
    $('#chart-container').innerHTML = '<div class="chart-empty">No readings yet<br><span>Your chart will grow as readings arrive.</span></div>';
    return;
  }
  const width = 620, height = 128, left = 34, right = 604, top = 12, bottom = 103;
  const end = Date.now(), start = end - period * 60000;
  const points = list.map(s => ({x: left + (s.timestamp-start)/(end-start)*(right-left), y: bottom-(s[preferences.source]?.usage ?? 0)/100*(bottom-top), valid: Number.isFinite(s[preferences.source]?.usage)}));
  let paths = [], segment = [];
  for (const point of points) { if (point.valid) segment.push(point); else if (segment.length) { paths.push(segment); segment = []; } }
  if (segment.length) paths.push(segment);
  const lineMarkup = paths.map(segment => {
    const d = segment.map((p,i) => `${i ? 'L' : 'M'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
    return `<path d="${d} L${segment.at(-1).x.toFixed(2)},${bottom} L${segment[0].x.toFixed(2)},${bottom}Z" fill="url(#chart-fill)"/><path d="${d}" fill="none" stroke="var(--chart-line)" stroke-width="2.2" stroke-linejoin="round"/>`;
  }).join('');
  const last = points.filter(p=>p.valid).at(-1);
  $('#chart-container').innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${series} load over the last ${period} minutes; average ${formatPercent(summary.avg)}"><defs><linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1"><stop stop-color="var(--chart-fill)" stop-opacity=".28"/><stop offset="1" stop-color="var(--chart-fill)" stop-opacity=".015"/></linearGradient></defs>${[0,50,100].map(n=>`<line x1="${left}" x2="${right}" y1="${bottom-n/100*(bottom-top)}" y2="${bottom-n/100*(bottom-top)}" stroke="var(--chart-grid)" stroke-dasharray="3 5"/><text x="22" y="${bottom-n/100*(bottom-top)+3}" text-anchor="end" fill="var(--chart-label)" font-size="9">${n}%</text>`).join('')}${lineMarkup}${last ? `<circle cx="${last.x}" cy="${last.y}" r="3.5" fill="var(--chart-line)" stroke="var(--theme-surface)" stroke-width="2"/>` : ''}<text x="${left}" y="124" fill="var(--chart-label)" font-size="9">${period} min ago</text><text x="${right}" y="124" fill="var(--chart-label)" font-size="9" text-anchor="end">Now</text></svg>`;
}

function renderHistory() {
  const list = selectedHistory();
  const summary = summarizeHistory(list, preferences.source);
  $('#history-count').textContent = list.length;
  $('#history-average').textContent = formatPercent(summary.avg);
  $('#history-maximum').textContent = formatPercent(summary.max);
  $('#history-source').textContent = `${preferences.source.toUpperCase()} usage`;
  $('#history-mode').textContent = demo ? 'Preview data' : 'Live session';
  $('#export-history').disabled = !list.length;
  $('#history-rows').innerHTML = list.length ? list.slice(-30).reverse().map(sample => {
    const state = sampleWeather(sample);
    return `<tr><td>${time(sample.timestamp)}</td><td><span class="table-weather ${state.id}">${icon(weatherIcon(state.id))}${state.label}</span></td><td>${formatPercent(sample.cpu?.usage)}</td><td>${formatPercent(sample.gpu?.usage)}</td><td>${formatPercent(sample.memory?.usage)}</td><td>${number(sample.fan?.rpm)}</td></tr>`;
  }).join('') : '<tr><td colspan="6" class="empty-records">No readings yet. Your sky will leave a trail here.</td></tr>';
}

function exportHistory() {
  const rows = [['Mode','Time','Weather source','Weather','CPU (%)','GPU (%)','Memory (%)','Memory used (GB)','Memory total (GB)','Fan (RPM)','GPU temperature (C)']];
  for (const sample of selectedHistory()) rows.push([demo ? 'preview' : 'live',new Date(sample.timestamp).toISOString(),preferences.source.toUpperCase(),sampleWeather(sample).label,sample.cpu?.usage,sample.gpu?.usage,sample.memory?.usage,sample.memory?.usedGB,sample.memory?.totalGB,sample.fan?.rpm,sample.gpu?.temperature]);
  const text = '\uFEFF' + rows.map(row => row.map(v=>`"${String(v ?? '').replaceAll('"','""')}"`).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([text], {type:'text/csv;charset=utf-8'}));
  const a = document.createElement('a'); a.href = url; a.download = `Cirrus-${demo ? 'preview' : 'live'}-${new Date().toISOString().slice(0,10)}.csv`; a.click(); setTimeout(()=>URL.revokeObjectURL(url),5000);
  toast(`Exported ${selectedHistory().length} ${demo ? 'preview' : 'live'} records`);
}

function closePreview() { $('#preview-popover').hidden = true; $('#preview-toggle').setAttribute('aria-expanded','false'); }
$$('[data-view]').forEach(button => button.addEventListener('click', () => setView(button.dataset.view)));
$('.brand').addEventListener('click', event => { event.preventDefault(); setView('overview'); });
$$('[data-source]').forEach(button => button.addEventListener('click', () => savePreferences({source:button.dataset.source})));
$$('[data-demo]').forEach(button => button.addEventListener('click', () => setDemo(button.dataset.demo)));
$$('[data-period]').forEach(button => button.addEventListener('click', () => { period = Number(button.dataset.period); $$('[data-period]').forEach(b=>b.classList.toggle('active', b===button)); renderChart(); }));
$('#preview-toggle').addEventListener('click', () => { const open = $('#preview-popover').hidden; $('#preview-popover').hidden = !open; $('#preview-toggle').setAttribute('aria-expanded', String(open)); });
document.addEventListener('click', event => { if (!event.target.closest('.preview-anchor')) closePreview(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape') { closePreview(); if (view !== 'overview') setView('overview'); } });
$('#return-live')?.addEventListener('click', () => { demo = false; snapshot = liveSnapshot; closePreview(); render(); toast('Back to live desktop weather'); });
$('#pin-button').addEventListener('click', () => savePreferences({pinned:!preferences.pinned}));
$('#expand-button').addEventListener('click', toggleExpanded);
$('#widget-button').addEventListener('click', toggleExpanded);
$('#mobile-settings').addEventListener('click', () => setView(view === 'settings' ? 'overview' : 'settings'));
$('#hide-button').addEventListener('click', () => window.weatherStation?.hide());
$('#export-history').addEventListener('click', exportHistory);
$$('[data-theme-option]').forEach(button => button.addEventListener('click', () => savePreferences({theme:button.dataset.themeOption})));
$('#setting-source').addEventListener('change', event=>savePreferences({source:event.target.value}));
$('#setting-refresh').addEventListener('change', event=>savePreferences({refreshInterval:Number(event.target.value)}));
$('#setting-threshold').addEventListener('input', event=>{ $('#threshold-output').value=`${event.target.value}%`; });
$('#setting-threshold').addEventListener('change', event=>savePreferences({stormThreshold:Number(event.target.value)}));
$('#setting-motion').addEventListener('change', event=>savePreferences({reducedMotion:event.target.checked}));
$('#setting-pinned').addEventListener('change', event=>savePreferences({pinned:event.target.checked}));
$('#setting-login').addEventListener('change', event=>savePreferences({launchAtLogin:event.target.checked}));
$('#mini-button').addEventListener('click', () => setWindowMode('mini'));
$('#mini-open').addEventListener('click', () => { setView('overview'); setWindowMode('station'); });
$('#mini-hide').addEventListener('click', () => desktop ? window.weatherStation.hide() : setWindowMode('widget'));
$('#mini-source').addEventListener('click', () => savePreferences({ source: preferences.source === 'cpu' ? 'gpu' : 'cpu' }));
$('#setting-mode').addEventListener('change', event => setWindowMode(event.target.value));
$('#setting-energy').addEventListener('change', event => savePreferences({ energySaving: event.target.checked }));
$('#setting-smoothing').addEventListener('change', event => savePreferences({ smoothWeather: event.target.checked }));
$('#setting-alerts').addEventListener('change', event => savePreferences({ alertsEnabled: event.target.checked }));
$('#setting-alert-duration').addEventListener('change', event => savePreferences({ alertDuration: Number(event.target.value) }));
$('#setting-temperature').addEventListener('change', event => savePreferences({ temperatureThreshold: Number(event.target.value) }));
$('#retry-sensors').addEventListener('click', async () => { try { const started = await window.weatherStation.retrySensors(); toast(started ? 'Reconnecting sensors. Readings will return automatically.' : 'Please wait a few seconds before reconnecting again.'); } catch { toast('Could not reconnect sensors.'); } });

async function changeActivity(nextActive) {
  active = nextActive;
  document.body.classList.toggle('inactive', !active);
  const generation = ++activityGeneration;
  if (active && desktop) {
    try {
      const [samples, latest] = await Promise.all([window.weatherStation.getHistory(), window.weatherStation.getSnapshot()]);
      if (generation !== activityGeneration || !active) return;
      histories.live = samples;
      liveSnapshot = latest;
      addSample(latest, 'live');
      if (!demo) snapshot = latest;
      render();
    } catch { toast('Could not refresh readings. Reopen the widget to retry.'); }
  } else if (active) render();
}
document.addEventListener('visibilitychange', () => changeActivity(!document.hidden));

async function init() {
  if (desktop) {
    try {
      preferences = { ...defaults, ...await window.weatherStation.getPreferences() };
      window.weatherStation.onSnapshot(sample => { liveSnapshot = sample; addSample(sample,'live'); if (!demo) snapshot = sample; if (active) { if (!demo) render(); else renderDiagnostics(); } });
      window.weatherStation.onActivity(({ active: nextActive }) => changeActivity(nextActive));
      window.weatherStation.onPreferences?.(next => {
        const resetDemo = preferences.source !== next.source || preferences.stormThreshold !== next.stormThreshold;
        preferences = {...defaults,...next};
        if (demo && resetDemo) { snapshot = makeDemo(); seedDemoHistory(); }
        syncPreferences();
        render();
      });
      histories.live = await window.weatherStation.getHistory();
      liveSnapshot = await window.weatherStation.getSnapshot();
      snapshot = liveSnapshot;
      addSample(snapshot, 'live');
    } catch { toast('Could not connect to the sensor service. Please reopen Cirrus.'); }
  } else seedDemoHistory();
  syncPreferences();
  render();
  previewInterval = setInterval(() => {
    if (!active || !demo || Date.now()-lastSampleTime < preferences.refreshInterval) return;
    lastSampleTime = Date.now();
    snapshot = makeDemo(demoWeather);

    const wave = Math.sin(Date.now()/8000)*3;
    snapshot[preferences.source].usage = Math.max(1,Math.min(100,snapshot[preferences.source].usage+wave));
    addSample(snapshot,'demo');
    render();
  }, 1000);
}
window.addEventListener('beforeunload', ()=>clearInterval(previewInterval));
init();
