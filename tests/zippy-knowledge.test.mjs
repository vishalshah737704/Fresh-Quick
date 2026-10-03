import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { buildChunks } from "../lib/zippy/chunking.ts";

const root = new URL("../knowledge/", import.meta.url);
const files = readdirSync(root, { recursive: true })
  .map((f) => String(f).replace(/\\/g, "/"))
  .filter((f) => f.endsWith(".md") && path.basename(f) !== "README.md")
  .sort();
const loaded = files.map((f) => ({ path: f, text: readFileSync(new URL(f, root), "utf8") }));

test("every knowledge file has valid front matter and builds chunks", () => {
  assert.ok(files.length > 0);
  const chunks = buildChunks(loaded);
  assert.ok(chunks.length >= files.length);
  assert.ok(chunks.every((c) => c.content.length <= 1800));
  assert.equal(new Set(chunks.map((c) => c.chunkKey)).size, chunks.length);
});

test("knowledge never contains secrets or internal developer material", () => {
  const forbidden = [
    /SUPABASE_SERVICE_ROLE/i,
    /N8N_INTERNAL_SECRET/i,
    /ANTHROPIC_API_KEY|OPENAI_API_KEY/i,
    /\bsk-[A-Za-z0-9]{10,}/,
    /eyJ[A-Za-z0-9_-]{20,}/,
    /CLAUDE\.md|MEMORY\.md|HANDOFF_|KICKOFF_/,
    /host\.docker\.internal|127\.0\.0\.1|localhost/i,
    /@foodhub\.local/i,
  ];
  for (const file of loaded) {
    for (const re of forbidden) {
      assert.doesNotMatch(file.text, re, `${file.path} matches ${re}`);
    }
  }
});
