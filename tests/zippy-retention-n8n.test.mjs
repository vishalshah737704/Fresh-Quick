import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const wf = JSON.parse(
  readFileSync(new URL("../n8n/workflows/08-zippy-chat-retention.json", import.meta.url), "utf8")
);
const byName = (name) => wf.nodes.find((n) => n.name === name);
const webhookCall = byName("POST purge (webhook, dry run by default)");
const scheduleCall = byName("POST purge (nightly, deletes)");

test("workflow 08 has a zippy-purge webhook and a 03:45 schedule trigger", () => {
  const hook = wf.nodes.find((n) => n.type === "n8n-nodes-base.webhook");
  assert.equal(hook.parameters.path, "foodhub/zippy-purge");
  assert.equal(hook.parameters.httpMethod, "POST");
  const schedule = wf.nodes.find((n) => n.type === "n8n-nodes-base.scheduleTrigger");
  assert.equal(schedule.parameters.rule.interval[0].expression, "45 3 * * *");
  assert.equal(wf.active, false);
});

test("workflow 08 calls the purge route with the internal secret from the environment", () => {
  const http = wf.nodes.filter((n) => n.type === "n8n-nodes-base.httpRequest");
  assert.equal(http.length, 2);
  for (const node of http) {
    assert.equal(node.parameters.method, "POST");
    assert.match(node.parameters.url, /^=\{\{\$env\.APP_BASE_URL\}\}\/api\/internal\/zippy\/purge$/);
    const header = node.parameters.headerParameters.parameters.find((p) => p.name.toLowerCase() === "x-internal-secret");
    assert.equal(header.value, "={{$env.N8N_INTERNAL_SECRET}}");
  }
});

test("the webhook branch is a dry run unless asked, the schedule branch deletes", () => {
  assert.match(webhookCall.parameters.jsonBody, /dryRun === false \? false : true/);
  assert.deepEqual(JSON.parse(scheduleCall.parameters.jsonBody), { dryRun: false });
  const wired = (trigger) => wf.connections[trigger].main.flat().map((t) => t.node);
  assert.deepEqual(wired("Purge dry run (webhook)"), [webhookCall.name]);
  assert.deepEqual(wired("Nightly at 03:45"), [scheduleCall.name]);
});

test("workflow 08 holds no credentials or real tokens", () => {
  assert.doesNotMatch(JSON.stringify(wf), /eyJ[A-Za-z0-9_-]{20,}/);
  assert.equal(wf.nodes.some((n) => n.credentials), false);
});
