@echo off
setlocal
cd /d "%~dp0.."
echo === Frontend AI mode check ===
findstr /C:"/__ai/groq" proxy.conf.json >nul && echo [OK] Groq proxy || echo [FAIL] Groq proxy
findstr /C:"/__ai/gemini" proxy.conf.json >nul && echo [OK] Gemini proxy || echo [FAIL] Gemini proxy
findstr /C:"/__ai/mistral" proxy.conf.json >nul && echo [OK] Mistral proxy || echo [FAIL] Mistral proxy
findstr /C:"/__ai/pexels" proxy.conf.json >nul && echo [OK] Pexels proxy || echo [FAIL] Pexels proxy
findstr /C:"mistralApiKey:" public\server-config.js >nul && echo [OK] Mistral config present || echo [FAIL] Mistral config missing
findstr /C:"saveLessonToDatabaseStrict" src\app\features\admin\pages\lesson-processing\lesson-processing.page.ts >nul && echo [OK] Explicit backend save present || echo [FAIL] Explicit backend save missing
findstr /S /C:"/api/lesson-ai" src\app\*.ts src\app\*.html >nul && echo [WARN] Old lesson-ai endpoint reference found || echo [OK] No old /api/lesson-ai calls in frontend
endlocal
