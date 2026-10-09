import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const dir = new URL("../n8n/workflows/", import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
const load = (f) => JSON.parse(readFileSync(new URL(f, dir), "utf8"));

test("the five expected workflow files are present and each parses", () => {
  const expected = [
    "01-order-placed",
    "02-payment-mock-confirmation",
    "03-restaurant-status-change",
    "04-delivery-partner-assignment",
    "05-delivery-status-propagation",
  ];
  for (const name of expected) assert.ok(files.includes(`${name}.json`), `missing ${name}.json`);
  assert.ok(files.length >= 5);
  for (const f of files) assert.ok(load(f).nodes.length > 0, f);
});

test("committed workflows only carry PLACEHOLDER_ credential ids", () => {
  for (const f of files) {
    for (const node of load(f).nodes) {
      for (const [type, cred] of Object.entries(node.credentials ?? {})) {
        assert.ok(
          String(cred.id).startsWith("PLACEHOLDER_"),
          `${f} / ${node.name} / ${type}: credential id "${cred.id}" is not a PLACEHOLDER_ value. Real n8n credential ids must never be committed.`
        );
      }
    }
  }
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

test("IF filters using .includes() compare a String(...) result to the string \"true\"", () => {
  let checked = 0;
  for (const f of files) {
    for (const node of load(f).nodes) {
      if (node.type !== "n8n-nodes-base.if") continue;
      for (const cond of node.parameters?.conditions?.string ?? []) {
        if (!String(cond.value1).includes(".includes(")) continue;
        checked++;
        assert.match(cond.value1, /^=\{\{String\(.+\)\}\}$/, `${f} / ${node.name}`);
        assert.equal(cond.value2, "true", `${f} / ${node.name} value2`);
      }
    }
  }
  assert.ok(checked >= 2);
});

test("status filters in workflows 03 and 05 list the intended statuses", () => {
  const arrayOf = (f, name) => {
    const node = load(f).nodes.find((n) => n.name === name);
    const m = node.parameters.conditions.string[0].value1.match(/\[([^\]]*)\]\.includes/);
    return m[1].split(",").map((s) => s.trim().replace(/^'|'$/g, ""));
  };
  const w5 = arrayOf("05-delivery-status-propagation.json", "Filter: status in (picked_up, delivered)");
  assert.ok(w5.includes("picked_up") && w5.includes("delivered"));
  const w3 = arrayOf("03-restaurant-status-change.json", "Filter: status in (accepted, preparing, ready)");
  for (const s of ["accepted", "preparing", "ready"]) assert.ok(w3.includes(s), s);
});

test("workflow 05: picked_up branch waits 20 s then calls the internal complete-delivery fallback", () => {
  const wf = load("05-delivery-status-propagation.json");
  const byName = Object.fromEntries(wf.nodes.map((n) => [n.name, n]));
  const isPicked = byName["Filter: status = picked_up"];
  const wait = byName["Wait 20 s (customer fallback)"];
  const post = byName["POST /api/internal/orders/:id/complete-delivery"];
  assert.ok(isPicked && wait && post);
  assert.equal(isPicked.parameters.conditions.string[0].value2, "picked_up");
  assert.equal(wait.type, "n8n-nodes-base.wait");
  assert.equal(wait.parameters.amount, 20);
  assert.equal(wait.parameters.unit, "seconds");
  assert.equal(post.parameters.method, "POST");
  assert.ok(post.parameters.url.includes("/complete-delivery"));
  assert.equal(post.parameters.options.response.response.neverError, true);
  assert.ok(post.parameters.url.includes("$env.APP_BASE_URL"));
  assert.ok(post.parameters.url.includes('$json["body"]["record"]["id"]'));
  assert.ok(post.parameters.url.endsWith("/complete-delivery"));
  assert.ok(JSON.stringify(post.parameters.headerParameters).includes("={{$env.N8N_INTERNAL_SECRET}}"));
  assert.ok(JSON.stringify(post.parameters.headerParameters).includes("X-Internal-Secret"));
  const fromNotify = wf.connections["Push Realtime Notification (placeholder)"].main[0].map((t) => t.node);
  assert.ok(fromNotify.includes("Filter: status = delivered"));
  assert.ok(fromNotify.includes(isPicked.name));
  assert.deepEqual(wf.connections[isPicked.name].main[0].map((t) => t.node), [wait.name]);
  assert.deepEqual(wf.connections[wait.name].main[0].map((t) => t.node), [post.name]);
});

test("workflow 11 registration events: webhook path, internal call, recipient check, live Gmail send", () => {
  const wf = load("11-registration-events.json");
  const byName = Object.fromEntries(wf.nodes.map((n) => [n.name, n]));
  const hook = Object.values(byName).find((n) => n.type === "n8n-nodes-base.webhook");
  assert.equal(hook.parameters.path, "foodhub/registration-event");
  const call = Object.values(byName).find((n) => n.type === "n8n-nodes-base.httpRequest");
  assert.match(call.parameters.url, /\/api\/internal\/registrations\//);
  assert.match(call.parameters.url, /=== \"pending\" \? \"submitted\"/);
  assert.ok(call.parameters.headerParameters.parameters.some((h) => h.name === "X-Internal-Secret"));
  const gate = byName["Has recipient"];
  assert.match(gate.parameters.conditions.string[0].value1, /^=\{\{String\(/);
  assert.deepEqual(wf.connections["Has recipient"].main[1], []);
  const gmail = Object.values(byName).find((n) => n.type === "n8n-nodes-base.gmail");
  assert.equal(gmail.parameters.emailType, "html");
  assert.equal(wf.active, false);
});
