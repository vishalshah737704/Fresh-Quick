<#
.SYNOPSIS
  Convenience wrapper for `npm run app:start` / `app:start:dev`
  (scripts/start.mjs). Starts everything: Supabase (Docker), the n8n
  container (Docker), and the Next.js app (frontend + backend API
  routes). Lets you double-click or run this from PowerShell without
  typing npm.
.PARAMETER Dev
  Run the Next.js dev server instead of the production server.
.PARAMETER SkipN8n
  Don't start the n8n container.
#>
param(
  [switch]$Dev,
  [switch]$SkipN8n
)
$root = Split-Path -Parent $PSScriptRoot
$scriptArgs = @()
if ($Dev) { $scriptArgs += "--dev" }
if ($SkipN8n) { $scriptArgs += "--skip-n8n" }
node (Join-Path $root "scripts/start.mjs") @scriptArgs
exit $LASTEXITCODE
