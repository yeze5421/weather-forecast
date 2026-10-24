import './style.css';
import { deriveWeather, createDemoSnapshot, formatPercent, summarizeHistory } from './weather-model.js';
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
const defaults = { source: 'cpu', launchAtLogin: false, pinned: false, reducedMotion: false, refreshInterval: 2000, stormThreshold: 90 };
let preferences = { ...defaults };
try { if (!desktop) preferences = { ...defaults, ...JSON.parse(localStorage.getItem('cirrus-preferences') || '{}') }; } catch {}
if (!['cpu', 'gpu'].includes(preferences.source)) preferences.source = 'cpu';
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
const app = $('#app');

app.innerHTML = `
  <div class="app-shell">
    <aside class="sidebar">
      <a class="brand" href="#" aria-label="机内气象首页"><span class="brand-mark">${icon('sun')}</span><span><strong>机内气象</strong><small>C I R R U S</small></span></a>
      <div class="sidebar-label">你的私人气象站</div>
      <nav class="navigation" aria-label="主导航">
        <button class="nav-item active" data-view="overview">${icon('sun')}<span>实况天气</span><span class="nav-indicator"></span></button>
        <button class="nav-item" data-view="history">${icon('chart')}<span>观测记录</span></button>
        <button class="nav-item" data-view="settings">${icon('settings')}<span>气象站设置</span></button>
      </nav>
      <div class="sidebar-note"><div class="tiny-landscape"><span class="tiny-sun"></span><span class="tiny-hill h1"></span><span class="tiny-hill h2"></span></div><p>每一台电脑，<br>都有自己的天气。</p><span>A LITTLE SKY, JUST FOR YOU.</span></div>
      <div class="sidebar-footer"><span class="local-dot"></span> 在本机，安心观测 <span>1.0</span></div>
    </aside>

    <div class="workspace">
      <header class="topbar">
        <div class="breadcrumb"><span class="compact-brand">${icon('sun')} 机内气象</span><span class="wide-crumb">我的气象站 <span>/</span> <b id="breadcrumb-title">实况天气</b></span></div>
        <div class="window-actions">
          <div class="preview-anchor"><button id="preview-toggle" class="preview-button" aria-expanded="false" aria-controls="preview-popover">${icon('play')}<span>天气预览</span></button>
            <div id="preview-popover" class="popover" hidden><div class="popover-heading">让天气变一变 <span>演示数据</span></div><div class="preview-options">${[['sunny','晴天','sun'],['cloudy','多云','cloud'],['rainy','暴雨','rain'],['storm','雷暴','storm']].map(([id,label,i])=>`<button data-demo="${id}" aria-pressed="false">${icon(i)}<span>${label}</span></button>`).join('')}</div><p>预览不会改变电脑的实际负载。</p>${desktop ? '<button id="return-live" class="return-live">返回实时观测 →</button>' : '<div class="browser-note">浏览器正在展示预览，桌面版可读取真实数据。</div>'}</div>
          </div>
          <span class="toolbar-divider"></span>
          <button id="pin-button" class="icon-button desktop-action" title="窗口置顶" aria-label="窗口置顶" aria-pressed="false">${icon('pin')}</button>
          <button id="expand-button" class="icon-button" title="切换小组件 / 完整视图" aria-label="切换小组件 / 完整视图">${icon('expand')}</button>
          <button id="mobile-settings" class="icon-button mobile-only" title="气象站设置" aria-label="气象站设置">${icon('settings')}</button>
          <button id="hide-button" class="icon-button desktop-action" title="收起到系统托盘" aria-label="收起到系统托盘">${icon('close')}</button>
        </div>
      </header>

      <main>
        <section id="overview-view" class="view">
          <div class="page-heading"><div><div class="eyebrow">YOUR COMPUTER, A LITTLE WEATHER.</div><h1>电脑里的小气候<span class="heading-dot">.</span></h1><p>忙碌或闲暇，抬头看看就知道。</p></div><div class="connection-badge"><span></span><b id="connection-label">正在连接</b></div></div>
          <div class="dashboard-grid">
            <div class="primary-column">
              <section class="weather-card" data-weather="sunny" aria-label="当前电脑天气">
                <div class="weather-card-top"><span class="observation-label">${icon('monitor')} <span id="station-label">本机 · 实况观测</span></span><div class="source-toggle" aria-label="天气依据"><button data-source="cpu" aria-pressed="true">CPU</button><button data-source="gpu" aria-pressed="false">GPU</button></div></div>
                <div class="weather-summary"><div><div class="weather-kicker" id="weather-kicker">此刻的天气</div><h2 id="weather-title">等待观测</h2><p id="weather-description">正在看看你的电脑里，是什么天气。</p></div><div class="hero-load"><strong id="hero-load">—</strong><span><b id="hero-source">CPU</b> 使用率</span></div></div>
                <div class="weather-scene" aria-hidden="true">${weatherSceneMarkup()}</div>
                <div class="weather-card-bottom"><span id="weather-advice">留一点空闲，给好天气。</span><span class="weather-state-icon" id="weather-state-icon">${icon('sun')}</span></div>
              </section>
              <div class="metrics-grid">
                <article class="metric-card"><div class="metric-label"><span id="processor-icon">${icon('cpu')}</span><span id="processor-label">处理器</span><span class="metric-dot purple"></span></div><div class="metric-value"><strong id="cpu-value">—</strong><small>%</small></div><div class="meter"><span id="cpu-meter"></span></div><div class="metric-caption" id="cpu-caption">等待观测</div></article>
                <article class="metric-card"><div class="metric-label">${icon('memory')}<span>内存</span><span class="metric-dot blue"></span></div><div class="metric-value"><strong id="memory-value">—</strong><small>%</small></div><div class="meter memory-meter"><span id="memory-meter"></span></div><div class="metric-caption" id="memory-caption">等待观测</div></article>
                <article class="metric-card fan-card"><div class="metric-label">${icon('fan','fan-icon')}<span>风扇</span><span class="metric-dot green"></span></div><div class="metric-value"><strong id="fan-value">—</strong><small>RPM</small></div><div class="wind-track">${icon('wind')}<span id="wind-caption">风速待观测</span></div><div class="metric-caption" id="fan-caption">等待传感器</div></article>
              </div>
              <section class="trend-card"><div class="section-heading"><div><h3>负载的风景 <span id="chart-series">CPU</span></h3><p>每一次起伏，都有迹可循。</p></div><div class="period-toggle" aria-label="观测时段"><button data-period="1">1 分钟</button><button class="active" data-period="5">5 分钟</button><button data-period="15">15 分钟</button></div></div><div id="chart-container" class="chart-container"></div><div class="chart-footer"><span><i></i><span id="chart-legend">CPU 使用率</span></span><span id="chart-average">平均 —</span></div></section>
            </div>
            <aside class="secondary-column">
              <section class="interpretation-card"><div class="section-heading"><h3>今天，电脑还好吗？</h3>${icon('leaf')}</div><div id="mood-label" class="mood-label">自在运行中</div><p id="mood-description">系统有充足的余裕，<br>让想法慢慢生长。</p><div class="insight-divider"></div><div class="insight-row"><span>当前观测</span><strong id="current-source">CPU 负载</strong></div><div class="insight-row"><span>系统已运行</span><strong id="uptime">—</strong></div><div class="insight-row"><span>更新频率</span><strong id="refresh-label">每 2 秒</strong></div><div class="insight-foot">${icon('check')}<span>数据只在这台电脑上</span></div></section>
              <section class="legend-card"><h3>读懂这片天气</h3><p class="legend-subtitle">把复杂的数字，交给直觉。</p><div class="legend-row"><span class="legend-icon sunny">${icon('sun')}</span><div><b>晴天</b><span>轻松，自在运行</span></div><small>&lt; 40%</small></div><div class="legend-row"><span class="legend-icon cloudy">${icon('cloud')}</span><div><b>多云</b><span>正在认真工作</span></div><small>40–79%</small></div><div class="legend-row"><span class="legend-icon rainy">${icon('rain')}</span><div><b>暴雨</b><span>算力全力以赴</span></div><small>≥ 80%</small></div><div class="legend-row"><span class="legend-icon storm">${icon('storm')}</span><div><b>雷暴</b><span>内存需要喘口气</span></div><small id="legend-threshold">≥ 90%</small></div><div class="legend-note">内存预警优先于 CPU / GPU 天气</div></section>
              <button id="widget-button" class="widget-promo"><span class="mini-tray">${icon('sun')}<b id="mini-load">—</b><span>◷</span></span><strong>把一片天空，放在手边 ${icon('arrow')}</strong><span>切换为轻盈的小组件</span></button>
            </aside>
          </div>
          <footer class="page-footer"><span>${icon('leaf')} 少一些数字焦虑，多一点晴空。</span><span id="updated-at">等待第一次观测</span><button class="mobile-only text-button" data-view="history">观测记录 ${icon('arrow')}</button></footer>
        </section>

        <section id="history-view" class="view" hidden><button class="back-button mobile-only" data-view="overview">${icon('back')} 返回实况</button><div class="page-heading"><div><div class="eyebrow">EVERY LITTLE CHANGE.</div><h1>天气有迹可循<span class="heading-dot">.</span></h1><p>留住这一程的风和雨。</p></div><button id="export-history" class="secondary-button">${icon('download')} 导出 CSV</button></div><div class="history-stats"><article><span>观测样本</span><strong id="history-count">0</strong><small>本次运行 · 最多保留 30 分钟</small></article><article><span>平均负载</span><strong id="history-average">—</strong><small id="history-source">CPU 使用率</small></article><article><span>最高负载</span><strong id="history-maximum">—</strong><small>这片天空最忙碌的时刻</small></article></div><section class="records-card"><div class="section-heading"><h3>最近的观测</h3><span id="history-mode" class="subtle-label">实时数据</span></div><div class="table-scroll"><table><thead><tr><th>时间</th><th>天气</th><th>CPU</th><th>GPU</th><th>内存</th><th>风扇 RPM</th></tr></thead><tbody id="history-rows"></tbody></table></div><p class="records-note">保留本次打开后的观测。预览数据与真实记录分开保存。</p></section></section>

        <section id="settings-view" class="view" hidden><button class="back-button mobile-only" data-view="overview">${icon('back')} 返回实况</button><div class="page-heading"><div><div class="eyebrow">MAKE YOURSELF AT HOME.</div><h1>你的天空，你做主<span class="heading-dot">.</span></h1><p>让气象站按你的节奏运转。</p></div></div><div class="settings-card"><h3>观测偏好</h3><label class="setting-row"><span><b>天气依据</b><small>选择决定晴雨的负载来源</small></span><select id="setting-source"><option value="cpu">CPU · 处理器</option><option value="gpu">GPU · 显卡</option></select></label><label class="setting-row"><span><b>观测频率</b><small>降低频率可以减少气象站开销</small></span><select id="setting-refresh"><option value="1000">每 1 秒</option><option value="2000">每 2 秒</option><option value="5000">每 5 秒</option></select></label><div class="setting-row threshold-row"><span><b>雷暴预警线</b><small>内存使用达到此值时，优先显示雷暴</small></span><label class="range-setting"><input id="setting-threshold" aria-label="雷暴预警内存百分比" type="range" min="70" max="98" step="1"><output id="threshold-output">90%</output></label></div><h3 class="settings-subheading">安静地陪伴</h3><label class="setting-row"><span><b>减少动态效果</b><small>让云、雨和风车安静下来</small></span><input class="switch" id="setting-motion" type="checkbox" role="switch"></label><label class="setting-row"><span><b>窗口始终置顶</b><small id="pin-setting-note">工作时也能看见天气</small></span><input class="switch" id="setting-pinned" type="checkbox" role="switch"></label><label class="setting-row"><span><b>开机时启动</b><small id="login-setting-note">登录电脑后，自动在托盘里观测</small></span><input class="switch" id="setting-login" type="checkbox" role="switch"></label></div><div class="about-card"><span class="brand-mark">${icon('sun')}</span><div><strong>机内气象 <span>CIRRUS 1.0</span></strong><p>天气来自你的电脑，好心情留给你。</p></div></div><p class="settings-footnote">GPU / 风扇数据取决于硬件与驱动支持。没有读数时会如实留空。</p></section>
      </main>
    </div>
  </div>
  <div id="toast" class="toast" role="status" hidden></div>
`;

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
  } catch { toast('偏好未保存，请稍后重试。'); }
}

