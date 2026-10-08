<#
.SYNOPSIS
  Runs `npm run app:stop -- --all-roles`, then stops the Cloudflare tunnel and restores
  the local NEXT_PUBLIC_SUPABASE_URL in .env.local (the servers are already stopped).
#>
Set-Location (Split-Path -Parent $PSScriptRoot)
npm run app:stop -- --all-roles
$exitCode = $LASTEXITCODE
node scripts/tunnel-stop.mjs --no-restart
exit $exitCode
