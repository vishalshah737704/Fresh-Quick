<#
.SYNOPSIS
  Convenience wrapper for `npm run app:build` (scripts/build.mjs).
  Lets you double-click or run this from PowerShell without typing npm.
#>
$root = Split-Path -Parent $PSScriptRoot
node (Join-Path $root "scripts/build.mjs")
exit $LASTEXITCODE
