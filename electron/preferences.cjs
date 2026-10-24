const fs = require('node:fs');
const path = require('node:path');

/** Import validated preferences once after an app rename, without copying caches. */
function loadPreferences({ settingsPath, legacySettingsPath, defaults, normalize }) {
  const fallback = () => ({ preferences: { ...defaults }, migrated: false });
  try {
    return { preferences: normalize(JSON.parse(fs.readFileSync(settingsPath, 'utf8')), defaults), migrated: false };
  } catch (error) {
    // An existing, invalid or inaccessible file must not be replaced by old data.
    if (error.code !== 'ENOENT' || !legacySettingsPath) return fallback();
  }
  try {
    const preferences = normalize(JSON.parse(fs.readFileSync(legacySettingsPath, 'utf8')), defaults);
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(settingsPath, JSON.stringify(preferences, null, 2), { flag: 'wx' });
    return { preferences, migrated: true };
  } catch {
    return fallback();
  }
}

module.exports = { loadPreferences };
