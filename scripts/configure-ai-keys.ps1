$ErrorActionPreference = 'Stop'

$projectPath = Join-Path $PSScriptRoot '..\backend\ShadowingEnglish.Api\ShadowingEnglish.Api.csproj'

if (-not (Get-Command dotnet -ErrorAction SilentlyContinue)) {
    throw '.NET SDK is not installed or dotnet is not available in PATH.'
}

if (-not (Test-Path $projectPath)) {
    throw "Could not find the API project at: $projectPath"
}

function ConvertFrom-SecureValue {
    param([Parameter(Mandatory = $true)][Security.SecureString]$Value)
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Value)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
}

Write-Host ''
Write-Host 'Shadowing English - secure AI key setup' -ForegroundColor Cyan
Write-Host 'Current provider order: Groq -> Gemini. Images: Pexels.'
Write-Host ''

$groqSecure = Read-Host 'Paste the Groq API key' -AsSecureString
$geminiSecure = Read-Host 'Paste the Gemini API key' -AsSecureString
$pexelsSecure = Read-Host 'Paste the Pexels API key' -AsSecureString
$groqKey = ConvertFrom-SecureValue $groqSecure
$geminiKey = ConvertFrom-SecureValue $geminiSecure
$pexelsKey = ConvertFrom-SecureValue $pexelsSecure

try {
    if ([string]::IsNullOrWhiteSpace($groqKey)) { throw 'The Groq key is empty.' }
    if ([string]::IsNullOrWhiteSpace($geminiKey)) { throw 'The Gemini key is empty.' }
    if ([string]::IsNullOrWhiteSpace($pexelsKey)) { throw 'The Pexels key is empty.' }

    & dotnet user-secrets set 'Groq:ApiKey' $groqKey --project $projectPath | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Could not save the Groq key.' }
    & dotnet user-secrets set 'Gemini:ApiKey' $geminiKey --project $projectPath | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Could not save the Gemini key.' }
    & dotnet user-secrets set 'Pexels:ApiKey' $pexelsKey --project $projectPath | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Could not save the Pexels key.' }

    Write-Host ''
    Write-Host 'Groq, Gemini, and Pexels keys were saved successfully.' -ForegroundColor Green
}
finally {
    $groqKey = $null
    $geminiKey = $null
    $pexelsKey = $null
    Remove-Variable groqSecure, geminiSecure, pexelsSecure -ErrorAction SilentlyContinue
}
