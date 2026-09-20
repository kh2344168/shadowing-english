$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Speech

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$outputDirectory = Join-Path $projectRoot 'public\demo'
$outputAudioPath = Join-Path $outputDirectory 'call-center-introduction.wav'
$outputManifestPath = Join-Path $outputDirectory 'call-center-introduction.json'
$temporaryDirectory = Join-Path ([System.IO.Path]::GetTempPath()) ('shadowing-demo-' + [Guid]::NewGuid().ToString('N'))

$sampleRate = 22050
$bitsPerSample = 16
$channels = 1
$bytesPerSample = $bitsPerSample / 8
$blockAlign = $channels * $bytesPerSample
$byteRate = $sampleRate * $blockAlign
$silenceMilliseconds = 900

$sentences = @(
    [PSCustomObject]@{
        Text = 'Hello, thank you for calling customer service.'
        Translation = ('"\u0645\u0631\u062d\u0628\u064b\u0627\u060c \u0634\u0643\u0631\u064b\u0627 \u0644\u0627\u062a\u0635\u0627\u0644\u0643 \u0628\u062e\u062f\u0645\u0629 \u0627\u0644\u0639\u0645\u0644\u0627\u0621."' | ConvertFrom-Json)
    },
    [PSCustomObject]@{
        Text = 'My name is Khaled. How can I help you today?'
        Translation = ('"\u0627\u0633\u0645\u064a \u062e\u0627\u0644\u062f. \u0643\u064a\u0641 \u064a\u0645\u0643\u0646\u0646\u064a \u0645\u0633\u0627\u0639\u062f\u062a\u0643 \u0627\u0644\u064a\u0648\u0645\u061f"' | ConvertFrom-Json)
    },
    [PSCustomObject]@{
        Text = 'I understand your concern, and I will check that for you.'
        Translation = ('"\u0623\u062a\u0641\u0647\u0645 \u0645\u0634\u0643\u0644\u062a\u0643\u060c \u0648\u0633\u0623\u062a\u062d\u0642\u0642 \u0645\u0646 \u0630\u0644\u0643 \u0645\u0646 \u0623\u062c\u0644\u0643."' | ConvertFrom-Json)
    },
    [PSCustomObject]@{
        Text = 'Thank you for your patience. Is there anything else I can help you with?'
        Translation = ('"\u0634\u0643\u0631\u064b\u0627 \u0644\u0635\u0628\u0631\u0643. \u0647\u0644 \u064a\u0648\u062c\u062f \u0634\u064a\u0621 \u0622\u062e\u0631 \u064a\u0645\u0643\u0646\u0646\u064a \u0645\u0633\u0627\u0639\u062f\u062a\u0643 \u0641\u064a\u0647\u061f"' | ConvertFrom-Json)
    }
)

function Get-WaveDataBytes {
    param([Parameter(Mandatory = $true)][string]$Path)

    $bytes = [System.IO.File]::ReadAllBytes($Path)

    if ($bytes.Length -lt 44 -or
        [System.Text.Encoding]::ASCII.GetString($bytes, 0, 4) -ne 'RIFF' -or
        [System.Text.Encoding]::ASCII.GetString($bytes, 8, 4) -ne 'WAVE') {
        throw "The generated speech file is not a valid WAV file: $Path"
    }

    $offset = 12

    while ($offset + 8 -le $bytes.Length) {
        $chunkId = [System.Text.Encoding]::ASCII.GetString($bytes, $offset, 4)
        $chunkSize = [System.BitConverter]::ToInt32($bytes, $offset + 4)
        $dataStart = $offset + 8

        if ($chunkId -eq 'data') {
            if ($chunkSize -lt 0 -or $dataStart + $chunkSize -gt $bytes.Length) {
                throw "The WAV data chunk is invalid: $Path"
            }

            $result = [byte[]]::new($chunkSize)
            [System.Array]::Copy($bytes, $dataStart, $result, 0, $chunkSize)
            return $result
        }

        $offset = $dataStart + $chunkSize
        if (($chunkSize % 2) -ne 0) {
            $offset++
        }
    }

    throw "The generated WAV file has no audio data: $Path"
}

