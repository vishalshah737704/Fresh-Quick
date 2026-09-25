<#
.SYNOPSIS
  Convenience wrapper for `npm run app:start` / `app:start:dev`
  (scripts/start.mjs). Lets you double-click or run this from PowerShell
  without typing npm.
.PARAMETER Dev
  Run the Next.js dev server instead of the production server.
#>
param(
  [switch]$Dev
)
$root = Split-Path -Parent $PSScriptRoot
if ($Dev) {
  node (Join-Path $root "scripts/start.mjs") --dev
} else {
  node (Join-Path $root "scripts/start.mjs")
}
exit $LASTEXITCODE