function syncPreferences() {
  $$('[data-source]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.source === preferences.source)));
  $('#setting-source').value = preferences.source;
  $('#setting-refresh').value = String(preferences.refreshInterval);
  $('#setting-threshold').value = preferences.stormThreshold;
  $('#threshold-output').value = `${preferences.stormThreshold}%`;
  $('#setting-motion').checked = preferences.reducedMotion;
  $('#setting-pinned').checked = preferences.pinned;
  $('#setting-login').checked = preferences.launchAtLogin;
  $('#pin-button').setAttribute('aria-pressed', String(preferences.pinned));
  $('#legend-threshold').textContent = `≥ ${preferences.stormThreshold}%`;
  $('#refresh-label').textContent = `每 ${preferences.refreshInterval / 1000} 秒`;
  document.documentElement.classList.toggle('reduced-motion', preferences.reducedMotion);
  if (!desktop) {
    $('#setting-pinned').disabled = true;
    $('#setting-login').disabled = true;
    $('#pin-setting-note').textContent = '桌面版可用';
    $('#login-setting-note').textContent = '桌面版可用';
  }
}

function setView(next) {
  view = next;
  $$('.view').forEach(el => { el.hidden = el.id !== `${next}-view`; });
  $$('.nav-item').forEach(el => { el.classList.toggle('active', el.dataset.view === next); el.setAttribute('aria-current', el.dataset.view === next ? 'page' : 'false'); });
  $('#breadcrumb-title').textContent = { overview: '实况天气', history: '观测记录', settings: '气象站设置' }[next];
  if (next === 'history') renderHistory();
  $('main').scrollTop = 0;
}

async function toggleExpanded() {
  expanded = !expanded;
  if (desktop) { try { await window.weatherStation.setExpanded(expanded); } catch { toast('窗口尺寸暂时无法切换。'); } }
  else { document.body.classList.toggle('widget-preview', !expanded); toast(expanded ? '已展开完整气象站' : '小组件预览 · 右上角可展开'); }
}

function number(value, digits = 0) { return Number.isFinite(value) ? value.toLocaleString('zh-CN', { maximumFractionDigits: digits }) : '—'; }
function time(timestamp) { return new Date(timestamp).toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
function uptimeLabel(seconds) { if (!Number.isFinite(seconds)) return '—'; const hours = Math.floor(seconds / 3600); return hours > 24 ? `${Math.floor(hours / 24)} 天 ${hours % 24} 时` : `${hours} 时 ${Math.floor(seconds % 3600 / 60)} 分`; }
function selectedHistory() { return histories[demo ? 'demo' : 'live']; }

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
  toast(`正在预览${{ sunny: '晴天', cloudy: '多云', rainy: '暴雨', storm: '雷暴' }[weather]} · 演示数据`);
}

function render() {
  const state = deriveWeather(snapshot, preferences.source, preferences.stormThreshold);
  const selected = snapshot?.[preferences.source];
  const load = Number.isFinite(selected?.usage) ? selected.usage : null;
  const mem = snapshot?.memory;
  const rpm = snapshot?.fan?.rpm;
  const weather = state.id;
  $('.weather-card').dataset.weather = weather;
  $('#weather-title').textContent = state.label;
  $('#weather-description').textContent = state.description;
  $('#weather-advice').textContent = state.advice;
  $('#weather-kicker').textContent = state.reason === 'memory' ? '内存气压升高了' : '此刻的天气';
  $('#hero-load').innerHTML = `${number(load)}${load !== null ? '<em>%</em>' : ''}`;
  $('#hero-source').textContent = preferences.source.toUpperCase();
  $('#station-label').textContent = demo ? '小小气象站 · 天气预览' : '本机 · 实况观测';
  $('#connection-label').textContent = demo ? '预览模式' : (snapshot ? '实时观测中' : '正在连接');
  $('.connection-badge').classList.toggle('is-demo', demo);
  $('#preview-toggle').classList.toggle('is-demo', demo);
  $('#processor-label').textContent = preferences.source === 'cpu' ? '处理器' : '显卡';
  $('#processor-icon').innerHTML = icon(preferences.source);
  $('#cpu-value').textContent = number(load);
  $('#memory-value').textContent = number(mem?.usage);
  $('#fan-value').textContent = number(rpm);
  $('#cpu-meter').style.width = `${Math.min(100, Math.max(0, load ?? 0))}%`;
  $('#memory-meter').style.width = `${Math.min(100, Math.max(0, mem?.usage ?? 0))}%`;
  $('#cpu-caption').textContent = load === null ? '未检测到传感器' : `${preferences.source.toUpperCase()} · ${{sunny:'轻盈运行',cloudy:'有条不紊',rainy:'全力运转',storm:'运行中',unknown:'等待观测'}[weather]}`;
  $('#cpu-caption').title = selected?.name || '';
  $('#memory-caption').textContent = mem ? `${number(mem.usedGB, 1)} / ${number(mem.totalGB, 1)} GB` : '等待观测';
  $('#memory-caption').classList.toggle('warning-text', (mem?.usage ?? 0) >= preferences.stormThreshold);
  $('#wind-caption').textContent = Number.isFinite(rpm) ? (rpm === 0 ? '风暂时停了' : rpm < 1500 ? '轻风徐来' : rpm < 2500 ? '微风正好' : '风渐渐大了') : '静候风的消息';
  $('#fan-caption').textContent = Number.isFinite(rpm) ? (demo ? '预览传感器' : snapshot.fan.source || '转速传感器') : '未检测到转速';
  $('.fan-icon').style.animationDuration = Number.isFinite(rpm) && rpm > 0 ? `${Math.max(.4, 2400 / rpm)}s` : '0s';
  $('#weather-state-icon').innerHTML = icon(weatherIcon(weather));
  $('#current-source').textContent = `${preferences.source.toUpperCase()} 负载`;
  $('#uptime').textContent = uptimeLabel(snapshot?.uptime);
  const mood = {
    sunny: ['自在运行中', '系统有充足的余裕，让想法慢慢生长。'],
    cloudy: ['有一点忙，也刚刚好', '云朵正在聚拢，电脑正在认真处理手头的事情。'],
    rainy: ['正在全力以赴', '计算的雨下大了。稍作等待，或暂停不需要的任务。'],
    storm: ['给内存一点呼吸', '内存使用较高，试着关闭暂时不用的应用或标签页。'],
    unknown: ['等待天空的消息', '暂时没有这个传感器的读数。可以切换观测来源。'],
  }[weather];
  $('#mood-label').textContent = mood[0];
  $('#mood-description').textContent = mood[1];
  $('#mini-load').textContent = formatPercent(load);
  $('.mini-tray .icon').outerHTML = icon(weatherIcon(weather));
  $('#updated-at').textContent = snapshot ? `${demo ? '预览数据' : '最近观测'} ${time(snapshot.timestamp)}` : '等待第一次观测';
  $$('[data-demo]').forEach(button => button.setAttribute('aria-pressed', String(demo && button.dataset.demo === demoWeather)));
  updateWeatherScene($('.weather-scene'), weather, rpm ?? null, { reducedMotion: preferences.reducedMotion });
  renderChart();
  if (view === 'history') renderHistory();
}

function renderChart() {
  const list = selectedHistory().filter(s => s.timestamp >= Date.now() - period * 60000);
  const summary = summarizeHistory(list, preferences.source);
  const series = preferences.source.toUpperCase();
  $('#chart-series').textContent = series;
  $('#chart-legend').textContent = `${series} 使用率${demo ? ' · 预览' : ''}`;
  $('#chart-average').textContent = `平均 ${formatPercent(summary.avg)}`;
  if (!list.length || !summary.count) {
    $('#chart-container').innerHTML = '<div class="chart-empty">还没有可用读数<br><span>收到观测数据后，风景会慢慢展开。</span></div>';
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
    return `<path d="${d} L${segment.at(-1).x.toFixed(2)},${bottom} L${segment[0].x.toFixed(2)},${bottom}Z" fill="url(#chart-fill)"/><path d="${d}" fill="none" stroke="#8c86c7" stroke-width="2.2" stroke-linejoin="round"/>`;
  }).join('');
  const last = points.filter(p=>p.valid).at(-1);
  $('#chart-container').innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="最近 ${period} 分钟 ${series} 负载曲线，平均 ${formatPercent(summary.avg)}"><defs><linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#b7b0e0" stop-opacity=".28"/><stop offset="1" stop-color="#b7b0e0" stop-opacity=".015"/></linearGradient></defs>${[0,50,100].map(n=>`<line x1="${left}" x2="${right}" y1="${bottom-n/100*(bottom-top)}" y2="${bottom-n/100*(bottom-top)}" stroke="#ececf1" stroke-dasharray="3 5"/><text x="22" y="${bottom-n/100*(bottom-top)+3}" text-anchor="end" fill="#a2a3b1" font-size="9">${n}%</text>`).join('')}${lineMarkup}${last ? `<circle cx="${last.x}" cy="${last.y}" r="3.5" fill="#8c86c7" stroke="white" stroke-width="2"/>` : ''}<text x="${left}" y="124" fill="#a2a3b1" font-size="9">${period} 分钟前</text><text x="${right}" y="124" fill="#a2a3b1" font-size="9" text-anchor="end">现在</text></svg>`;
}

