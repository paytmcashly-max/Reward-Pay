$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$mobileRoot = Split-Path -Parent $scriptDir
$productionEnv = Join-Path $mobileRoot ".env.production"
$defaultEnv = Join-Path $mobileRoot ".env"
$backupEnv = Join-Path $mobileRoot ".env.backup.codex"

if (-not (Test-Path $productionEnv)) {
  throw ".env.production not found in apps/mobile. Create it from .env.production.example before building a production APK."
}

$productionEnvContent = Get-Content $productionEnv -Raw
$apiBaseLine = ($productionEnvContent -split "`r?`n") | Where-Object { $_ -match "^EXPO_PUBLIC_API_BASE_URL=" } | Select-Object -First 1
if (-not $apiBaseLine) {
  throw "EXPO_PUBLIC_API_BASE_URL is required in apps/mobile/.env.production."
}

$apiBaseUrl = ($apiBaseLine -replace "^EXPO_PUBLIC_API_BASE_URL=", "").Trim()
if ($apiBaseUrl -match "localhost|127\.0\.0\.1|0\.0\.0\.0" -or $apiBaseUrl -notmatch "^https://") {
  throw "Production APK requires an HTTPS hosted API URL. Current EXPO_PUBLIC_API_BASE_URL='$apiBaseUrl'."
}

$hadDefaultEnv = Test-Path $defaultEnv
if ($hadDefaultEnv) {
  Copy-Item $defaultEnv $backupEnv -Force
}

try {
  Copy-Item $productionEnv $defaultEnv -Force
  $generatedBundleDir = Join-Path $mobileRoot "android\app\build\generated\assets\createBundleReleaseJsAndAssets"
  $generatedSourceMapDir = Join-Path $mobileRoot "android\app\build\intermediates\sourcemaps\react\release"
  if (Test-Path $generatedBundleDir) {
    Remove-Item $generatedBundleDir -Recurse -Force
  }
  if (Test-Path $generatedSourceMapDir) {
    Remove-Item $generatedSourceMapDir -Recurse -Force
  }
  & (Join-Path $scriptDir "build-release.ps1")
} finally {
  if (Test-Path $backupEnv) {
    Move-Item $backupEnv $defaultEnv -Force
  }
}
