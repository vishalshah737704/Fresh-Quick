import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const wf = JSON.parse(readFileSync(new URL("../n8n/workflows/09-auto-order-flow.json", import.meta.url), "utf8"));
const byName = (name) => wf.nodes.find((n) => n.name === name);

test("workflow 09 has the step and sweep webhooks", () => {
  const paths = wf.nodes.filter((n) => n.type === "n8n-nodes-base.webhook").map((n) => n.parameters.path).sort();
  assert.deepEqual(paths, ["foodhub/auto-order-step", "foodhub/auto-order-sweep"]);
});

test("the step branch waits 2 seconds (3 s observed with webhook delay) before calling auto-step", () => {
  const wait = byName("Wait 2 s");
  assert.equal(wait.parameters.amount, 2);
  assert.equal(wait.parameters.unit, "seconds");
  assert.ok(wf.connections["Wait 2 s"].main[0].some((c) => c.node === "POST auto-step (after 3 s)"));
});

test("the step filter accepts payment success or accepted/preparing/assigned, wrapped in String()", () => {
  const cond = byName("Filter: payment success or status accepted/preparing/assigned").parameters.conditions.string[0].value1;
  assert.match(cond, /String\(/);
  for (const s of ["success", "accepted", "preparing", "assigned", "payments"]) assert.ok(cond.includes(s), s);
  assert.ok(!cond.includes("'ready'") && !cond.includes("picked_up"));
});

test("both auto-step calls send the internal secret and expectedStatus", () => {
  for (const name of ["POST auto-step (after 3 s)", "POST auto-step (sweep)"]) {
    const node = byName(name);
    assert.match(node.parameters.url, /\$env\.APP_BASE_URL/);
    assert.match(node.parameters.url, /auto-step/);
    const headers = JSON.stringify(node.parameters.headerParameters);
    assert.match(headers, /X-Internal-Secret/);
    assert.match(headers, /\$env\.N8N_INTERNAL_SECRET/);
    assert.match(JSON.stringify(node.parameters.bodyParameters), /expectedStatus/);
  }
});

test("the sweep reads the open list and splits it per order with no wait", () => {
  assert.match(byName("GET open orders").parameters.url, /auto-order\/open/);
  assert.equal(byName("Split orders").parameters.fieldToSplitOut, "orders");
  assert.deepEqual(wf.connections["Split orders"].main[0].map((c) => c.node), ["POST auto-step (sweep)"]);
});
