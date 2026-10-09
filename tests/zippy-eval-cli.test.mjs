import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const SECRET = "dummy-test-secret";
const evalScript = fileURLToPath(new URL("../scripts/zippy-eval.mjs", import.meta.url));
const factsScript = fileURLToPath(new URL("../scripts/zippy-facts-check.mjs", import.meta.url));

async function withStub(handler, fn) {
  const seen = [];
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", () => {
      const parsed = body ? JSON.parse(body) : {};
      seen.push({ url: req.url, secret: req.headers["x-internal-secret"], authorization: req.headers["authorization"], body: parsed });
      const out = handler(req.url, parsed);
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(out));
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  try {
    return await fn(`http://127.0.0.1:${server.address().port}`, seen);
  } finally {
    server.closeAllConnections?.();
    await new Promise((r) => server.close(r));
  }
}

function run(script, env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script], { env: { PATH: process.env.PATH, ...env } });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

function writeFixture(cases) {
  const file = join(mkdtempSync(join(tmpdir(), "zippy-eval-")), "fixture.json");
  writeFileSync(file, JSON.stringify(cases));
  return file;
}

const cases = [
  { question: "k", role: "customer", expectTitleIncludes: "Pay" },
  { question: "c", role: "customer", expectCatalogIncludes: "Bella Italia" },
  { question: "n", role: "customer", expectTitleIncludes: null },
  { question: "x", role: "customer", expectTitleExcludes: "Secret" },
];

const evalHandler = (catalogContent) => (url, body) => {
  assert.equal(url, "/api/internal/zippy/search");
  if (body.question === "k") return { matches: [{ title: "How to Pay", similarity: 0.9 }], catalog: [] };
  if (body.question === "c") return { matches: [], catalog: [{ kind: "store", ref_id: "1", content: catalogContent, similarity: 0.8 }] };
  if (body.question === "n") return { matches: [{ title: "Weak", similarity: 0.1 }], catalog: [] };
  return { matches: [{ title: "Other", similarity: 0.9 }] };
};

test("eval CLI passes 4/4 and sends the secret header only to the server", async () => {
  await withStub(evalHandler("Bella Italia pizza"), async (base, seen) => {
    const r = await run(evalScript, { N8N_INTERNAL_SECRET: SECRET, ZIPPY_BASE_URL: base, ZIPPY_EVAL_FIXTURE: writeFixture(cases) });
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /hit rate: 4\/4/);
    assert.equal(seen.length, 4);
    assert.ok(seen.every((s) => s.secret === SECRET));
    assert.ok(!(r.stdout + r.stderr).includes(SECRET));
  });
});

test("eval CLI exits 1 and prints the miss when the hit rate is below 90%", async () => {
  await withStub(evalHandler("nothing relevant"), async (base) => {
    const r = await run(evalScript, { N8N_INTERNAL_SECRET: SECRET, ZIPPY_BASE_URL: base, ZIPPY_EVAL_FIXTURE: writeFixture(cases) });
    assert.equal(r.code, 1);
    assert.match(r.stdout, /hit rate: 3\/4/);
    assert.match(r.stdout, /"expected":"Bella Italia"/);
  });
});

test("eval CLI exits 2 without the secret", async () => {
  const r = await run(evalScript, {});
  assert.equal(r.code, 2);
});

const factsHandler = (reply) => (url, body) => {
  if (url === "/api/internal/zippy/tool") {
    if (body.name === "find_stores") {
      return { isError: false, content: JSON.stringify({ stores: [{ id: "s1", name: "Dosa Corner", open: true }] }) };
    }
    return { isError: false, content: JSON.stringify({ items: [{ name: "Cheese Dosa", price: "₹150", price_paise: 15000, available: true }] }) };
  }
  assert.equal(url, "/api/zippy/chat");
  return { reply: body.message.startsWith("What is the price") ? reply : "Yes, Dosa Corner is open right now" };
};

const FACTS_TOKEN = "dummy-test-user-token";

test("facts CLI passes when replies match the tool data and sends the user token to chat", async () => {
  await withStub(factsHandler("Cheese Dosa is ₹150 at Dosa Corner"), async (base, seen) => {
    const r = await run(factsScript, { N8N_INTERNAL_SECRET: SECRET, ZIPPY_FACTS_TOKEN: FACTS_TOKEN, ZIPPY_BASE_URL: base });
    assert.equal(r.code, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /facts: 2\/2/);
    assert.ok(seen.filter((s) => s.url.includes("/tool")).every((s) => s.secret === SECRET));
    const chats = seen.filter((s) => s.url === "/api/zippy/chat");
    assert.equal(chats.length, 2);
    assert.ok(chats.every((s) => s.authorization === `Bearer ${FACTS_TOKEN}`));
    assert.ok(!(r.stdout + r.stderr).includes(SECRET));
    assert.ok(!(r.stdout + r.stderr).includes(FACTS_TOKEN));
  });
});

test("facts CLI exits 2 without the user token and sends no request", async () => {
  await withStub(factsHandler("unused"), async (base, seen) => {
    const r = await run(factsScript, { N8N_INTERNAL_SECRET: SECRET, ZIPPY_BASE_URL: base });
    assert.equal(r.code, 2);
    assert.match(r.stderr, /Set ZIPPY_FACTS_TOKEN to a signed-in user's access token/);
    assert.equal(seen.length, 0);
  });
});

test("facts CLI exits 1 on a wrong price", async () => {
  await withStub(factsHandler("Cheese Dosa is ₹99 at Dosa Corner"), async (base) => {
    const r = await run(factsScript, { N8N_INTERNAL_SECRET: SECRET, ZIPPY_FACTS_TOKEN: FACTS_TOKEN, ZIPPY_BASE_URL: base });
    assert.equal(r.code, 1);
    assert.match(r.stdout, /FAIL/);
    assert.match(r.stdout, /facts: 1\/2/);
  });
});

test("facts CLI exits 2 without the secret", async () => {
  const r = await run(factsScript, {});
  assert.equal(r.code, 2);
});
