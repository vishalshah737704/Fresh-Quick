<#
.SYNOPSIS
  Shortcut for `npm run app:stop -- --all-roles`.
#>
Set-Location (Split-Path -Parent $PSScriptRoot)
npm run app:stop -- --all-roles
exit $LASTEXITCODE
