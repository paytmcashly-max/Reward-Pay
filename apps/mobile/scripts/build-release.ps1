$ErrorActionPreference = "Stop"

function Resolve-JavaHome {
  $candidates = @(
    $env:JAVA_HOME,
    "C:\Users\kk701\.jdks\jdk-17.0.19+10",
    "C:\Users\kk701\.gradle\jdks\eclipse_adoptium-17-amd64-windows.2",
    "C:\Program Files\Android\Android Studio\jbr",
    "C:\Program Files\JetBrains\IntelliJ IDEA Community Edition 2025.1.3\jbr"
  ) | Where-Object { $_ }

  foreach ($candidate in $candidates) {
    $java = Join-Path $candidate "bin\java.exe"
    $jlink = Join-Path $candidate "bin\jlink.exe"
    if ((Test-Path $java) -and (Test-Path $jlink)) {
      return $candidate
    }
  }

  throw "No compatible JDK with java.exe and jlink.exe was found. Set JAVA_HOME to a full JDK 17+ install."
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$mobileRoot = Split-Path -Parent $scriptDir
$androidDir = Join-Path $mobileRoot "android"
$appJsonPath = Join-Path $mobileRoot "app.json"
$outputDir = Join-Path (Split-Path -Parent $mobileRoot) "..\builds"
$javaHome = Resolve-JavaHome

$versionName = "release"
if (Test-Path $appJsonPath) {
  try {
    $appConfig = Get-Content $appJsonPath -Raw | ConvertFrom-Json
    if ($appConfig.expo.version) {
      $versionName = $appConfig.expo.version
    }
  } catch {
    Write-Warning "Could not parse app.json for version. Falling back to generic name."
  }
}

Write-Host "Using JAVA_HOME=$javaHome"
$env:JAVA_HOME = $javaHome
$env:Path = "$javaHome\bin;$env:Path"

if (-not $env:NODE_ENV) {
  $env:NODE_ENV = "production"
}

$env:EXPO_USE_COMMUNITY_AUTOLINKING = "1"

Push-Location $androidDir
try {
  & .\gradlew.bat assembleRelease
} finally {
  Pop-Location
}

$apkSource = Join-Path $androidDir "app\build\outputs\apk\release\app-release.apk"
if (Test-Path $apkSource) {
  New-Item -ItemType Directory -Force -Path $outputDir | Out-Null
  $cleanVersion = $versionName -replace '[^0-9A-Za-z\.-]', '-'
  $apkTarget = Join-Path $outputDir ("reward-wallet-v{0}-release.apk" -f $cleanVersion)
  Copy-Item $apkSource $apkTarget -Force
  Write-Host "Copied release APK to $apkTarget"
}
