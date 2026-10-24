@echo off
cd /d "%~dp0"
for /f "delims=" %%F in ('dir /b /a:-d /o:-d "release\Cirrus-Weather-*.exe" 2^>nul') do (
  start "" "release\%%F"
  exit /b
)
if exist "release\win-unpacked\Cirrus.exe" (
  start "" "release\win-unpacked\Cirrus.exe"
  exit /b
)
where npm >nul 2>nul
if errorlevel 1 (
  echo No local build found. Download the portable executable from GitHub Releases,
  echo or install Node.js and run npm ci before starting from source.
  pause
  exit /b 1
)
call npm start
if errorlevel 1 pause
