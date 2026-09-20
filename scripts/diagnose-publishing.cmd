@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0diagnose-publishing.ps1"
set EXITCODE=%ERRORLEVEL%
echo.
if not "%EXITCODE%"=="0" echo Publishing diagnostics failed with exit code %EXITCODE%.
pause
exit /b %EXITCODE%
