<#
.SYNOPSIS
  Shortcut for `.\scripts\start.ps1 -Dev -AllRoles`. Starts Supabase + n8n,
  then 4 Next.js dev server instances (one per role/port), each a real
  detached background process with its own log-viewer window — closing
  that window does not stop the service.
.PARAMETER SkipN8n
  Don't start the n8n container.
#>
param(
  [switch]$SkipN8n
)
$root = Split-Path -Parent $PSScriptRoot
$scriptArgs = @("-Dev", "-AllRoles")
if ($SkipN8n) { $scriptArgs += "-SkipN8n" }
& (Join-Path $root "scripts/start.ps1") @scriptArgs
exit $LASTEXITCODE
