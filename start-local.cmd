@echo off
setlocal
cd /d "%~dp0"
set "PATH=%~dp0.work\runtime\node-v22.23.4-win-x64;%PATH%"
if not "%~1"=="" (
  call npm.cmd %*
  exit /b
)
powershell -NoProfile -Command "try { if ((Invoke-WebRequest 'http://127.0.0.1:4000/api/admin/state' -UseBasicParsing -TimeoutSec 2).StatusCode -eq 200) { exit 0 } } catch {}; exit 1" >nul 2>nul
if not errorlevel 1 (
  start "" "http://localhost:4000/admin/"
  exit /b 0
)
echo Admin: http://localhost:4000/admin/
echo Gallery: http://localhost:4000/gallery/
echo Close this window to stop the server.
start "" "http://localhost:4000/admin/"
node scripts/server.mjs
pause
