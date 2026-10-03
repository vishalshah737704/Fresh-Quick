import { readFileSync } from "node:fs";
import { caseOk } from "./zippy-eval-match.mjs";

const base = process.env.ZIPPY_BASE_URL ?? "http://localhost:3000";
const secret = process.env.N8N_INTERNAL_SECRET;
// Keep in sync with MIN_SIMILARITY in lib/zippy/prompt.ts (or override via env).
const MIN = Number(process.env.ZIPPY_MIN_SIMILARITY ?? "0.3");
if (!secret) {
  console.error("Set N8N_INTERNAL_SECRET in your shell (the script never reads .env files).");
  process.exit(2);
}
const fixturePath = process.env.ZIPPY_EVAL_FIXTURE ?? new URL("../tests/fixtures/zippy-eval.json", import.meta.url);
const cases = JSON.parse(readFileSync(fixturePath, "utf8"));

let hits = 0;
const misses = [];
for (const c of cases) {
  let res;
  try {
    res = await fetch(`${base}/api/internal/zippy/search`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-internal-secret": secret },
    body: JSON.stringify({ question: c.question, role: c.role }),
    });
  } catch (err) {
    console.error(`Request failed: ${err.cause?.code ?? err.message}`);
    process.exit(1);
  }
  if (!res.ok) {
    console.error(`HTTP ${res.status} for: ${c.question}`);
    process.exit(1);
  }
  const { matches, catalog = [] } = await res.json();
  const ok = caseOk(c, matches, catalog, MIN);
  if (ok) hits++;
  else misses.push({ question: c.question, expected: c.expectTitleIncludes ?? c.expectCatalogIncludes, excluded: c.expectTitleExcludes, got: c.expectCatalogIncludes ? catalog.slice(0, 5).map((h) => `${String(h.content).slice(0, 60)} (${h.similarity.toFixed(2)})`) : matches.slice(0, 3).map((m) => `${m.title} (${m.similarity.toFixed(2)})`) });
}
console.log(`hit rate: ${hits}/${cases.length}`);
for (const m of misses) console.log(JSON.stringify(m));
// exitCode (not process.exit) lets open keep-alive sockets close; a hard exit crashes Node on Windows.
process.exitCode = hits / cases.length >= 0.9 ? 0 : 1;
