# Cirrus · Desktop Weather

Turn computer activity into a little weather. Cirrus is a local Windows system tray widget with an animated landscape and a full observation view.

## Run

**[Download the latest release](https://github.com/yeze5421/weather-forecast/releases/latest)** for Windows 10 / 11 x64. Download the `.exe` attachment and double-click it. Node.js, Python, .NET, accounts, API keys and servers are not required.

This checkout is **1.0.1**, the English edition. Its local portable build is `release/Cirrus-Weather-1.0.1.exe`; `Launch-Cirrus.cmd` opens the most recently built portable executable. GitHub's automatic Source code archives contain source files and require the development setup below.

- Left-click the tray weather icon to open or hide the widget.
- Right-click to select CPU / GPU weather, toggle Always on top, or Quit Cirrus.
- Use the expand button to switch between the widget and full station view.
- Closing the window hides it to the tray. Use Quit Cirrus to exit completely.
- Windows may place the tray icon under Show hidden icons.

The current executable is unsigned. Windows may show an unknown publisher or SmartScreen prompt.

## How the weather works

| Observation | Weather |
| --- | --- |
| Selected CPU / GPU load below 40% | Clear skies |
| Selected CPU / GPU load from 40% to below 80% | Clouds passing |
| Selected CPU / GPU load at least 80% | Heavy rain |
| Memory reaches the warning threshold, 90% by default | Thunderstorm, with priority over CPU / GPU weather |
| Selected load sensor is unavailable | Awaiting data |

Fan RPM controls the windmill and wind animation. Missing RPM readings leave the windmill still and the value blank. Weather describes current computer activity; it does not predict future load or real-world weather.

## Hardware and data

- **CPU / memory:** actual system readings. CPU utilization needs one sampling interval before its first value.
- **NVIDIA GPU:** the driver's `nvidia-smi`, sampled every four seconds. With multiple NVIDIA GPUs, Cirrus selects the busiest adapter.
- **Other Windows GPUs:** Windows GPU performance counters, sampled every ten seconds, using the busiest physical engine. Unsupported drivers leave the reading unavailable.
- **Fan RPM:** WMI `Fan` sensors exposed by a running LibreHardwareMonitor / OpenHardwareMonitor instance. The highest available RPM is used. Availability depends on the hardware, provider and permissions. Cirrus installs no drivers and does not control fans. GPU fan percentages are not treated as RPM.
- The sampling setting controls CPU / memory and UI updates. GPU / fan sampling uses the separate intervals above.
- Preferences and readings stay on this computer. There is no account, remote API, telemetry upload or automatic update service in the application code.
- History retains the last 30 minutes of the current session and clears on exit. CSV export is an explicit user action. Preview and live records are kept separately.

## Preview

Open Preview to try sunny, cloudy, rainy and stormy skies without changing actual computer load. The interface labels demo readings as Preview. Back to live readings returns to real data. Browser mode supports previews; live hardware readings require the desktop app.

## Develop and build

Use Node.js 22.12+ and npm. Node.js 24 has been tested.

```powershell
npm ci
npm run desktop:dev   # Electron + Vite with live reload
npm start             # Build and launch the desktop app
npm run dev           # Browser preview at http://127.0.0.1:5186
npm test              # Weather rules and preference migration tests
npm run test:desktop  # Desktop integration checks with an isolated profile
npm run pack          # Folder build at release/win-unpacked/Cirrus.exe
npm run dist          # Portable Windows executable
```

Dependency installation downloads the official Electron runtime. Proxy environments may need `$env:ELECTRON_GET_USE_PROXY='1'`. A packaged application can run offline.

```text
electron/             Desktop bridge, tray, settings and hardware sampling
src/main.js           Interface, preferences, previews, history and CSV export
src/weather-model.js  Weather rules and numeric formatting
src/weather-scene.*   Original SVG landscape and animation
src/style.css         Responsive full station and widget styles
tests/                Weather boundaries and preference migration checks
scripts/              Development launcher and desktop integration checks
```

Preferences live in `preferences.json` under the current user's Cirrus application data directory. Version 1.0.1 imports valid preferences from the previous app name when no Cirrus preferences exist. Launch at login is off by default; keep the portable executable at the same path after enabling it. The renderer uses a sandbox, context isolation and validated IPC.

## Update GitHub

Updating the repository and publishing a new executable are separate operations. Git ignores `release/`, so a normal push updates source files only. See [PUBLISHING.md](PUBLISHING.md) for the exact commands to commit 1.0.1 and create its Release, and [RELEASE_NOTES.md](RELEASE_NOTES.md) for the current release notes.

Local `artifacts/` contains hardware test readings, screenshots and browser profiles. Build diagnostics in `release/` may include local paths. These directories are excluded from Git and must not be uploaded as a whole.

## License

[MIT License](LICENSE). Use, modification, redistribution and commercial use are permitted with the copyright and license notice preserved. Electron, Chromium and other third-party components keep their own licenses, included in the application package.

References: [Electron Tray](https://www.electronjs.org/docs/latest/api/tray), [Vite](https://vite.dev/guide/).
