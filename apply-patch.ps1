param(
  [Parameter(Mandatory = $false)]
  [string]$ProjectRoot = (Get-Location).Path
)

$ErrorActionPreference = 'Stop'
$startedAt = Get-Date
Write-Host "[PATCH][START] Target=$ProjectRoot"

$files = @(
  'src/app/features/lessons/data-access/lesson-ai-api.service.ts',
  'src/app/features/lessons/data-access/lesson-ai-api.service.spec.ts',
  'src/app/features/lessons/pages/lesson-builder/lesson-builder.page.ts',
  'src/app/features/lessons/pages/lesson-builder/lesson-builder.page.html',
  'backend/ShadowingEnglish.Api/Services/LessonAiService.cs',
  'scripts/run-api.ps1',
  'scripts/check-ai-backend-only.ps1',
  'proxy.conf.json'
)

foreach ($relative in $files) {
  $source = Join-Path $PSScriptRoot $relative
  $destination = Join-Path $ProjectRoot $relative
  if (-not (Test-Path $source)) { throw "Patch file missing: $relative" }
  $destinationDir = Split-Path $destination -Parent
  New-Item -ItemType Directory -Force -Path $destinationDir | Out-Null
  Copy-Item $source $destination -Force
  Write-Host "[PATCH][CHECK] copied $relative"
}

$duration = [int]((Get-Date) - $startedAt).TotalMilliseconds
Write-Host "[PATCH][SUCCESS] Files=$($files.Count) durationMs=$duration"
Write-Host 'Next: run scripts\run-api.cmd, then scripts\run-frontend.cmd.'
