@echo off
chcp 65001 >nul
cd /d "%~dp0"
if exist "release\Cirrus-Weather-1.0.0.exe" (
  start "" "release\Cirrus-Weather-1.0.0.exe"
  exit /b
)
if exist "release\win-unpacked\机内气象.exe" (
  start "" "release\win-unpacked\机内气象.exe"
  exit /b
)
call npm start
if errorlevel 1 pause
