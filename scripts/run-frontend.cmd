@echo off
cd /d "%~dp0.."

if not exist "public\demo\call-center-introduction.wav" (
  call "scripts\create-demo-lesson.cmd"
  if errorlevel 1 goto :failed
)

if not exist "node_modules\@angular\cli" (
  echo Installing Angular dependencies for the first run...
  npm install
  if errorlevel 1 goto :failed
)

npm start
pause
exit /b 0

:failed
echo.
echo Frontend dependency installation failed. Copy the error shown above and send it for review.
pause
exit /b 1
