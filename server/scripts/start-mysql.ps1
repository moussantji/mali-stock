param()

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
$port = if ($envValues["MYSQL_PORT"]) { [int]$envValues["MYSQL_PORT"] } else { 3306 }
$mysqld = Join-Path $mysqlHome "bin\mysqld.exe"

if (-not (Test-Path $mysqld)) {
  throw "mysqld.exe introuvable dans '$mysqlHome'. Lance npm run db:setup."
}
if (-not (Test-Path (Join-Path $dataDir "mysql"))) {
  throw "La base MySQL n'est pas initialisée. Lance : npm run db:setup"
}

$listening = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
if ($listening) {
  Write-Host "MySQL écoute déjà sur le port $port."
  exit 0
}

$logDir = Join-Path $env:LOCALAPPDATA "mali-stock\logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

$arguments = @(
  "--basedir=$mysqlHome",
  "--datadir=$dataDir",
  "--port=$port",
  "--bind-address=127.0.0.1",
  "--mysqlx=0",
  "--character-set-server=utf8mb4",
  "--collation-server=utf8mb4_unicode_ci",
  "--log-error=$logDir\mysql-error.log",
  "--pid-file=$dataDir\mysqld.pid"
)

Start-Process -FilePath $mysqld -ArgumentList $arguments -WindowStyle Hidden
Write-Host "Démarrage de MySQL sur 127.0.0.1:$port…"

for ($attempt = 1; $attempt -le 60; $attempt++) {
  Start-Sleep -Milliseconds 1000
  if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) {
    Write-Host "MySQL est prêt (port $port)."
    exit 0
  }
}

throw "MySQL n'a pas démarré. Consulte $logDir\mysql-error.log."
