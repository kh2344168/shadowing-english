$ErrorActionPreference = 'Stop'

$root = (Get-Location).Path
$target = Join-Path $root 'src\app\core\api\student-tracking-api.models.ts'
$source = Join-Path $PSScriptRoot 'src\app\core\api\student-tracking-api.models.ts'

Write-Host '[DTO-HOTFIX][START]' -ForegroundColor Cyan
Write-Host "Project root: $root"

if (-not (Test-Path $target)) {
  Write-Host '[DTO-HOTFIX][ERROR] Target file not found.' -ForegroundColor Red
  Write-Host "Expected: $target"
  exit 10
}
if (-not (Test-Path $source)) {
  Write-Host '[DTO-HOTFIX][ERROR] Patch source file not found.' -ForegroundColor Red
  exit 11
}

$backup = "$target.bak-20260920"
Copy-Item $target $backup -Force
Write-Host "[DTO-HOTFIX][CHECK] Backup created: $backup" -ForegroundColor DarkGray

Copy-Item $source $target -Force
Write-Host '[DTO-HOTFIX][CHECK] Model file replaced.' -ForegroundColor Yellow

$content = Get-Content $target -Raw
$required = @('grammarFocus', 'vocabularyFocus', 'strengths', 'textTurns', 'voiceTurns')
$missing = @()
foreach ($name in $required) {
  if ($content -notmatch [regex]::Escape($name)) { $missing += $name }
}

if ($missing.Count -gt 0) {
  Write-Host "[DTO-HOTFIX][ERROR] Missing fields: $($missing -join ', ')" -ForegroundColor Red
  exit 12
}

Write-Host '[DTO-HOTFIX][SUCCESS] All conversation detail fields are present:' -ForegroundColor Green
$required | ForEach-Object { Write-Host "  - $_" }
Write-Host ''
Write-Host 'Now run: npm run build' -ForegroundColor Cyan
