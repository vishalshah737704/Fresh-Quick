<#
.SYNOPSIS
  Convenience wrapper for `npm run app:seed` (scripts/seed.mjs).
  Lets you double-click or run this from PowerShell without typing npm.
#>
$root = Split-Path -Parent $PSScriptRoot
node (Join-Path $root "scripts/seed.mjs")
exit $LASTEXITCODE
