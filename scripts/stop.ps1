<#
.SYNOPSIS
  Convenience wrapper for `npm run app:stop` (scripts/stop.mjs).
  Lets you double-click or run this from PowerShell without typing npm.
.PARAMETER KeepSupabase
  Leave the Supabase Docker containers running (only stop the Next.js
  process). By default this stops both.
.PARAMETER Port
  Port the Next.js server is listening on. Defaults to 3000.
#>
param(
  [switch]$KeepSupabase,
  [int]$Port = 3000
)
$root = Split-Path -Parent $PSScriptRoot
$scriptArgs = @("--port=$Port")
if ($KeepSupabase) { $scriptArgs += "--keep-supabase" }
node (Join-Path $root "scripts/stop.mjs") @scriptArgs
exit $LASTEXITCODE
