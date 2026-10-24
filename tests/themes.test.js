import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const themes = JSON.parse(fs.readFileSync(new URL('../shared/themes.json', import.meta.url), 'utf8'));
function luminance(hex) {
  const rgb = hex.slice(1).match(/../g).map(value => parseInt(value, 16) / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
}
function contrast(first, second) {
  const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (values[0] + .05) / (values[1] + .05);
}

test('theme presets use unique stable IDs, complete tokens and trusted color values', () => {
  assert.equal(themes.length, 5);
  assert.equal(themes.filter(theme => theme.dark).length, 4);
  assert.equal(new Set(themes.map(theme => theme.id)).size, themes.length);
  const tokens = Object.keys(themes[0].colors).sort();
  for (const theme of themes) {
    assert.match(theme.id, /^[a-z]+$/);
    assert.ok(theme.name && theme.description);
    assert.deepEqual(Object.keys(theme.colors).sort(), tokens);
    for (const color of Object.values(theme.colors)) assert.match(color, /^#[a-f0-9]{6}$/i);
  }
});

test('primary and secondary theme text remain readable on all interface surfaces', () => {
  for (const theme of themes) {
    for (const surface of ['bg', 'surface', 'raised']) {
      assert(contrast(theme.colors.text, theme.colors[surface]) >= 7, `${theme.id} primary text on ${surface}`);
      assert(contrast(theme.colors.muted, theme.colors[surface]) >= 4.5, `${theme.id} secondary text on ${surface}`);
      assert(contrast(theme.colors.accent, theme.colors[surface]) >= 4.5, `${theme.id} accent text on ${surface}`);
    }
  }
});
