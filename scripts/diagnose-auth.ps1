$ErrorActionPreference = 'Stop'
$base = 'http://localhost:5017/api'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$startupLog = Join-Path $root 'artifacts\logs\api-startup.log'

function Test-ApiPort {
  try {
    $client = New-Object System.Net.Sockets.TcpClient
    $async = $client.BeginConnect('127.0.0.1', 5017, $null, $null)
    if (-not $async.AsyncWaitHandle.WaitOne(800)) {
      $client.Close()
      return $false
    }
    $client.EndConnect($async)
    $client.Close()
    return $true
  } catch {
    return $false
  }
}

Write-Host "[AUTH-DIAG][CHECK] API endpoint=http://localhost:5017" -ForegroundColor Cyan
if (-not (Test-ApiPort)) {
  Write-Host "[AUTH-DIAG][ERROR] API_NOT_LISTENING: nothing is listening on localhost:5017." -ForegroundColor Red
  Write-Host "Run scripts\run-api.cmd in a separate window and keep it open." -ForegroundColor Yellow
  if (Test-Path $startupLog) {
    Write-Host "`n--- Last API startup log lines ---" -ForegroundColor Yellow
    Get-Content $startupLog -Tail 40
    Write-Host "--- End startup log ---`n" -ForegroundColor Yellow
  } else {
    Write-Host "No startup log exists yet: $startupLog" -ForegroundColor Yellow
  }
  exit 2
}
Write-Host "[AUTH-DIAG][SUCCESS] Port 5017 is listening." -ForegroundColor Green


function Invoke-DiagnosticRequest {
  param(
    [string]$Name,
    [string]$Method,
    [string]$Uri,
    [object]$Body = $null
  )

  Write-Host "`n=== $Name ===" -ForegroundColor Cyan
  $started = [System.Diagnostics.Stopwatch]::StartNew()
  try {
    $params = @{
      Method = $Method
      Uri = $Uri
      UseBasicParsing = $true
      TimeoutSec = 15
    }
    if ($null -ne $Body) {
      $params['ContentType'] = 'application/json'
      $params['Body'] = ($Body | ConvertTo-Json -Compress)
    }
    $response = Invoke-WebRequest @params
    $started.Stop()
    Write-Host "Status: $($response.StatusCode) | DurationMs: $($started.ElapsedMilliseconds)" -ForegroundColor Green
    if ($response.Headers['X-Correlation-ID']) {
      Write-Host "CorrelationId: $($response.Headers['X-Correlation-ID'])"
    }
    if ($response.Content) { Write-Host $response.Content }
  }
  catch {
    $started.Stop()
    $status = $null
    $content = $null
    if ($_.Exception.Response) {
      $status = [int]$_.Exception.Response.StatusCode
      try {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $content = $reader.ReadToEnd()
      } catch {}
    }
    Write-Host "FAILED | Status: $status | DurationMs: $($started.ElapsedMilliseconds)" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    if ($content) { Write-Host $content }
  }
}

Invoke-DiagnosticRequest -Name 'API + Database health' -Method 'GET' -Uri "$base/health"
Invoke-DiagnosticRequest -Name 'Admin demo login' -Method 'POST' -Uri "$base/auth/demo-login" -Body @{ email = 'admin@demo.com'; password = '123456' }
Invoke-DiagnosticRequest -Name 'Khaled student login' -Method 'POST' -Uri "$base/auth/student-login" -Body @{ email = 'khaled.demo@example.com'; password = '123456' }
