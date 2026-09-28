<#
.SYNOPSIS
  Convenience wrapper for `npm run app:start` / `app:start:dev`
  (scripts/start.mjs). Starts everything: Supabase (Docker), the n8n
  container (Docker), the Next.js web app, and the Expo mobile app — web
  and mobile each open in their own new window (so this script returns
  your terminal immediately; check each window for logs). Lets you
  double-click or run this from PowerShell without typing npm.
.PARAMETER Dev
  Run the Next.js dev server instead of the production server.
.PARAMETER SkipN8n
  Don't start the n8n container.
.PARAMETER SkipMobile
  Don't start the Expo mobile app. Mobile starts by default; if
  mobile/.env doesn't exist yet, mobile is skipped automatically with a
  warning instead of failing the whole script.
#>
param(
  [switch]$Dev,
  [switch]$SkipN8n,
  [switch]$SkipMobile
)
$root = Split-Path -Parent $PSScriptRoot
$scriptArgs = @()
if ($Dev) { $scriptArgs += "--dev" }
if ($SkipN8n) { $scriptArgs += "--skip-n8n" }
if ($SkipMobile) { $scriptArgs += "--skip-mobile" }
node (Join-Path $root "scripts/start.mjs") @scriptArgs
exit $LASTEXITCODE
