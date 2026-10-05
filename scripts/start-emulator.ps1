# Starts the Android emulator (Pixel_API_35) and puts its window in the middle of the
# screen, resized so it fits completely (the emulator ignores its saved position and
# opens partly off-screen on this 4K / 225% scaling PC).
#
# Usage (PowerShell, from the project folder):  .\scripts\start-emulator.ps1
# Optional: -OpenApp also opens the app in Expo Go once the phone has booted
#           (Metro must already be running on port 8081).
param(
  [string]$Avd = "Pixel_API_35",
  [switch]$OpenApp
)

$sdk = Join-Path $env:LOCALAPPDATA "Android\Sdk"
$emulator = Join-Path $sdk "emulator\emulator.exe"
$adb = Join-Path $sdk "platform-tools\adb.exe"

Add-Type -AssemblyName System.Windows.Forms
Add-Type @"
using System; using System.Runtime.InteropServices;
public class EmuWin {
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr a, int x, int y, int cx, int cy, uint f);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
}
"@
[EmuWin]::SetProcessDPIAware() | Out-Null

function Get-EmulatorProcess {
  Get-Process -Name "qemu-system-x86_64" -ErrorAction SilentlyContinue |
    Where-Object { $_.MainWindowTitle -like "*Android Emulator*" } | Select-Object -First 1
}

if (-not (Get-EmulatorProcess)) {
  if (-not (Test-Path $emulator)) { Write-Error "Emulator not found at $emulator"; exit 1 }
  Start-Process -FilePath $emulator -ArgumentList "-avd", $Avd
  Write-Host "Starting $Avd ..."
}

# Wait up to 90 s for the emulator window to exist.
$proc = $null
for ($i = 0; $i -lt 90 -and -not $proc; $i++) {
  Start-Sleep -Seconds 1
  $proc = Get-EmulatorProcess
}
if (-not $proc) { Write-Error "The emulator window did not appear."; exit 1 }
Start-Sleep -Seconds 3

# Fit the window inside the usable screen area (leave a margin) and centre it.
$area = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
$r = New-Object EmuWin+RECT
[EmuWin]::GetWindowRect($proc.MainWindowHandle, [ref]$r) | Out-Null
$w = $r.R - $r.L
$h = $r.B - $r.T
$maxH = $area.Height - 160
$maxW = $area.Width - 160
$scale = [Math]::Min(1.0, [Math]::Min($maxH / $h, $maxW / $w))
$newW = [int]($w * $scale)
$newH = [int]($h * $scale)
$x = [int]($area.X + ($area.Width - $newW) / 2)
$y = [int]($area.Y + ($area.Height - $newH) / 2)
[EmuWin]::ShowWindow($proc.MainWindowHandle, 9) | Out-Null
[EmuWin]::SetWindowPos($proc.MainWindowHandle, [IntPtr]::Zero, $x, $y, $newW, $newH, 0x0004) | Out-Null
# Windows may refuse to bring a window to the front, so toggle "always on top" on and off.
[EmuWin]::SetWindowPos($proc.MainWindowHandle, [IntPtr](-1), 0, 0, 0, 0, 0x0003) | Out-Null
[EmuWin]::SetWindowPos($proc.MainWindowHandle, [IntPtr](-2), 0, 0, 0, 0, 0x0003) | Out-Null
[EmuWin]::SetForegroundWindow($proc.MainWindowHandle) | Out-Null
Start-Sleep -Seconds 3
Write-Host "Emulator window placed at $x,$y size ${newW}x${newH}."

if ($OpenApp) {
  Write-Host "Waiting for the phone to finish booting ..."
  for ($i = 0; $i -lt 120; $i++) {
    $boot = (& $adb shell getprop sys.boot_completed 2>$null)
    if ($boot -and $boot.Trim() -eq "1") { break }
    Start-Sleep -Seconds 2
  }
  & $adb shell am start -a android.intent.action.VIEW -d "exp://10.0.2.2:8081"
}
