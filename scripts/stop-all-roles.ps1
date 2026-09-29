<#
.SYNOPSIS
  Shortcut for `.\scripts\stop.ps1 -AllRoles -KeepN8n -KeepSupabase -KeepMobile`
  (or without the Keep switches if -All is passed). Stops the 4 role-port
  web servers.
.PARAMETER All
  Also stop n8n and Supabase and the mobile dev server.
#>
param(
  [switch]$All
)
$root = Split-Path -Parent $PSScriptRoot
$scriptArgs = @("-AllRoles")
if (-not $All) { $scriptArgs += "-KeepN8n", "-KeepSupabase", "-KeepMobile" }
& (Join-Path $root "scripts/stop.ps1") @scriptArgs
exit $LASTEXITCODE
