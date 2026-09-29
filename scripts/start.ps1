<#
.SYNOPSIS
  Convenience wrapper for `npm run app:start` / `app:start:dev`
  (scripts/start.mjs). Starts everything: Supabase (Docker), the n8n
  container (Docker), the Next.js web app, and the Expo mobile app —
  each runs as a real detached background process with its own
  log-viewer window (closing that window only stops watching the log,
  it does NOT stop the service). Lets you double-click or run this from
  PowerShell without typing npm.
.PARAMETER Dev
  Run the Next.js dev server instead of the production server.
.PARAMETER SkipN8n
  Don't start the n8n container.
.PARAMETER SkipMobile
  Don't start the Expo mobile app. Mobile starts by default; if
  mobile/.env doesn't exist yet, mobile is skipped automatically with a
  warning instead of failing the whole script.
.PARAMETER AllRoles
  Start 4 web server instances instead of 1, one per role/port (3000
  Customer, 3001 Vendor, 3002 Delivery, 3003 Admin) — each port is its
  own browser origin, so all 4 roles can be logged in simultaneously
  without Incognito windows.
#>
param(
  [switch]$Dev,
  [switch]$SkipN8n,
  [switch]$SkipMobile,
  [switch]$AllRoles
)
$root = Split-Path -Parent $PSScriptRoot
$scriptArgs = @()
if ($Dev) { $scriptArgs += "--dev" }
if ($SkipN8n) { $scriptArgs += "--skip-n8n" }
if ($SkipMobile) { $scriptArgs += "--skip-mobile" }
if ($AllRoles) { $scriptArgs += "--all-roles" }
node (Join-Path $root "scripts/start.mjs") @scriptArgs
exit $LASTEXITCODE
