$ErrorActionPreference = 'Stop'
$releasePath = Join-Path $PSScriptRoot '..\release'
$distPath = Join-Path $PSScriptRoot '..\dist'
$zipPath = Join-Path $releasePath 'pastefit-0.1.0.zip'

if (-not (Test-Path (Join-Path $distPath 'manifest.json'))) { throw 'Run npm run build before npm run package.' }
New-Item -ItemType Directory -Force -Path $releasePath | Out-Null
if (Test-Path $zipPath) { Remove-Item -LiteralPath $zipPath -Force }
Compress-Archive -Path (Join-Path $distPath '*') -DestinationPath $zipPath -Force
Write-Output $zipPath
