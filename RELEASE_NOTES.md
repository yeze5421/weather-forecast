# Cirrus v1.2.8 — Built-in Sensors

- CPU temperature and supported motherboard fan readings use the bundled LibreHardwareMonitor library; no separate monitor app is needed. The official PawnIO driver may need to be installed separately, and some hardware may require administrator privileges. Hardware support varies.
- CPU temperature appears in the overview, mini window and session CSV exports. Sensor health explains unavailable readings.
- Auto fan selection can follow supported CPU and motherboard fans; choose a specific detected fan in Settings. A real 0 RPM reading leaves the windmill still.
- Thunderstorm lightning is easier to see. Reduce motion continues to pause animations.
- The app does not control fans, expose a sensor web server or install a driver automatically.

Download Cirrus-Weather-1.2.8.exe for Windows 10 / 11 x64. Quit the previous Cirrus instance from its tray menu before launching the update. The EXE is unsigned; verify it with the attached SHA256.txt.
