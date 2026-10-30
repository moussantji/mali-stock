$ErrorActionPreference = "Stop"
$serverRoot = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $serverRoot ".env"

if (-not (Test-Path $envPath)) {
  throw "Fichier server/.env introuvable. Copie server/.env.example vers server/.env."
}

$envValues = @{}
Get-Content $envPath | ForEach-Object {
  if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$') {
    $envValues[$matches[1]] = $matches[2]
  }
}

$mysqlHome = $envValues["MYSQL_HOME"]
if ([string]::IsNullOrWhiteSpace($mysqlHome)) {
  $mysqlHome = Join-Path $env:LOCALAPPDATA "mali-stock\mysql-server"
}
$dataDir = $envValues["MYSQL_DATA_DIR"]
if ([string]::IsNullOrWhiteSpace($dataDir)) {
  $dataDir = Join-Path $env:LOCALAPPDATA "mali-stock\mysql-data"
}
$mysqld = Join-Path $mysqlHome "bin\mysqld.exe"

if (-not (Test-Path $mysqld)) {
  throw @"
mysqld.exe introuvable dans '$mysqlHome'.

Télécharge MySQL Community Server (ZIP) :
https://dev.mysql.com/downloads/mysql/
Extrais-le puis renseigne MYSQL_HOME dans server/.env.
"@
}

if (-not (Test-Path (Join-Path $dataDir "mysql"))) {
  Write-Host "Initialisation du dossier de données MySQL…"
  New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
  & $mysqld --initialize-insecure "--basedir=$mysqlHome" "--datadir=$dataDir"
  if ($LASTEXITCODE -ne 0) {
    throw "Échec de l'initialisation MySQL (code $LASTEXITCODE)."
  }
  Write-Host "Données initialisées."
}

Write-Host "Démarrage de MySQL…"
& (Join-Path $PSScriptRoot "start-mysql.ps1")

Write-Host "Création de la base et de l'utilisateur applicatif…"
Push-Location $serverRoot
try {
  & node scripts/init-db.js
  if ($LASTEXITCODE -ne 0) {
    throw "Échec de l'initialisation de la base (code $LASTEXITCODE)."
  }
} finally {
  Pop-Location
}

Write-Host ""
Write-Host "MySQL et la base Mali Stock sont prêts."
Write-Host "Démarre l'API avec : cd server ; npm run dev"
