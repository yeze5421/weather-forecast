import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { selectCpuTemperature } from '../electron/cpu-temperature.cjs';

test('CPU package is preferred; core fallback is explicit and invalid temperatures are rejected', () => {
  const source = 'OpenHardwareMonitor';
  const sensors = [{ source, name: 'CPU Core #1', value: 80 }, { source, name: 'CPU Package', value: 67 }, { source, name: 'CPU Core #2', value: 85 }];
  assert.equal(selectCpuTemperature(sensors).value, 67);
  assert.equal(selectCpuTemperature(sensors.filter(s => s.name !== 'CPU Package')).value, 85);
  assert.equal(selectCpuTemperature([{ source: 'Cirrus sensors', name: 'CPU Package', value: 73 }]).value, 73);
  assert.equal(selectCpuTemperature([{ source, name: 'CPU Package', value: 0 }, { source, name: 'CPU Package', value: 151 }, { source, name: 'CPU Distance to TjMax', value: 20 }, { source: 'Unknown', name: 'CPU Package', value: 65 }]), null);
});

test('PowerShell reads only sensors whose parent is CPU hardware', { skip: process.platform !== 'win32' }, () => {
  const script = `
    function Get-CimInstance {
      param($Namespace, $ClassName, $Filter, $ErrorAction)
      if ($Namespace -notlike '*LibreHardwareMonitor') { return }
      if ($ClassName -eq 'Hardware') {
        [pscustomobject]@{ HardwareType='Cpu'; Identifier='/intelcpu/0' }
        [pscustomobject]@{ HardwareType='Mainboard'; Identifier='/lpc/0' }
      } elseif ($ClassName -eq 'Sensor' -and $Filter -like '*Temperature*') {
        [pscustomobject]@{ Parent='/intelcpu/0'; Name='CPU Package'; Value=69.5 }
        [pscustomobject]@{ Parent='/lpc/0'; Name='CPU Package'; Value=99 }
      }
    }
    & './electron/sensors.ps1' -Once
  `;
  const raw = execFileSync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], { encoding: 'utf8', timeout: 20000 });
  const data = JSON.parse(raw.trim());
  const fakeProvider = data.cpuTemperatures.filter(s => s.source === 'LibreHardwareMonitor');
  assert.deepEqual(fakeProvider, [{ source: 'LibreHardwareMonitor', name: 'CPU Package', value: 69.5 }]);
  assert.equal(selectCpuTemperature(fakeProvider).value, 69.5);
});
