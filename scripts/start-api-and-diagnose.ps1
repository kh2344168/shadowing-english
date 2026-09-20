$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$runApi = Join-Path $PSScriptRoot 'run-api.cmd'
$diag = Join-Path $PSScriptRoot 'diagnose-auth.cmd'
Write-Host '[START+DIAG][START] Opening API in a separate terminal...' -ForegroundColor Cyan
Start-Process -FilePath 'cmd.exe' -ArgumentList '/k', ('"' + $runApi + '"') -WorkingDirectory $root

$deadline = (Get-Date).AddSeconds(90)
$ready = $false
while ((Get-Date) -lt $deadline) {
  Start-Sleep -Milliseconds 750
  try {
    $client = New-Object System.Net.Sockets.TcpClient
    $async = $client.BeginConnect('127.0.0.1', 5017, $null, $null)
    if ($async.AsyncWaitHandle.WaitOne(500)) {
      $client.EndConnect($async)
      $client.Close()
      $ready = $true
      break
    }
    $client.Close()
  } catch {}
}

if (-not $ready) {
  Write-Host '[START+DIAG][ERROR] API did not start listening on port 5017.' -ForegroundColor Red
  $log = Join-Path $root 'artifacts\logs\api-startup.log'
  if (Test-Path $log) {
    Write-Host '--- Last startup log lines ---' -ForegroundColor Yellow
    Get-Content $log -Tail 50
  }
  exit 2
}

Write-Host '[START+DIAG][SUCCESS] API is listening. Running auth diagnostics...' -ForegroundColor Green
& $diag
exit $LASTEXITCODE
