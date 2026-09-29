<#
.SYNOPSIS
  Convenience wrapper for `npm run app:stop:all-roles` (scripts/stop-all-roles.mjs).
  Stops the 4 per-role dev servers on ports 3000-3003.
.PARAMETER All
  Also stop n8n and Supabase.
#>
param(
  [switch]$All
)
$root = Split-Path -Parent $PSScriptRoot
$scriptArgs = @()
if ($All) { $scriptArgs += "--all" }
node (Join-Path $root "scripts/stop-all-roles.mjs") @scriptArgs
exit $LASTEXITCODE
