import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const wf = JSON.parse(
  readFileSync(new URL("../n8n/workflows/06-zippy-knowledge-ingestion.json", import.meta.url), "utf8")
);

test("workflow 06 has a webhook trigger, a schedule trigger and one ingest call", () => {
  const types = wf.nodes.map((n) => n.type);
  assert.ok(types.includes("n8n-nodes-base.webhook"));
  assert.ok(types.includes("n8n-nodes-base.scheduleTrigger"));
  const http = wf.nodes.filter((n) => n.type === "n8n-nodes-base.httpRequest");
  assert.equal(http.length, 1);
  assert.match(http[0].parameters.url, /\/api\/internal\/zippy\/ingest$/);
  assert.equal(http[0].parameters.method, "POST");
  const headerNames = http[0].parameters.headerParameters.parameters.map((p) => p.name.toLowerCase());
  assert.ok(headerNames.includes("x-internal-secret"));
});

test("workflow 06 wires both triggers into the ingest call and holds no real secrets", () => {
  const http = wf.nodes.find((n) => n.type === "n8n-nodes-base.httpRequest");
  const sources = Object.entries(wf.connections)
    .filter(([, c]) => c.main.flat().some((t) => t.node === http.name))
    .map(([src]) => src);
  assert.equal(sources.length, 2);
  assert.doesNotMatch(JSON.stringify(wf), /eyJ[A-Za-z0-9_-]{20,}/);
  assert.match(JSON.stringify(wf), /\$env\.N8N_INTERNAL_SECRET/);
});
