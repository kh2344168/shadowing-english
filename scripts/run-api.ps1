$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$project = Join-Path $root 'backend\ShadowingEnglish.Api\ShadowingEnglish.Api.csproj'
$logDir = Join-Path $root 'artifacts\logs'
$logFile = Join-Path $logDir 'api-startup.log'
New-Item -ItemType Directory -Path $logDir -Force | Out-Null

function Step([string]$name, [string]$message) {
  $stamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss.fff'
  Write-Host "[$stamp][API-START][$name] $message" -ForegroundColor Cyan
}
function Fail([string]$code, [string]$message, [int]$exitCode) {
  $stamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss.fff'
  $line = "[$stamp][API-START][ERROR][$code] $message"
  Write-Host $line -ForegroundColor Red
  Add-Content -Path $logFile -Value $line
  Write-Host "Startup log: $logFile" -ForegroundColor Yellow
  exit $exitCode
}

"=== API startup $(Get-Date -Format o) ===" | Set-Content -Path $logFile
Step 'CHECK' "Project=$project"
if (-not (Test-Path $project)) { Fail 'PROJECT_NOT_FOUND' "API project was not found: $project" 10 }

$dotnet = Get-Command dotnet -ErrorAction SilentlyContinue
if ($null -eq $dotnet) { Fail 'DOTNET_NOT_FOUND' '.NET SDK is not available in PATH. Install .NET 10 SDK, then reopen the terminal.' 11 }

$dotnetVersion = (& dotnet --version 2>&1 | Select-Object -First 1).ToString().Trim()
Step 'CHECK' "dotnet=$dotnetVersion"
try { $parsedVersion = [Version]($dotnetVersion.Split('-')[0]) } catch { Fail 'DOTNET_VERSION_INVALID' "Could not parse .NET SDK version: $dotnetVersion" 12 }
if ($parsedVersion.Major -lt 10) { Fail 'DOTNET_10_REQUIRED' "Project targets net10.0 but installed SDK is $dotnetVersion" 13 }

$sqlService = Get-Service -Name 'MSSQL$SQLEXPRESS' -ErrorAction SilentlyContinue
if ($null -eq $sqlService) {
  Step 'WARN' 'SQL Express service MSSQL$SQLEXPRESS was not found. API can still start in Development, but DB routes will report DATABASE_NOT_READY.'
} elseif ($sqlService.Status -ne 'Running') {
  Step 'CHECK' "SQL service status=$($sqlService.Status). Trying to start it..."
  try {
    Start-Service -Name 'MSSQL$SQLEXPRESS' -ErrorAction Stop
    $sqlService.WaitForStatus('Running', [TimeSpan]::FromSeconds(10))
    Step 'SUCCESS' 'SQL Express service is running.'
  } catch {
    Step 'WARN' "Could not start SQL Express automatically: $($_.Exception.Message)"
  }
} else {
  Step 'SUCCESS' 'SQL Express service is running.'
}

$existing = Get-NetTCPConnection -LocalPort 5017 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($null -ne $existing) {
  $processName = 'unknown'
  try { $processName = (Get-Process -Id $existing.OwningProcess -ErrorAction Stop).ProcessName } catch {}
  Fail 'PORT_5017_BUSY' "Port 5017 is already listening. PID=$($existing.OwningProcess) Process=$processName. Stop the old process or use the already-running API." 14
}

Step 'BUILD' 'Building backend before startup...'
Push-Location $root
try {
  & dotnet build $project --nologo 2>&1 | Tee-Object -FilePath $logFile -Append
  if ($LASTEXITCODE -ne 0) { Fail 'BUILD_FAILED' "dotnet build failed with exit code $LASTEXITCODE. Read the last lines in the startup log." 20 }

  Step 'RUN' 'Starting API on http://localhost:5017 ...'
  Step 'RUN' "Startup log=$logFile"
  & dotnet run --project $project --launch-profile http --no-build 2>&1 | Tee-Object -FilePath $logFile -Append
  $runExit = $LASTEXITCODE
  if ($runExit -ne 0) { Fail 'DOTNET_RUN_FAILED' "dotnet run exited with code $runExit." 21 }
} catch {
  Fail 'STARTUP_EXCEPTION' $_.Exception.Message 22
} finally {
  Pop-Location
}
