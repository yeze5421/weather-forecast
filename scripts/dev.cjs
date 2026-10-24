const { spawn, execFile } = require('node:child_process');
const path = require('node:path');
const root = path.join(__dirname, '..');
const server = spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1'], { cwd: root, stdio: 'inherit', windowsHide: true });
let desktop;
let closing = false;
function close() {
  if (closing) return;
  closing = true;
  if (desktop?.pid && desktop.exitCode === null) {
    if (process.platform === 'win32') execFile('taskkill.exe', ['/PID', String(desktop.pid), '/T', '/F'], { windowsHide: true }, () => {});
    else desktop.kill('SIGTERM');
  }
  server.kill();
}
process.on('SIGINT', close);
process.on('SIGTERM', close);
server.on('exit', close);
(async () => {
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      const response = await fetch('http://127.0.0.1:5186');
      if (response.ok) {
        desktop = spawn(require('electron'), ['.'], { cwd: root, stdio: 'inherit', windowsHide: true, env: { ...process.env, VITE_DEV_SERVER_URL: 'http://127.0.0.1:5186' } });
        desktop.on('exit', close);
        return;
      }
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  console.error('Unable to start the local preview server.');
  close();
  process.exitCode = 1;
})();
