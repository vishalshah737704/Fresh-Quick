<#
.SYNOPSIS
  Starts the Cloudflare tunnel, then `npm run app:start:all-roles`.
  The tunnel goes first so the dev servers start with the tunnel Supabase URL in .env.local.
  If the tunnel cannot start (Docker down, token missing) the app still starts, with a warning.
#>
Set-Location (Split-Path -Parent $PSScriptRoot)
$tunnelOk = $false
node scripts/tunnel-start.mjs --no-restart
if ($LASTEXITCODE -eq 0) { $tunnelOk = $true } else { Write-Warning "Cloudflare tunnel did not start; starting the app without it." }
npm run app:start:all-roles
$exitCode = $LASTEXITCODE
if ($tunnelOk) { Write-Host "Web app URL: https://freshquick.demoaiprojects.com/customer" }
exit $exitCode
