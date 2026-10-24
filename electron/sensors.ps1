param([switch]$IncludeGpu)
$ErrorActionPreference = 'SilentlyContinue'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$gpuName = $null
if ($IncludeGpu) {
    $gpuName = (Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name) -join ' / '
}
while ($true) {
    $fanRpm = $null
    $fanSource = $null
    foreach ($provider in @('LibreHardwareMonitor', 'OpenHardwareMonitor')) {
        $fans = @(Get-CimInstance -Namespace "root\$provider" -ClassName Sensor -Filter "SensorType='Fan'" | Where-Object { $null -ne $_.Value -and $_.Value -ge 0 })
        if ($fans.Count -gt 0) {
            $fanRpm = [double](($fans | Measure-Object -Property Value -Maximum).Maximum)
            $fanSource = $provider
            break
        }
    }
    $gpuUsage = $null
    if ($IncludeGpu) {
        # Sum processes per physical engine, then take the busiest engine.
        # Adding distinct engines incorrectly produces GPU totals above 100%.
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
    @{ kind = 'sensors'; fanRpm = $fanRpm; fanSource = $fanSource; gpuUsage = $gpuUsage; gpuName = $gpuName } | ConvertTo-Json -Compress | ForEach-Object { [Console]::WriteLine($_) }
    Start-Sleep -Seconds 10
}
