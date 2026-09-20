@echo off
setlocal
cd /d "%~dp0.."
echo =============================================
echo Shadowing AI Backend diagnostic
echo =============================================
echo.
echo [1/3] Testing HTTPS backend status...
curl -k -i "https://localhost:7128/api/lesson-ai/status?verify=false"
echo.
echo.
echo [2/3] Testing HTTP backend status...
curl -i "http://localhost:5017/api/lesson-ai/status?verify=false"
echo.
echo.
echo [3/3] If one request returned HTTP 200 + JSON, Backend is reachable.
echo If both failed, run scripts\run-api.cmd and inspect its console error.
echo.
pause
endlocal
