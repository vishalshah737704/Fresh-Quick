# Stops the Android emulator (Pixel_API_35).
#
# It first asks the emulator to shut down cleanly through adb ("adb emu kill"), which lets
# Android save its state. If the emulator is still running after a few seconds it is
# stopped by force. Metro, Docker and the web app are NOT touched.
#
# Usage (PowerShell, from the project folder):  .\scripts\stop-emulator.ps1
param(
  [int]$WaitSeconds = 15
)

$adb = Join-Path $env:LOCALAPPDATA "Android\Sdk\platform-tools\adb.exe"

function Get-EmulatorProcesses {
  Get-Process -Name "qemu-system-x86_64", "emulator" -ErrorAction SilentlyContinue
}

if (-not (Get-EmulatorProcesses)) {
  Write-Host "The emulator is not running."
  exit 0
}

if (Test-Path $adb) {
  Write-Host "Asking the emulator to shut down ..."
  & $adb emu kill 2>$null | Out-Null
}

for ($i = 0; $i -lt $WaitSeconds -and (Get-EmulatorProcesses); $i++) {
  Start-Sleep -Seconds 1
}

$left = Get-EmulatorProcesses
if ($left) {
  Write-Host "Still running after $WaitSeconds seconds, stopping it by force ..."
  $left | Stop-Process -Force
  Start-Sleep -Seconds 2
}

if (Get-EmulatorProcesses) {
  Write-Error "The emulator could not be stopped. Close its window by hand."
  exit 1
}

Write-Host "Emulator stopped."
