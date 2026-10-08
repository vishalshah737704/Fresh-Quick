import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const wf = JSON.parse(readFileSync(new URL("../n8n/workflows/05-delivery-status-propagation.json", import.meta.url), "utf8"));
const byName = Object.fromEntries(wf.nodes.map((n) => [n.name, n]));
const targets = (name) => (wf.connections[name]?.main ?? []).flat().map((t) => t.node);

test("workflow 05 gains Wait 1 h, an eligibility call, an IF and a Gmail send", () => {
  const wait = byName["Wait 1 h (review request)"];
  const get = byName["GET /api/internal/orders/:id/review-eligibility"];
  const gate = byName["IF: review request eligible"];
  const gmail = byName["Gmail: Send Review Request"];
  assert.ok(wait && get && gate && gmail, "a review request node is missing");
  assert.equal(wait.type, "n8n-nodes-base.wait");
  assert.equal(wait.parameters.amount, 1);
  assert.equal(wait.parameters.unit, "hours");
  assert.match(get.parameters.url, /\/api\/internal\/orders\/.*review-eligibility/);
  assert.ok(JSON.stringify(get.parameters.headerParameters).includes("X-Internal-Secret"));
  assert.equal(gmail.type, "n8n-nodes-base.gmail");
  assert.equal(gmail.parameters.emailType, "html");
  assert.ok(String(gmail.credentials.gmailOAuth2.id).startsWith("PLACEHOLDER_"), "real credential id committed");
});

test("the IF wraps its value in String() (n8n 2.40.7) and checks for true", () => {
  const gate = byName["IF: review request eligible"];
  const cond = gate.parameters.conditions.string[0];
  assert.match(cond.value1, /String\(/);
  assert.equal(cond.value2, "true");
});

test("the delivered branch starts the review chain without touching the delivered email path", () => {
  assert.ok(targets("Filter: status = delivered").includes("Wait 1 h (review request)"));
  assert.ok(targets("Filter: status = delivered").includes("GET /api/internal/orders/:id/notification-details"));
  assert.deepEqual(targets("Wait 1 h (review request)"), ["GET /api/internal/orders/:id/review-eligibility"]);
  assert.deepEqual(targets("GET /api/internal/orders/:id/review-eligibility"), ["IF: review request eligible"]);
  assert.deepEqual(wf.connections["IF: review request eligible"].main[0].map((t) => t.node), ["Gmail: Send Review Request"]);
  assert.deepEqual(wf.connections["IF: review request eligible"].main[1] ?? [], [], "false branch must end");
});

test("the Gmail node sends to customerEmail with the built subject and html", () => {
  const gmail = byName["Gmail: Send Review Request"];
  assert.match(gmail.parameters.sendTo, /customerEmail/);
  assert.match(gmail.parameters.subject, /emailSubject/);
  assert.match(gmail.parameters.message, /reviewRequestHtml/);
});
