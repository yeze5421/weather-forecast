# Cirrus v1.1.0 - Dark Themes

A Windows tray widget that turns CPU/GPU load into animated weather, high memory use into thunderstorms, and fan speed into wind — entirely offline.

## New in this release

- Four dark themes: Midnight, Obsidian, Forest and Ember, plus the pastel Daylight theme.
- A visual theme picker in Settings and quick theme switching from the tray menu.
- Coordinated window, chart, cloud and landscape colors, with readable text contrast.
- Your theme choice is stored locally and restored after relaunch.
- A short demo GIF and a direct Windows download link at the top of the README.

## Download and run

Quit any running Cirrus instance from the tray first. Download `Cirrus-Weather-1.1.0.exe` and double-click it on Windows 10 / 11 x64. Node.js, Python and .NET are not required. `SHA256.txt` provides the executable checksum.

GPU readings depend on driver support. Fan RPM requires a running LibreHardwareMonitor / OpenHardwareMonitor WMI provider; unsupported readings remain unavailable. No accounts, remote APIs or telemetry uploads are used.

The executable is unsigned, so Windows may show an unknown publisher or SmartScreen prompt. MIT License is included in the application; third-party components retain their own licenses.
