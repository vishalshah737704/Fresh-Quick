// One-off tool: queries the Pexels Search API for restaurant-banner and
// food-dish photos, printing URLs to hand-assemble into supabase/seed.sql.
// Never called at runtime by the app itself — matches the project's
// "fetch once, bake into seed.sql" rule (see MEMORY.md's Phase 2 note).
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = join(root, ".env.local");
if (!existsSync(envPath)) {
  console.error(".env.local not found. Add PEXELS_API_KEY=<key> to it first.");
  process.exit(1);
}
const envText = readFileSync(envPath, "utf8");
const match = envText.match(/^PEXELS_API_KEY=(.+)$/m);
const apiKey = match?.[1]?.trim();
if (!apiKey) {
  console.error("PEXELS_API_KEY not set in .env.local.");
  process.exit(1);
}

const queries = process.argv.slice(2);
if (queries.length === 0) {
  console.error('Usage: node scripts/fetch-catalog-images.mjs "query one" "query two" ...');
  process.exit(1);
}

for (const query of queries) {
  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=3&orientation=landscape`;
  const res = await fetch(url, { headers: { Authorization: apiKey } });
  if (!res.ok) {
    console.error(`Query "${query}" failed: ${res.status}`);
    continue;
  }
  const body = await res.json();
  console.log(`\n# ${query}`);
  for (const photo of body.photos ?? []) {
    console.log(photo.src.large);
  }
}
