import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const dir = new URL("../n8n/workflows/", import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
const load = (f) => JSON.parse(readFileSync(new URL(f, dir), "utf8"));

test("there are five workflow files and each parses", () => {
  assert.equal(files.length, 5);
  for (const f of files) assert.ok(load(f).nodes.length > 0, f);
});

test("every connection source and target is a real node name", () => {
  for (const f of files) {
    const wf = load(f);
    const names = new Set(wf.nodes.map((n) => n.name));
    for (const [src, conn] of Object.entries(wf.connections)) {
      assert.ok(names.has(src), `${f}: source ${src}`);
      for (const branch of conn.main) for (const t of branch) assert.ok(names.has(t.node), `${f}: target ${t.node}`);
    }
  }
});

test("node ids and names are unique within each workflow", () => {
  for (const f of files) {
    const wf = load(f);
    assert.equal(new Set(wf.nodes.map((n) => n.id)).size, wf.nodes.length, `${f} ids`);
    assert.equal(new Set(wf.nodes.map((n) => n.name)).size, wf.nodes.length, `${f} names`);
  }
});

test("workflow 05: delivered branch fetches details then sends an HTML Gmail", () => {
  const wf = load("05-delivery-status-propagation.json");
  const byName = Object.fromEntries(wf.nodes.map((n) => [n.name, n]));
  const gmail = byName["Gmail: Send Order Delivered Email"];
  const get = byName["GET /api/internal/orders/:id/notification-details"];
  assert.ok(gmail && get);
  assert.equal(gmail.type, "n8n-nodes-base.gmail");
  assert.equal(gmail.parameters.emailType, "html");
  assert.equal(gmail.parameters.message, '={{$json["deliveredEmailHtml"]}}');
  assert.equal(gmail.parameters.subject, '={{$json["emailSubject"]}}');
  assert.equal(gmail.parameters.sendTo, '={{$json["customerEmail"]}}');
  const deliveredTargets = wf.connections["Filter: status = delivered"].main[0].map((t) => t.node);
  assert.ok(deliveredTargets.includes(get.name));
  assert.ok(deliveredTargets.includes("Finalize Payment + Prompt Review (placeholder)"));
  assert.deepEqual(wf.connections[get.name].main[0].map((t) => t.node), [gmail.name]);
  assert.ok(get.parameters.url.includes("/notification-details"));
  assert.ok(!JSON.stringify(wf).match(/[A-Za-z0-9_-]{32,}\.[A-Za-z0-9_-]{10,}/)); // no token-looking strings
});

test("workflow 03 accepted email still sends to customerEmail", () => {
  const wf = load("03-restaurant-status-change.json");
  const gmail = wf.nodes.find((n) => n.name === "Gmail: Send Order Accepted Email");
  assert.equal(gmail.parameters.sendTo, '={{$json["customerEmail"]}}');
});
