@echo off
setlocal
cd /d "%~dp0.."

set "API_PROJECT=backend\ShadowingEnglish.Api\ShadowingEnglish.Api.csproj"
echo Restoring the ASP.NET Core API...
dotnet restore "%API_PROJECT%"
if errorlevel 1 goto :failed

echo Building the ASP.NET Core API...
dotnet build "%API_PROJECT%"
if errorlevel 1 goto :failed

echo Checking the included database migrations...
dotnet ef migrations list --project "%API_PROJECT%" --startup-project "%API_PROJECT%"
if errorlevel 1 goto :failed

echo Creating or updating the ShadowingEnglishMvp database...
dotnet ef database update --project "%API_PROJECT%" --startup-project "%API_PROJECT%"
if errorlevel 1 goto :failed

echo.
echo Database setup completed successfully.
pause
exit /b 0

:failed
echo.
echo Database setup failed. Copy the error shown above and send it for review.
pause
exit /b 1