function Write-PcmWaveFile {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][byte[]]$AudioBytes
    )

    $stream = [System.IO.File]::Create($Path)
    $writer = [System.IO.BinaryWriter]::new($stream)

    try {
        $writer.Write([System.Text.Encoding]::ASCII.GetBytes('RIFF'))
        $writer.Write([int](36 + $AudioBytes.Length))
        $writer.Write([System.Text.Encoding]::ASCII.GetBytes('WAVE'))
        $writer.Write([System.Text.Encoding]::ASCII.GetBytes('fmt '))
        $writer.Write([int]16)
        $writer.Write([int16]1)
        $writer.Write([int16]$channels)
        $writer.Write([int]$sampleRate)
        $writer.Write([int]$byteRate)
        $writer.Write([int16]$blockAlign)
        $writer.Write([int16]$bitsPerSample)
        $writer.Write([System.Text.Encoding]::ASCII.GetBytes('data'))
        $writer.Write([int]$AudioBytes.Length)
        $writer.Write($AudioBytes)
    }
    finally {
        $writer.Dispose()
        $stream.Dispose()
    }
}

New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
New-Item -ItemType Directory -Path $temporaryDirectory -Force | Out-Null

$synthesizer = [System.Speech.Synthesis.SpeechSynthesizer]::new()
$combinedAudio = [System.IO.MemoryStream]::new()
$segments = @()

try {
    $englishVoice = $synthesizer.GetInstalledVoices() |
        Where-Object { $_.Enabled -and $_.VoiceInfo.Culture.Name -like 'en-*' } |
        Select-Object -First 1

    if ($null -ne $englishVoice) {
        $synthesizer.SelectVoice($englishVoice.VoiceInfo.Name)
        Write-Host ('Using Windows voice: ' + $englishVoice.VoiceInfo.Name)
    }
    else {
        Write-Host 'No English Windows voice was found. Using the default Windows voice.'
    }

    $synthesizer.Rate = -1
    $synthesizer.Volume = 100

    $audioFormat = [System.Speech.AudioFormat.SpeechAudioFormatInfo]::new(
        $sampleRate,
        [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen,
        [System.Speech.AudioFormat.AudioChannel]::Mono
    )

    for ($index = 0; $index -lt $sentences.Count; $index++) {
        $temporaryWavePath = Join-Path $temporaryDirectory ("sentence-$index.wav")
        $synthesizer.SetOutputToWaveFile($temporaryWavePath, $audioFormat)
        $synthesizer.Speak($sentences[$index].Text)
        $synthesizer.SetOutputToNull()

        $sentenceAudio = Get-WaveDataBytes -Path $temporaryWavePath
        $segmentStart = $combinedAudio.Length / [double]$byteRate
        $combinedAudio.Write($sentenceAudio, 0, $sentenceAudio.Length)
        $segmentEnd = $combinedAudio.Length / [double]$byteRate

        $segments += [ordered]@{
            text = $sentences[$index].Text
            translation = $sentences[$index].Translation
            start = [Math]::Round($segmentStart, 3)
            end = [Math]::Round($segmentEnd, 3)
        }

        if ($index -lt $sentences.Count - 1) {
            $silenceByteCount = [int][Math]::Round($byteRate * ($silenceMilliseconds / 1000.0))
            $silence = [byte[]]::new($silenceByteCount)
            $combinedAudio.Write($silence, 0, $silence.Length)
        }
    }

    Write-PcmWaveFile -Path $outputAudioPath -AudioBytes $combinedAudio.ToArray()

    $now = [DateTime]::UtcNow.ToString('o')
    $manifest = [ordered]@{
        id = 'lesson-demo-call-center'
        title = 'Call Center: Greeting a Customer'
        description = 'Portable demo lesson generated with the English voice installed in Windows.'
        status = 'ready'
        weekName = 'Week 1'
        dayName = 'Day 1'
        requiredRepetitions = 3
        mediaFileName = 'call-center-introduction.wav'
        mediaType = 'audio/wav'
        segments = $segments
        scriptLines = @($sentences | ForEach-Object { $_.Text })
        createdAt = $now
        updatedAt = $now
    }

    $json = $manifest | ConvertTo-Json -Depth 10
    $utf8WithoutBom = [System.Text.UTF8Encoding]::new($false)
    [System.IO.File]::WriteAllText($outputManifestPath, $json, $utf8WithoutBom)

    Write-Host ('Audio created: ' + $outputAudioPath)
    Write-Host ('Lesson manifest created: ' + $outputManifestPath)
}
finally {
    $combinedAudio.Dispose()
    $synthesizer.Dispose()

    if (Test-Path $temporaryDirectory) {
        Remove-Item -Path $temporaryDirectory -Recurse -Force
    }
}
