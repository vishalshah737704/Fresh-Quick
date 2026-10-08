<#
.SYNOPSIS
  Stops both Cloudflare tunnels, restores the original NEXT_PUBLIC_SUPABASE_URL in
  .env.local and restarts the port 3000 dev server.
#>
Set-Location (Split-Path -Parent $PSScriptRoot)
node scripts/tunnel-stop.mjs
exit $LASTEXITCODE
