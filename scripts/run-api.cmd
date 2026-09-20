@echo off
setlocal
cd /d "%~dp0.."
echo [API-START] Running preflight + backend startup diagnostics...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0run-api.ps1"
set "EXIT_CODE=%ERRORLEVEL%"
echo.
if not "%EXIT_CODE%"=="0" (
  echo [API-START][FAILED] ExitCode=%EXIT_CODE%
  echo Check: artifacts\logs\api-startup.log
) else (
  echo [API-START][STOPPED] API process exited normally.
)
pause
exit /b %EXIT_CODE%
