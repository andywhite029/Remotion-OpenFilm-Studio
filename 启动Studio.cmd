@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0" || goto failed
where npm.cmd >nul 2>&1
if errorlevel 1 (
  echo Please install Node.js with npm and reopen this script.
  goto failed
)
call npm.cmd start -- --browser %*
if errorlevel 1 goto failed
exit /b 0
:failed
pause
exit /b 1
