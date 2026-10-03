import { readFileSync } from "node:fs";

const base = process.env.ZIPPY_BASE_URL ?? "http://localhost:3000";
const secret = process.env.N8N_INTERNAL_SECRET;
const MIN = Number(process.env.ZIPPY_MIN_SIMILARITY ?? "0.3");
if (!secret) {
  console.error("Set N8N_INTERNAL_SECRET in your shell (the script never reads .env files).");
  process.exit(2);
}
const cases = JSON.parse(readFileSync(new URL("../tests/fixtures/zippy-eval.json", import.meta.url), "utf8"));

let hits = 0;
const misses = [];
for (const c of cases) {
  const res = await fetch(`${base}/api/internal/zippy/search`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-internal-secret": secret },
    body: JSON.stringify({ question: c.question, role: c.role }),
  });
  if (!res.ok) {
    console.error(`HTTP ${res.status} for: ${c.question}`);
    process.exit(1);
  }
  const { matches } = await res.json();
  const usable = matches.filter((m) => m.similarity >= MIN).slice(0, 3);
  let ok;
  if (c.expectTitleExcludes) {
    ok = !usable.some((m) => m.title.includes(c.expectTitleExcludes));
  } else if (c.expectTitleIncludes === null) {
    ok = usable.length === 0;
  } else {
    ok = usable.some((m) => m.title.includes(c.expectTitleIncludes));
  }
  if (ok) hits++;
  else misses.push({ question: c.question, expected: c.expectTitleIncludes, excluded: c.expectTitleExcludes, got: matches.slice(0, 3).map((m) => `${m.title} (${m.similarity.toFixed(2)})`) });
}
console.log(`hit rate: ${hits}/${cases.length}`);
for (const m of misses) console.log(JSON.stringify(m));
process.exit(hits / cases.length >= 0.9 ? 0 : 1);
