import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const wf = JSON.parse(
  readFileSync(new URL("../n8n/workflows/07-zippy-catalog-sync.json", import.meta.url), "utf8")
);

test("workflow 07 has a webhook trigger, a 03:15 schedule trigger and one catalog-sync call", () => {
  const types = wf.nodes.map((n) => n.type);
  assert.ok(types.includes("n8n-nodes-base.webhook"));
  assert.ok(types.includes("n8n-nodes-base.scheduleTrigger"));
  const hook = wf.nodes.find((n) => n.type === "n8n-nodes-base.webhook");
  assert.equal(hook.parameters.path, "foodhub/zippy-catalog-sync");
  const schedule = wf.nodes.find((n) => n.type === "n8n-nodes-base.scheduleTrigger");
  assert.equal(schedule.parameters.rule.interval[0].expression, "15 3 * * *");
  const http = wf.nodes.filter((n) => n.type === "n8n-nodes-base.httpRequest");
  assert.equal(http.length, 1);
  assert.match(http[0].parameters.url, /\/api\/internal\/zippy\/catalog-sync$/);
  assert.equal(http[0].parameters.method, "POST");
  const names = http[0].parameters.headerParameters.parameters.map((p) => p.name.toLowerCase());
  assert.ok(names.includes("x-internal-secret"));
});

test("workflow 07 wires both triggers into the call and holds no real secrets or credential ids", () => {
  const http = wf.nodes.find((n) => n.type === "n8n-nodes-base.httpRequest");
  const sources = Object.entries(wf.connections)
    .filter(([, c]) => c.main.flat().some((t) => t.node === http.name))
    .map(([src]) => src);
  assert.equal(sources.length, 2);
  assert.doesNotMatch(JSON.stringify(wf), /eyJ[A-Za-z0-9_-]{20,}/);
  assert.match(JSON.stringify(wf), /\$env\.N8N_INTERNAL_SECRET/);
  assert.equal(wf.nodes.some((n) => n.credentials), false);
});
