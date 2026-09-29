<#
.SYNOPSIS
  Convenience wrapper for `npm run app:stop` (scripts/stop.mjs). Stops
  everything by default: the Next.js web app, the Expo mobile app (Metro),
  the n8n container (Docker), and Supabase (Docker). Lets you
  double-click or run this from PowerShell without typing npm.
.PARAMETER KeepSupabase
  Leave the Supabase Docker containers running.
.PARAMETER KeepN8n
  Leave the n8n Docker container running.
.PARAMETER KeepMobile
  Leave the Expo/Metro mobile dev server running.
.PARAMETER Port
  Port the Next.js server is listening on. Defaults to 3000. Ignored if
  -AllRoles is passed.
.PARAMETER MobilePort
  Port Metro is listening on. Defaults to 8081.
.PARAMETER AllRoles
  Stop all 4 role-port web servers (3000/3001/3002/3003) instead of just
  -Port, matching `-AllRoles` on start.ps1.
#>
param(
  [switch]$KeepSupabase,
  [switch]$KeepN8n,
  [switch]$KeepMobile,
  [int]$Port = 3000,
  [int]$MobilePort = 8081,
  [switch]$AllRoles
)
$root = Split-Path -Parent $PSScriptRoot
$scriptArgs = @("--port=$Port", "--mobile-port=$MobilePort")
if ($KeepSupabase) { $scriptArgs += "--keep-supabase" }
if ($KeepN8n) { $scriptArgs += "--keep-n8n" }
if ($KeepMobile) { $scriptArgs += "--keep-mobile" }
if ($AllRoles) { $scriptArgs += "--all-roles" }
node (Join-Path $root "scripts/stop.mjs") @scriptArgs
exit $LASTEXITCODE
