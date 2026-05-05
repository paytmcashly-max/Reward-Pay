$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$mobileRoot = Split-Path -Parent $scriptDir
$productionEnv = Join-Path $mobileRoot ".env.production"
$defaultEnv = Join-Path $mobileRoot ".env"
$backupEnv = Join-Path $mobileRoot ".env.backup.codex"

if (-not (Test-Path $productionEnv)) {
  throw ".env.production not found in apps/mobile. Create it from .env.production.example before building a production APK."
}

$hadDefaultEnv = Test-Path $defaultEnv
if ($hadDefaultEnv) {
  Copy-Item $defaultEnv $backupEnv -Force
}

try {
  Copy-Item $productionEnv $defaultEnv -Force
  & (Join-Path $scriptDir "build-release.ps1")
} finally {
  if (Test-Path $backupEnv) {
    Move-Item $backupEnv $defaultEnv -Force
  }
}
