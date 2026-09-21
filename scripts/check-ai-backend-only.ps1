$ErrorActionPreference = 'Stop'
Write-Host '[AI-BACKEND-ONLY][START] verifying runtime paths'

$service = 'src/app/features/lessons/data-access/lesson-ai-api.service.ts'
$proxy = 'proxy.conf.json'
$index = 'src/index.html'
$serverConfig = 'public/server-config.js'

if (!(Test-Path $service)) { throw "Missing $service" }
if (Select-String -Path $service -Pattern '/__ai/|FRONTEND_AI_TEST_CONFIG|api\.groq\.com|api\.mistral\.ai|generativelanguage\.googleapis\.com|api\.pexels\.com' -Quiet) {
  throw 'Frontend still contains a direct provider/proxy path.'
}
if (Test-Path $proxy) {
  $proxyContent = (Get-Content -Path $proxy -Raw).Trim()
  if ($proxyContent -ne '{}') {
    throw 'proxy.conf.json is not empty. Local development must call the Backend directly without an Angular proxy.'
  }
}
if ((Test-Path $index) -and (Select-String -Path $index -Pattern 'server-config\.js' -Quiet)) {
  throw 'index.html still loads server-config.js.'
}
if ((Test-Path $serverConfig) -and (Select-String -Path $serverConfig -Pattern 'groqApiKey|geminiApiKey|mistralApiKey|pexelsApiKey|gsk_' -Quiet)) {
  throw 'public/server-config.js still appears to contain frontend AI keys/config.'
}

Write-Host '[AI-BACKEND-ONLY][CHECK] no frontend provider routes or keys found'
Write-Host '[AI-BACKEND-ONLY][SUCCESS] verification passed'
