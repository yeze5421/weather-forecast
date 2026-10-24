# Cirrus v1.0.1 - English Edition

Turn computer activity into a little weather. This update brings the entire Cirrus interface and application name into English.

## Changes

- English overview, history, settings, weather descriptions, preview labels and accessibility text.
- English system tray menus, tooltips, sensor messages, CSV headers and exported weather labels.
- Windows application name and folder executable renamed to `Cirrus`; project launcher renamed to `Launch-Cirrus.cmd`.
- English README, publishing instructions and development messages.
- Existing valid preferences are imported from the previous app name on first launch when no Cirrus preferences exist.
- Weather thresholds, local observations, offline operation and separate live / preview history remain available.

## Download and run

Download `Cirrus-Weather-1.0.1.exe` and double-click it on Windows 10 / 11 x64. Node.js, Python and .NET are not required. `SHA256.txt` provides the executable checksum. GitHub's Source code archives are for developers.

GPU and fan readings depend on hardware and driver support. Fan RPM requires a running LibreHardwareMonitor / OpenHardwareMonitor WMI provider; missing sensor readings stay unavailable.

The executable is unsigned, so Windows may show an unknown publisher or SmartScreen prompt. First-party code uses MIT License, included in the package; third-party components retain their own licenses.
