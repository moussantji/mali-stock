$ErrorActionPreference = "Stop"
$serverRoot = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $serverRoot ".env"

$envValues = @{}
if (Test-Path $envPath) {
  Get-Content $envPath | ForEach-Object {
    if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$') {
      $envValues[$matches[1]] = $matches[2]
    }
  }
}

$mysqlHome = $envValues["MYSQL_HOME"]
if ([string]::IsNullOrWhiteSpace($mysqlHome)) {
  $mysqlHome = Join-Path $env:LOCALAPPDATA "mali-stock\mysql-server"
}
$port = if ($envValues["MYSQL_PORT"]) { [int]$envValues["MYSQL_PORT"] } else { 3306 }
$mysqladmin = Join-Path $mysqlHome "bin\mysqladmin.exe"

if (-not (Test-Path $mysqladmin)) {
  throw "mysqladmin.exe introuvable dans '$mysqlHome'."
}

if (-not (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)) {
  Write-Host "MySQL n'est pas en cours d'exécution."
  exit 0
}

$env:MYSQL_PWD = $envValues["DB_ROOT_PASSWORD"]
& $mysqladmin -h 127.0.0.1 -P $port -u root shutdown
if ($LASTEXITCODE -ne 0) {
  throw "Impossible d'arrêter MySQL (code $LASTEXITCODE)."
}
Write-Host "MySQL arrêté."
