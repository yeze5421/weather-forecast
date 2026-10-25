param([switch]$IncludeGpu, [ValidateRange(4, 60)][int]$IntervalSeconds = 10)
$ErrorActionPreference = 'SilentlyContinue'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$gpuName = $null
if ($IncludeGpu) { $gpuName = (Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name) -join ' / ' }
while ($true) {
    $fanRpm = $null
    $fanSource = $null
    $fanStatus = 'provider_missing'
    foreach ($provider in @('LibreHardwareMonitor', 'OpenHardwareMonitor')) {
        try {
            $fans = @(Get-CimInstance -Namespace "root\$provider" -ClassName Sensor -Filter "SensorType='Fan'" -ErrorAction Stop | Where-Object { $null -ne $_.Value -and $_.Value -ge 0 })
            $fanStatus = 'no_sensor'
            if ($fans.Count -gt 0) {
                $fanRpm = [double](($fans | Measure-Object -Property Value -Maximum).Maximum)
                $fanSource = $provider
                $fanStatus = 'live'
                break
            }
        } catch {
            if ($_.CategoryInfo.Category -eq 'PermissionDenied') { $fanStatus = 'access_denied' }
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
    @{ kind = 'sensors'; fanRpm = $fanRpm; fanSource = $fanSource; fanStatus = $fanStatus; gpuUsage = $gpuUsage; gpuName = $gpuName } | ConvertTo-Json -Compress | ForEach-Object { [Console]::WriteLine($_) }
    Start-Sleep -Seconds $IntervalSeconds
}
