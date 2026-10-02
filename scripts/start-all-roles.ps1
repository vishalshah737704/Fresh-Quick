<#
.SYNOPSIS
  Shortcut for `npm run app:start:all-roles`.
#>
Set-Location (Split-Path -Parent $PSScriptRoot)
npm run app:start:all-roles
exit $LASTEXITCODE
