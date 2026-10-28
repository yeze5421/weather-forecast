param([switch]$IncludeGpu, [ValidateRange(4, 60)][int]$IntervalSeconds = 10, [switch]$Once)
$ErrorActionPreference = 'SilentlyContinue'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
# Read supported NVIDIA fan RPM through the existing driver. No fan control APIs.
# NVML: https://docs.nvidia.com/deploy/nvml-api/latest/api/group__nvmlDeviceQueries.html
$nvidiaFanReady = $false
if (Test-Path -LiteralPath (Join-Path $env:WINDIR 'System32\nvml.dll')) {
    try {
        Add-Type -ErrorAction Stop -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
[assembly: DefaultDllImportSearchPaths(DllImportSearchPath.System32)]
public static class CirrusNvidiaFans {
    [StructLayout(LayoutKind.Sequential)]
    private struct FanInfo { public uint version; public uint fan; public uint speed; }
    [DllImport("nvml.dll", CallingConvention = CallingConvention.Cdecl)]
    private static extern int nvmlInit_v2();
    [DllImport("nvml.dll", CallingConvention = CallingConvention.Cdecl)]
    private static extern int nvmlShutdown();
    [DllImport("nvml.dll", CallingConvention = CallingConvention.Cdecl)]
    private static extern int nvmlDeviceGetCount_v2(out uint count);
    [DllImport("nvml.dll", CallingConvention = CallingConvention.Cdecl)]
    private static extern int nvmlDeviceGetHandleByIndex_v2(uint index, out IntPtr device);
    [DllImport("nvml.dll", CallingConvention = CallingConvention.Cdecl)]
    private static extern int nvmlDeviceGetFanSpeedRPM(IntPtr device, ref FanInfo fan);
    public static uint[] Read() {
        bool initialized = false;
        try {
            if (nvmlInit_v2() != 0) return null;
            initialized = true;
            uint adapters;
            if (nvmlDeviceGetCount_v2(out adapters) != 0) return null;
            uint best = 0, count = 0, bestAdapter = 0, bestFan = 0;
            for (uint adapter = 0; adapter < Math.Min(adapters, 16u); adapter++) {
                IntPtr device;
                if (nvmlDeviceGetHandleByIndex_v2(adapter, out device) != 0) continue;
                for (uint fan = 0; fan < 16; fan++) {
                    FanInfo info = new FanInfo();
                    info.version = (uint)Marshal.SizeOf(typeof(FanInfo)) | (1u << 24);
                    info.fan = fan;
                    if (nvmlDeviceGetFanSpeedRPM(device, ref info) != 0) break;
                    if (count == 0 || info.speed > best) { best = info.speed; bestAdapter = adapter; bestFan = fan; }
                    count++;
                }
            }
            return count > 0 ? new uint[] { best, count, bestAdapter, bestFan } : null;
        } catch { return null; }
        finally { if (initialized) { try { nvmlShutdown(); } catch { } } }
    }
}
'@
        $nvidiaFanReady = $true
    } catch { $nvidiaFanReady = $false }
}
$gpuName = $null
if ($IncludeGpu) { $gpuName = (Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name) -join ' / ' }
while ($true) {
    $fanRpm = $null
    $fanSource = $null
    $fanStatus = 'provider_missing'
    $fanKind = $null
    $fanCount = 0
    $fanLabel = $null
    foreach ($provider in @('LibreHardwareMonitor', 'OpenHardwareMonitor')) {
        try {
            $fans = @(Get-CimInstance -Namespace "root\$provider" -ClassName Sensor -Filter "SensorType='Fan'" -ErrorAction Stop | Where-Object { $null -ne $_.Value -and $_.Value -ge 0 })
            $fanStatus = 'no_sensor'
            if ($fans.Count -gt 0) {
                $fanRpm = [double](($fans | Measure-Object -Property Value -Maximum).Maximum)
                $fanSource = $provider
                $fanKind = 'system'
                $fanCount = $fans.Count
                $fanLabel = 'Fastest available hardware fan'
                $fanStatus = 'live'
                break
            }
        } catch {
            if ($_.CategoryInfo.Category -eq 'PermissionDenied') { $fanStatus = 'access_denied' }
        }
    }
    if ($null -eq $fanRpm -and $nvidiaFanReady) {
        $driverFans = [CirrusNvidiaFans]::Read()
        if ($null -ne $driverFans -and $driverFans.Length -eq 4) {
            $fanRpm = [double]$driverFans[0]
            $fanCount = [int]$driverFans[1]
            $fanSource = 'NVIDIA NVML'
            $fanKind = 'gpu'
            $fanLabel = 'GPU {0} - Fan {1}' -f ($driverFans[2] + 1), ($driverFans[3] + 1)
            $fanStatus = 'live'
        }
    }
    $gpuUsage = $null
    if ($IncludeGpu) {
        $engines = @(Get-CimInstance Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine)
        if ($engines.Count -gt 0) {
            $groups = @{}
            foreach ($engine in $engines) {
                $key = $engine.Name -replace '^pid_\d+_', '' -replace '#\d+$', ''
                if (-not $groups.ContainsKey($key)) { $groups[$key] = 0.0 }
                $groups[$key] += [double]$engine.UtilizationPercentage
            }
            $gpuUsage = [Math]::Min(100, [double](($groups.Values | Measure-Object -Maximum).Maximum))
        }
    }
    @{ kind = 'sensors'; fanRpm = $fanRpm; fanSource = $fanSource; fanKind = $fanKind; fanCount = $fanCount; fanLabel = $fanLabel; fanStatus = $fanStatus; gpuUsage = $gpuUsage; gpuName = $gpuName } | ConvertTo-Json -Compress | ForEach-Object { [Console]::WriteLine($_) }
    if ($Once) { break }
    Start-Sleep -Seconds $IntervalSeconds
}
