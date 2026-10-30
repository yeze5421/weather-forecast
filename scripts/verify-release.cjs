const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const asar = require('@electron/asar');
const { version } = require('../package.json');
const root = path.resolve(__dirname, '..');
if (process.env.GITHUB_REF_TYPE === 'tag') assert.equal(process.env.GITHUB_REF_NAME, `v${version}`, 'Tag must match package.json');
const name = `Cirrus-Weather-${version}.exe`;
const binary = fs.readFileSync(path.join(root, 'release', name));
assert.equal(binary.subarray(0, 2).toString(), 'MZ');
const hash = createHash('sha256').update(binary).digest('hex');
assert.equal(fs.readFileSync(path.join(root, 'release', 'SHA256.txt'), 'utf8').trim(), `${hash}  ${name}`);
const archive = path.join(root, 'release', 'win-unpacked', 'resources', 'app.asar');
assert.equal(JSON.parse(asar.extractFile(archive, 'package.json')).version, version);
for (const file of ['electron/metrics.cjs', 'electron/main.cjs', 'electron/history.cjs', 'electron/settings.cjs', 'electron/alerts.cjs', 'electron/runtime-policy.cjs', 'shared/weather-state.cjs', 'shared/themes.json', 'LICENSE', 'build/icon.png']) {
  assert(asar.extractFile(archive, file).equals(fs.readFileSync(path.join(root, file))), `Packaged source mismatch: ${file}`);
}
assert(fs.readFileSync(path.join(root, 'release', 'win-unpacked', 'resources', 'app.asar.unpacked', 'electron', 'sensors.ps1')).equals(fs.readFileSync(path.join(root, 'electron', 'sensors.ps1'))));
// Verify the bytes embedded in the downloadable launcher, not just its sibling folder.
(async () => {
  const seven = await require('app-builder-lib/out/toolsets/7zip').getPath7za();
  const artifacts = path.join(root, 'artifacts');
  fs.mkdirSync(artifacts, { recursive: true });
  const temporary = fs.mkdtempSync(path.join(artifacts, 'verify-portable-'));
  execFileSync(seven, ['x', '-y', `-o${temporary}`, path.join(root, 'release', name), 'resources/app.asar', 'resources/app.asar.unpacked/electron/sensors.ps1'], { windowsHide: true, stdio: 'pipe' });
  assert(fs.readFileSync(path.join(temporary, 'resources', 'app.asar')).equals(fs.readFileSync(archive)), 'Portable ASAR differs from the tested folder');
  assert(fs.readFileSync(path.join(temporary, 'resources', 'app.asar.unpacked', 'electron', 'sensors.ps1')).equals(fs.readFileSync(path.join(root, 'electron', 'sensors.ps1'))), 'Portable sensor script differs from source');
  console.log(`Verified version, SHA-256, sources, icons and embedded portable payload for ${name}`);
})().catch(error => { console.error(error.message); process.exitCode = 1; });
