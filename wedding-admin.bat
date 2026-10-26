@echo off
rem ============================================================
rem  Wedding invitation admin launcher (Windows)
rem  - First run : checks Git / Node.js, clones the project to
rem                %USERPROFILE%\wedding-invitation
rem  - Every run : pulls the latest changes and opens the admin
rem                page at http://localhost:4000/admin/
rem  Messages are in English here because cmd.exe mis-reads
rem  non-ASCII text in .bat files; the Korean guide is printed by
rem  scripts\admin-start.ps1.
rem ============================================================
setlocal
set "REPO=https://github.com/beavermin2/sangwon-sangmi_wedding-invitation.git"
rem For testing: WEDDING_REPO overrides the clone source.
if defined WEDDING_REPO set "REPO=%WEDDING_REPO%"

rem Use the folder this file sits in if it is the project itself.
set "DIR=%~dp0"
if exist "%DIR%scripts\server.mjs" goto have_dir
set "DIR=%USERPROFILE%\wedding-invitation\"

:have_dir
where git >nul 2>nul
if errorlevel 1 (
  echo [!] Git is not installed.
  choice /m "Install Git now with winget"
  if errorlevel 2 goto need_tools
  winget install --id Git.Git -e --source winget --accept-package-agreements --accept-source-agreements
  echo.
  echo Git was installed. Close this window and double-click wedding-admin.bat again.
  pause
  exit /b 0
)

where node >nul 2>nul
if errorlevel 1 (
  echo [!] Node.js is not installed.
  choice /m "Install Node.js LTS now with winget"
  if errorlevel 2 goto need_tools
  winget install --id OpenJS.NodeJS.LTS -e --source winget --accept-package-agreements --accept-source-agreements
  echo.
  echo Node.js was installed. Close this window and double-click wedding-admin.bat again.
  pause
  exit /b 0
)

if not exist "%DIR%scripts\server.mjs" (
  echo Downloading the project to %DIR% ...
  git clone "%REPO%" "%DIR:~0,-1%"
  if errorlevel 1 (
    echo [!] Download failed. Check the internet connection and try again.
    pause
    exit /b 1
  )
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%DIR%scripts\admin-start.ps1"
exit /b %errorlevel%

:need_tools
echo Install Git (https://git-scm.com) and Node.js LTS (https://nodejs.org), then run this file again.
pause
exit /b 1
