const fs = require('node:fs');
const path = require('node:path');
const { _electron: electron } = require('playwright');

const root = path.resolve(__dirname, '..');
const profile = path.join(root, 'artifacts', 'preview-profile');
const frames = path.join(root, 'artifacts', 'preview-frames');
fs.mkdirSync(profile, { recursive: true });
fs.mkdirSync(frames, { recursive: true });
fs.writeFileSync(path.join(profile, 'preferences.json'), JSON.stringify({ source: 'cpu', theme: 'midnight', reducedMotion: false, pinned: true, launchAtLogin: false, refreshInterval: 2000, stormThreshold: 90 }));
const env = { ...process.env, WEATHER_STATION_USER_DATA: profile };
delete env.ELECTRON_RUN_AS_NODE;
delete env.VITE_DEV_SERVER_URL;
let desktop;

(async () => {
  desktop = await electron.launch({ executablePath: require('electron'), args: ['.'], cwd: root, env });
  const page = await desktop.firstWindow();
  await page.waitForFunction(() => window.weatherStation && document.querySelector('#connection-label')?.textContent === 'Live');
  // Use a fictional demo clock so no real usage times appear in the public GIF.
  await page.evaluate(() => { const demoTime = new Date(2026, 0, 1, 12, 0, 0).getTime(); Date.now = () => demoTime; });
  await page.evaluate(() => window.weatherStation.setExpanded(true));
  await page.waitForFunction(() => innerWidth === 1120);
  await page.addStyleTag({ content: '#toast{visibility:hidden!important}' });
  const scenes = [
    ['midnight', 'sunny', 'cpu', 'overview'],
    ['midnight', 'rainy', 'cpu', 'overview'],
    ['forest', 'cloudy', 'gpu', 'overview'],
    ['ember', 'storm', 'gpu', 'overview'],
    ['obsidian', 'storm', 'cpu', 'overview'],
    ['midnight', 'sunny', 'cpu', 'settings'],
  ];
  let frame = 0;
  for (const [theme, weather, source, view] of scenes) {
    await page.evaluate(patch => window.weatherStation.savePreferences(patch), { theme, source });
    await page.locator('nav [data-view="overview"]').click();
    await page.locator('#preview-toggle').click();
    await page.locator(`[data-demo="${weather}"]`).click();
    await page.waitForFunction(expected => document.querySelector('.weather-card').dataset.weather === expected, weather);
    if (view === 'settings') await page.locator('nav [data-view="settings"]').click();
    for (let index = 0; index < 12; index++) {
      if (await page.locator('#connection-label').textContent() !== 'Preview') throw new Error('Only demo data may appear in the public GIF');
      await page.screenshot({ path: path.join(frames, `frame-${String(frame++).padStart(3, '0')}.png`) });
      await page.waitForTimeout(110);
    }
  }
  console.log(JSON.stringify({ frames: frame, syntheticDataOnly: true, width: 1120, height: 820 }));
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { if (desktop) await desktop.close(); });
