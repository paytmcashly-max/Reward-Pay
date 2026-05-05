@echo off
setlocal

set "ANDROID_SDK_ROOT=C:\Users\kk701\AppData\Local\Android\Sdk"
set "ANDROID_HOME=C:\Users\kk701\AppData\Local\Android\Sdk"
set "JAVA_HOME=C:\Users\kk701\.jdks\openjdk-24.0.1"
set "SDKMANAGER=%ANDROID_SDK_ROOT%\cmdline-tools\19.0\bin\sdkmanager.bat"

if exist "%ANDROID_SDK_ROOT%\ndk\27.1.12297006" (
  rmdir /s /q "%ANDROID_SDK_ROOT%\ndk\27.1.12297006"
)

(for /l %%i in (1,1,60) do @echo y) | "%SDKMANAGER%" --install "ndk;27.1.12297006"
