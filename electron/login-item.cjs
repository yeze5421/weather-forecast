const path = require('node:path');

function loginItemTarget({ packaged, executable, appPath, portableExecutable }) {
  // electron-builder's portable launcher extracts Electron into a temporary folder.
  // Register the original persistent .exe, never the extracted process.execPath.
  const launcher = packaged && portableExecutable && path.isAbsolute(portableExecutable)
    ? portableExecutable
    : executable;
  return {
    name: 'CirrusWeatherStation',
    path: launcher,
    args: packaged ? ['--hidden'] : [appPath, '--hidden'],
  };
}

module.exports = { loginItemTarget };
