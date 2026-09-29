<#
.SYNOPSIS
  Convenience wrapper for `npm run app:start:all-roles` (scripts/start-all-roles.mjs).
  Starts Supabase + n8n, then opens 4 separate Next.js dev server windows
  on ports 3000/3001/3002/3003 -- one per role (Customer/Vendor/Delivery/
  Admin) -- so each role's browser session lives in its own origin and
  can be logged in simultaneously without Incognito windows.
.PARAMETER SkipN8n
  Don't start the n8n container.
#>
param(
  [switch]$SkipN8n
)
$root = Split-Path -Parent $PSScriptRoot
$scriptArgs = @()
if ($SkipN8n) { $scriptArgs += "--skip-n8n" }
node (Join-Path $root "scripts/start-all-roles.mjs") @scriptArgs
exit $LASTEXITCODE
