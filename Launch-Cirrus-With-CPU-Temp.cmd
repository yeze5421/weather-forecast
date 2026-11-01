@echo off
setlocal
powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "%~dp0scripts\start-cpu-monitor.ps1"
if errorlevel 1 (
  echo CPU temperature may be unavailable. Press any key to continue to Cirrus.
  pause >nul
)
call "%~dp0Launch-Cirrus.cmd"
