@echo off
setlocal
cd /d "%~dp0.."

echo [1/4] Checking frontend runtime config...
findstr /C:"server-config.js" "src\index.html" >nul || goto :missing
if not exist "public\server-config.js" goto :missing

echo [2/4] Checking frontend AI headers...
findstr /C:"X-Groq-Api-Key" "src\app\features\lessons\data-access\lesson-ai-api.service.ts" >nul || goto :missing

echo [3/4] Checking backend request header support...
findstr /C:"AddHttpContextAccessor" "backend\ShadowingEnglish.Api\Program.cs" >nul || goto :missing
findstr /C:"X-Groq-Api-Key" "backend\ShadowingEnglish.Api\Services\LessonAiService.cs" >nul || goto :missing

echo [4/4] Patch files are present.
echo.
echo Start the API with scripts\run-api.cmd, then open another terminal and run:
echo   curl -k "https://localhost:7128/api/lesson-ai/status?verify=false"
echo.
echo If JSON is returned, restart Angular with scripts\run-frontend.cmd.
pause
exit /b 0

:missing
echo.
echo ERROR: The AI patch is incomplete in this project folder.
echo Use the full patched project or copy every patch file with its original folder path.
pause
exit /b 1
