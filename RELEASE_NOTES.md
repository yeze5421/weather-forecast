# Cirrus v1.2.1 — Fan RPM Fix

Fix the stationary windmill on supported NVIDIA systems that have no WMI fan provider.

- Read GPU fan RPM directly through the installed NVIDIA driver using the read-only NVML interface. No additional monitoring application or driver installation is needed on supported devices.
- Select the fastest available supported fan and identify it as a GPU fan in the caption and Sensor health. CPU and case fans still require their own compatible provider.
- Preserve measured zero RPM as a stopped fan; missing readings remain unavailable. No fan percentage is converted into RPM, and no fan speed controls are called.
- Clarify that modern LibreHardwareMonitor 0.9.5+ no longer provides WMI. Cirrus opens no listener and does not enable external monitor web servers.
- Add regression coverage for real windmill animation, GPU source labels and stopped fans.

Download Cirrus-Weather-1.2.1.exe for Windows 10 / 11 x64. Quit the previous Cirrus instance from its tray menu before launching the update. The EXE is unsigned; verify it with the attached SHA256.txt.

Existing themes, mini mode, energy saving and optional alerts remain available. NVIDIA NVML reports operating RPM from the driver; it is not a physical fan-failure detector. Unsupported hardware continues to show no reading.
