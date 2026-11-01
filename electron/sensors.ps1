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
using System.Collections.Generic;
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
            List<uint> results = new List<uint>();
            for (uint adapter = 0; adapter < Math.Min(adapters, 16u); adapter++) {
                IntPtr device;
                if (nvmlDeviceGetHandleByIndex_v2(adapter, out device) != 0) continue;
                for (uint fan = 0; fan < 16; fan++) {
                    FanInfo info = new FanInfo();
                    info.version = (uint)Marshal.SizeOf(typeof(FanInfo)) | (1u << 24);
                    info.fan = fan;
                    if (nvmlDeviceGetFanSpeedRPM(device, ref info) != 0) break;
                    results.Add(adapter); results.Add(fan); results.Add(info.speed);
                }
            }
            return results.ToArray();
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
$integratedComputer = $null
$integratedStatus = 'component_missing'
$integratedLibrary = Join-Path (Split-Path -Parent $PSScriptRoot) 'vendor\hardware-monitor\LibreHardwareMonitorLib.dll'
if (Test-Path -LiteralPath $integratedLibrary) {
    try {
        [void][Reflection.Assembly]::LoadFrom($integratedLibrary)
        if ([LibreHardwareMonitor.PawnIo.PawnIo]::IsInstalled) {
            $integratedComputer = New-Object LibreHardwareMonitor.Hardware.Computer
            $integratedComputer.IsCpuEnabled = $true
            $integratedComputer.IsMotherboardEnabled = $true
            $integratedComputer.Open()
            $integratedStatus = 'active'
        } else { $integratedStatus = 'driver_missing' }
    } catch {
        if ($integratedComputer) { try { $integratedComputer.Close() } catch {} }
        $integratedComputer = $null
        $integratedStatus = 'error'
    }
}
function Read-IntegratedHardware($hardware) {
    try {
        $hardware.Update()
        foreach ($sensor in $hardware.Sensors) {
            if ($null -eq $sensor.Value -or -not $sensor.Identifier) { continue }
            if ($hardware.HardwareType -eq 'Cpu' -and $sensor.SensorType -eq 'Temperature' -and $script:cpuTemperatures.Count -lt 256) {
                [void]$script:cpuTemperatures.Add(@{ source = 'Cirrus sensors'; name = [string]$sensor.Name; value = [double]$sensor.Value })
            } elseif ($sensor.SensorType -eq 'Fan' -and $sensor.Value -ge 0 -and $script:availableFans.Count -lt 256) {
                $sha = [Security.Cryptography.SHA256]::Create()
                try { $hash = ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes([string]$sensor.Identifier)))).Replace('-', '').ToLowerInvariant() } finally { $sha.Dispose() }
                [void]$script:availableFans.Add(@{ id = "builtin:$hash"; label = [string]$sensor.Name; rpm = [double]$sensor.Value; source = 'Cirrus sensors'; kind = 'system' })
            }
        }
        foreach ($child in $hardware.SubHardware) { Read-IntegratedHardware $child }
    } catch { $script:integratedStatus = 'read_error' }
}
while ($true) {
    $fanStatus = 'provider_missing'
    $availableFans = New-Object System.Collections.ArrayList
    $cpuTempStatus = if ($integratedStatus -eq 'driver_missing') { 'driver_missing' } elseif ($integratedStatus -eq 'active') { 'builtin_unavailable' } else { 'provider_missing' }
    $cpuTemperatures = New-Object System.Collections.ArrayList
    if ($integratedComputer) {
        foreach ($hardware in $integratedComputer.Hardware) { Read-IntegratedHardware $hardware }
    }
    foreach ($provider in @('LibreHardwareMonitor', 'OpenHardwareMonitor')) {
        try {
            $fans = @(Get-CimInstance -Namespace "root\$provider" -ClassName Sensor -Filter "SensorType='Fan'" -ErrorAction Stop | Where-Object { $null -ne $_.Value -and $_.Value -ge 0 -and $_.Identifier })
            $fanStatus = 'no_sensor'
            foreach ($fan in $fans) {
                $sha = [System.Security.Cryptography.SHA256]::Create()
                try { $hash = ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes([string]$fan.Identifier)))).Replace('-', '').ToLowerInvariant() } finally { $sha.Dispose() }
                $label = if ($fan.Name) { [string]$fan.Name } else { 'Hardware fan' }
                [void]$availableFans.Add(@{ id = "wmi:$provider`:$hash"; label = $label; rpm = [double]$fan.Value; source = $provider; kind = 'system' })
            }
            if ($fans.Count -gt 0) { break }
        } catch {
            if ($_.CategoryInfo.Category -eq 'PermissionDenied') { $fanStatus = 'access_denied' }
        }
    }
    if ($nvidiaFanReady) {
        $driverFans = [CirrusNvidiaFans]::Read()
        for ($i = 0; $null -ne $driverFans -and $i + 2 -lt $driverFans.Length; $i += 3) {
            $adapter = [int]$driverFans[$i]; $fanIndex = [int]$driverFans[$i + 1]
            [void]$availableFans.Add(@{ id = "nvml:$adapter`:$fanIndex"; label = ('GPU {0} - Fan {1}' -f ($adapter + 1), ($fanIndex + 1)); rpm = [double]$driverFans[$i + 2]; source = 'NVIDIA NVML'; kind = 'gpu' })
        }
    }
    if ($availableFans.Count -gt 0) { $fanStatus = 'live' }
    foreach ($provider in @('LibreHardwareMonitor', 'OpenHardwareMonitor')) {
        try {
            $cpuHardware = @(Get-CimInstance -Namespace "root\$provider" -ClassName Hardware -ErrorAction Stop | Where-Object { $_.HardwareType -eq 'CPU' -and $_.Identifier } | ForEach-Object { [string]$_.Identifier })
            $temperatureSensors = @(Get-CimInstance -Namespace "root\$provider" -ClassName Sensor -Filter "SensorType='Temperature'" -ErrorAction Stop)
            if ($cpuTempStatus -eq 'provider_missing') { $cpuTempStatus = 'no_sensor' }
            foreach ($sensor in $temperatureSensors) {
                if ($cpuHardware -contains [string]$sensor.Parent -and $null -ne $sensor.Value -and $sensor.Name -and $cpuTemperatures.Count -lt 256) {
                    [void]$cpuTemperatures.Add(@{ source = $provider; name = [string]$sensor.Name; value = [double]$sensor.Value })
                }
            }
        } catch {
            if ($_.CategoryInfo.Category -eq 'PermissionDenied' -and $cpuTempStatus -eq 'provider_missing') { $cpuTempStatus = 'access_denied' }
        }
    }
    if ($cpuTemperatures.Count -gt 0) { $cpuTempStatus = 'live' }
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
    @{ kind = 'sensors'; fans = @($availableFans.ToArray()); fanStatus = $fanStatus; cpuTemperatures = @($cpuTemperatures.ToArray()); cpuTempStatus = $cpuTempStatus; integratedStatus = $integratedStatus; gpuUsage = $gpuUsage; gpuName = $gpuName } | ConvertTo-Json -Depth 5 -Compress | ForEach-Object { [Console]::WriteLine($_) }
    if ($Once) { break }
    Start-Sleep -Seconds $IntervalSeconds
}
if ($integratedComputer) { try { $integratedComputer.Close() } catch {} }
