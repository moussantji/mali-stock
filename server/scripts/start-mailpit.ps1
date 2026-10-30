# Mali Stock — démarre Mailpit (serveur SMTP local + boîte email web)
# Télécharge mailpit.exe si absent, puis le lance en tâche de fond.
$ErrorActionPreference = "Stop"

$dir = Join-Path $PSScriptRoot "..\tools\mailpit"
$exe = Join-Path $dir "mailpit.exe"

if (!(Test-Path $exe)) {
  Write-Host "[mailpit] Téléchargement…"
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  $zip = Join-Path $env:TEMP "mailpit-windows-amd64.zip"
  Invoke-WebRequest -Uri "https://github.com/axllent/mailpit/releases/latest/download/mailpit-windows-amd64.zip" -OutFile $zip -UseBasicParsing
  Expand-Archive -Path $zip -DestinationPath $dir -Force
  Remove-Item $zip -ErrorAction SilentlyContinue
}

$running = Get-NetTCPConnection -LocalPort 1025 -State Listen -ErrorAction SilentlyContinue
if ($running) {
  Write-Host "[mailpit] Déjà démarré (SMTP 1025, boîte web 8025)."
  exit 0
}

Start-Process -FilePath $exe -WindowStyle Hidden
Start-Sleep -Seconds 2

$ok = Get-NetTCPConnection -LocalPort 1025 -State Listen -ErrorAction SilentlyContinue
if ($ok) {
  Write-Host "[mailpit] Démarré : SMTP sur 1025 · Boîte email sur http://localhost:8025"
} else {
  Write-Host "[mailpit] ERREUR : n'a pas démarré."
  exit 1
}
