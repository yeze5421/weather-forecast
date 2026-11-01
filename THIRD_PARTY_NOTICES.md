# Third-party hardware sensor components

Cirrus includes unmodified components from the official LibreHardwareMonitor v0.9.6 Windows release, solely to read CPU temperatures and motherboard fan sensors. Cirrus does not enable fan controls or start an HTTP server. The upstream release archive is available at https://github.com/LibreHardwareMonitor/LibreHardwareMonitor/releases/tag/v0.9.6 (archive SHA-256 `086d9f1b5a99e643edc2cfaaac16051685b551e4c5ac0b32a57c58c0e529c001`).

- LibreHardwareMonitorLib, DiskInfoToolkit, RAMSPDToolkit-NDD and BlackSharp.Core are under MPL-2.0. Their source is available at https://github.com/LibreHardwareMonitor/LibreHardwareMonitor/tree/v0.9.6, https://github.com/Blacktempel/DiskInfoToolkit, https://github.com/Blacktempel/RAMSPDToolkit and https://github.com/Blacktempel/BlackSharp. The license text is in `vendor/hardware-monitor/licenses/MPL-2.0.txt`.
- LibreHardwareMonitorLib embeds PawnIO modules under LGPL-2.1-or-later; their source is available at https://github.com/namazso/PawnIO.Modules. The license text is in `vendor/hardware-monitor/licenses/PawnIO-Modules-LGPL.txt`. The DLLs are distributed separately and may be replaced and rebuilt from the source checkout.
- HidSharp is under Apache-2.0; its source is https://github.com/IntergatedCircuits/HidSharp and its license is `vendor/hardware-monitor/licenses/HidSharp-APACHE-2.0.txt`.
- The included Microsoft .NET libraries are under MIT: https://github.com/dotnet/runtime. See `vendor/hardware-monitor/licenses/Dotnet-MIT.txt`.

The PawnIO kernel driver is a separate component and is not bundled or installed by Cirrus. Its source, license and official installer are available at https://github.com/namazso/PawnIO and https://pawnio.eu/. It may be necessary for CPU and motherboard readings, and its installation requires administrator consent.
