<#
.SYNOPSIS
  Starts Cloudflare quick tunnels for the web app (3000) and Supabase (54321) in the
  background, points .env.local at the Supabase tunnel, restarts the port 3000 dev server,
  and prints the web URL as the last line.
#>
Set-Location (Split-Path -Parent $PSScriptRoot)
node scripts/tunnel-start.mjs
exit $LASTEXITCODE
