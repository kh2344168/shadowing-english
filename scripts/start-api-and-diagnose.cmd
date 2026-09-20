@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-api-and-diagnose.ps1"
set "EXIT_CODE=%ERRORLEVEL%"
echo.
pause
exit /b %EXIT_CODE%
