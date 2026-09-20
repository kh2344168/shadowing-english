@echo off
setlocal
cd /d "%~dp0.."

echo Generating the portable English demo lesson...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0create-demo-lesson.ps1"
if errorlevel 1 goto :failed

echo Demo lesson generated successfully.
exit /b 0

:failed
echo.
echo Demo lesson generation failed. Copy the error shown above and send it for review.
pause
exit /b 1

