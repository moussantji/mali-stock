# Mali Stock — arrête Mailpit
Stop-Process -Name "mailpit" -Force -ErrorAction SilentlyContinue
Write-Host "[mailpit] Arrêté."