function renderHistory() {
  const list = selectedHistory();
  const summary = summarizeHistory(list, preferences.source);
  $('#history-count').textContent = list.length;
  $('#history-average').textContent = formatPercent(summary.avg);
  $('#history-maximum').textContent = formatPercent(summary.max);
  $('#history-source').textContent = `${preferences.source.toUpperCase()} 使用率`;
  $('#history-mode').textContent = demo ? '预览数据' : '本次实时观测';
  $('#export-history').disabled = !list.length;
  $('#history-rows').innerHTML = list.length ? list.slice(-30).reverse().map(sample => {
    const state = deriveWeather(sample, preferences.source, preferences.stormThreshold);
    return `<tr><td>${time(sample.timestamp)}</td><td><span class="table-weather ${state.id}">${icon(weatherIcon(state.id))}${state.label}</span></td><td>${formatPercent(sample.cpu?.usage)}</td><td>${formatPercent(sample.gpu?.usage)}</td><td>${formatPercent(sample.memory?.usage)}</td><td>${number(sample.fan?.rpm)}</td></tr>`;
  }).join('') : '<tr><td colspan="6" class="empty-records">天空还没有留下记录，稍后再来看看。</td></tr>';
}

function exportHistory() {
  const rows = [['数据模式','时间','天气依据','天气','CPU (%)','GPU (%)','内存 (%)','内存已用 (GB)','内存总量 (GB)','风扇 (RPM)']];
  for (const sample of selectedHistory()) rows.push([demo ? '预览' : '实时',new Date(sample.timestamp).toISOString(),preferences.source.toUpperCase(),deriveWeather(sample,preferences.source,preferences.stormThreshold).label,sample.cpu?.usage,sample.gpu?.usage,sample.memory?.usage,sample.memory?.usedGB,sample.memory?.totalGB,sample.fan?.rpm]);
  const text = '\uFEFF' + rows.map(row => row.map(v=>`"${String(v ?? '').replaceAll('"','""')}"`).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([text], {type:'text/csv;charset=utf-8'}));
  const a = document.createElement('a'); a.href = url; a.download = `Cirrus-${demo ? 'preview' : 'live'}-${new Date().toISOString().slice(0,10)}.csv`; a.click(); setTimeout(()=>URL.revokeObjectURL(url),5000);
  toast(`已导出 ${selectedHistory().length} 条${demo ? '预览' : '观测'}记录`);
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
$('#return-live')?.addEventListener('click', () => { demo = false; snapshot = liveSnapshot; closePreview(); render(); toast('已返回真实电脑天气'); });
$('#pin-button').addEventListener('click', () => savePreferences({pinned:!preferences.pinned}));
$('#expand-button').addEventListener('click', toggleExpanded);
$('#widget-button').addEventListener('click', toggleExpanded);
$('#mobile-settings').addEventListener('click', () => setView(view === 'settings' ? 'overview' : 'settings'));
$('#hide-button').addEventListener('click', () => window.weatherStation?.hide());
$('#export-history').addEventListener('click', exportHistory);
$('#setting-source').addEventListener('change', event=>savePreferences({source:event.target.value}));
$('#setting-refresh').addEventListener('change', event=>savePreferences({refreshInterval:Number(event.target.value)}));
$('#setting-threshold').addEventListener('input', event=>{ $('#threshold-output').value=`${event.target.value}%`; });
$('#setting-threshold').addEventListener('change', event=>savePreferences({stormThreshold:Number(event.target.value)}));
$('#setting-motion').addEventListener('change', event=>savePreferences({reducedMotion:event.target.checked}));
$('#setting-pinned').addEventListener('change', event=>savePreferences({pinned:event.target.checked}));
$('#setting-login').addEventListener('change', event=>savePreferences({launchAtLogin:event.target.checked}));

async function init() {
  if (desktop) {
    try {
      preferences = { ...defaults, ...await window.weatherStation.getPreferences() };
      window.weatherStation.onSnapshot(sample => { liveSnapshot = sample; addSample(sample,'live'); if (!demo) {snapshot = sample; render();} });
      window.weatherStation.onPreferences?.(next => {
        const resetDemo = preferences.source !== next.source || preferences.stormThreshold !== next.stormThreshold;
        preferences = {...defaults,...next};
        if (demo && resetDemo) { snapshot = makeDemo(); seedDemoHistory(); }
        syncPreferences();
        render();
      });
      liveSnapshot = await window.weatherStation.getSnapshot();
      snapshot = liveSnapshot;
      addSample(snapshot, 'live');
    } catch { toast('暂时无法连接监测服务，请重新打开气象站。'); }
  } else seedDemoHistory();
  syncPreferences();
  render();
  previewInterval = setInterval(() => {
    if (!demo || Date.now()-lastSampleTime < preferences.refreshInterval) return;
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
