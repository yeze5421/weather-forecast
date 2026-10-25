# Cirrus v1.2.0 — A Quieter Sky

An offline Windows tray companion that turns CPU/GPU activity into weather, memory pressure into thunderstorms and fan RPM into wind.

- Add a draggable 320 × 210 mini desktop with saved position, saved mode and one-click CPU/GPU switching.
- Reduce polling in the background, on battery and while locked. Pause hidden rendering; keep the last 30 minutes of session history available on reopening.
- Stop sensor workers during sleep and reconnect on wake. Supervise failed and unresponsive workers with automatic retries.
- Add Sensor health explanations and a rate-limited Reconnect button in Settings.
- Share smoothed live weather between the tray and window, with a short hold and recovery margin. Raw readings stay unchanged; smoothing can be disabled.
- Show supported NVIDIA GPU temperatures in the overview, mini footer and CSV exports.
- Add optional sustained load, memory and GPU temperature notifications, with configurable duration and temperature threshold and a fifteen-minute cooldown per kind. Notifications are off by default and never use Preview data.
- Add Windows CI that tests source and packaged builds, verifies package contents and checksums, and publishes version tags automatically.
- Keep all five themes, the English interface, portable distribution and MIT license.

## Download

Download `Cirrus-Weather-1.2.0.exe` and double-click it. Windows 10 / 11 x64; no installation, Node.js, Python, account or server required. Quit the previous Cirrus instance from the tray before upgrading.

The executable is unsigned. Windows may show a publisher or SmartScreen prompt. GPU temperature and fan RPM depend on the available hardware and sensor provider. Notifications depend on Windows notification settings. Cirrus does not install drivers or change fan speeds.

`SHA256.txt` verifies the exact EXE attached to this release. Preferences and window position remain local. History remains in memory until exit unless you explicitly export CSV. There is no telemetry or automatic application update service.
