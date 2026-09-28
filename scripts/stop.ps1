<#
.SYNOPSIS
  Convenience wrapper for `npm run app:stop` (scripts/stop.mjs). Stops
  everything: the Next.js app (frontend + backend API routes), the n8n
  container (Docker), and Supabase (Docker). Lets you double-click or run
  this from PowerShell without typing npm.
.PARAMETER KeepSupabase
  Leave the Supabase Docker containers running.
.PARAMETER KeepN8n
  Leave the n8n Docker container running.
.PARAMETER Port
  Port the Next.js server is listening on. Defaults to 3000.
.PARAMETER Mobile
  Also stop the Expo/Metro mobile dev server.
.PARAMETER MobilePort
  Port Metro is listening on. Defaults to 8081.
#>
param(
  [switch]$KeepSupabase,
  [switch]$KeepN8n,
  [int]$Port = 3000,
  [switch]$Mobile,
  [int]$MobilePort = 8081
)
$root = Split-Path -Parent $PSScriptRoot
$scriptArgs = @("--port=$Port")
if ($KeepSupabase) { $scriptArgs += "--keep-supabase" }
if ($KeepN8n) { $scriptArgs += "--keep-n8n" }
if ($Mobile) { $scriptArgs += "--mobile"; $scriptArgs += "--mobile-port=$MobilePort" }
node (Join-Path $root "scripts/stop.mjs") @scriptArgs
exit $LASTEXITCODE
