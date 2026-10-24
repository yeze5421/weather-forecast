import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadPreferences } from '../electron/preferences.cjs';

const defaults = { source: 'cpu', pinned: false };
function normalize(value) {
  if (!value || !['cpu', 'gpu'].includes(value.source) || typeof value.pinned !== 'boolean') throw new TypeError('Invalid preferences');
  return { source: value.source, pinned: value.pinned };
}
function fixture(t) {
  const temporaryDirectory = path.resolve(os.tmpdir());
  const root = fs.mkdtempSync(path.join(temporaryDirectory, 'cirrus-preferences-'));
  t.after(() => {
    assert.equal(path.dirname(root), temporaryDirectory);
    assert.ok(path.basename(root).startsWith('cirrus-preferences-'));
    fs.rmSync(root, { recursive: true, force: true });
  });
  return { root, settingsPath: path.join(root, 'new', 'preferences.json'), legacySettingsPath: path.join(root, 'old.json'), defaults, normalize };
}

test('app rename imports only validated preferences and preserves the original file', t => {
  const options = fixture(t);
  fs.writeFileSync(options.legacySettingsPath, JSON.stringify({ source: 'gpu', pinned: true, unrelatedPrivateField: 'not imported' }));
  const before = fs.readFileSync(options.legacySettingsPath, 'utf8');
  assert.deepEqual(loadPreferences(options), { preferences: { source: 'gpu', pinned: true }, migrated: true });
  assert.deepEqual(JSON.parse(fs.readFileSync(options.settingsPath, 'utf8')), { source: 'gpu', pinned: true });
  assert.equal(fs.readFileSync(options.legacySettingsPath, 'utf8'), before);
});

test('current preferences take priority and are never overwritten by legacy settings', t => {
  const options = fixture(t);
  fs.mkdirSync(path.dirname(options.settingsPath));
  fs.writeFileSync(options.settingsPath, JSON.stringify({ source: 'cpu', pinned: true }));
  fs.writeFileSync(options.legacySettingsPath, JSON.stringify({ source: 'gpu', pinned: false }));
  assert.deepEqual(loadPreferences(options), { preferences: { source: 'cpu', pinned: true }, migrated: false });
  fs.writeFileSync(options.settingsPath, '{invalid');
  assert.deepEqual(loadPreferences(options), { preferences: defaults, migrated: false });
  assert.equal(fs.readFileSync(options.settingsPath, 'utf8'), '{invalid');
});

test('missing, invalid or disabled legacy preferences do not create a new settings file', t => {
  const options = fixture(t);
  assert.deepEqual(loadPreferences(options), { preferences: defaults, migrated: false });
  fs.writeFileSync(options.legacySettingsPath, JSON.stringify({ source: 'invalid', pinned: true }));
  assert.deepEqual(loadPreferences(options), { preferences: defaults, migrated: false });
  fs.writeFileSync(options.legacySettingsPath, JSON.stringify({ source: 'gpu', pinned: true }));
  assert.deepEqual(loadPreferences({ ...options, legacySettingsPath: null }), { preferences: defaults, migrated: false });
  assert.equal(fs.existsSync(options.settingsPath), false);
});
