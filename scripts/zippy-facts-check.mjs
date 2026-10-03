// Live facts check: ground truth comes from Zippy's own tool route, then Zippy is asked in chat.
// Needs N8N_INTERNAL_SECRET in the shell (never read from files). Base URL: ZIPPY_BASE_URL.
// Exit codes: 0 all pass, 1 any fail or HTTP error, 2 secret missing.
// Limits: the price check is a literal substring match on the reply (so "₹150" would also match "₹1500");
// the open check only looks for the word "open" / "closed" (a reply mentioning both can pass either way).
// Replies are LLM text, so treat a single FAIL as a prompt to read the reply, not as proof of a bug.

const base = process.env.ZIPPY_BASE_URL ?? "http://localhost:3000";
const secret = process.env.N8N_INTERNAL_SECRET;
if (!secret) {
  console.error("Set N8N_INTERNAL_SECRET in your shell (the script never reads .env files).");
  process.exit(2);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

async function post(path, body, headers) {
  let res;
  try {
    res = await fetch(`${base}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
  } catch (err) {
    fail(`Request failed: ${err.cause?.code ?? err.message}`);
  }
  if (!res.ok) fail(`HTTP ${res.status} from ${path}`);
  return res.json();
}

async function tool(name, input) {
  const { content, isError } = await post("/api/internal/zippy/tool", { name, input }, { "x-internal-secret": secret });
  if (isError) fail(`Tool ${name} returned an error: ${content}`);
  return JSON.parse(content);
}

async function ask(message) {
  const { reply } = await post("/api/zippy/chat", { message, stream: false }, {});
  return String(reply ?? "");
}

const { stores = [] } = await tool("find_stores", { sort: "rating", limit: 3 });
if (stores.length === 0) fail("find_stores returned no stores; cannot build ground truth.");

const checkedStores = stores.slice(0, 3);
const dishSamples = [];
for (const store of checkedStores) {
  const menu = await tool("get_store_menu", { store_id: store.id, limit: 3 });
  if (menu.error) fail(`get_store_menu failed for ${store.name}: ${menu.error}`);
  for (const item of menu.items ?? []) {
    dishSamples.push({ store: store.name, dish: item.name, price: item.price, available: item.available });
  }
}

let passed = 0;
let total = 0;
function report(ok, question, reply) {
  total++;
  if (ok) passed++;
  const snippet = reply.replace(/\s+/g, " ").slice(0, 140);
  console.log(`${ok ? "PASS" : "FAIL"} | ${question} | ${snippet}`);
}

for (const s of dishSamples.slice(0, 3)) {
  const question = `What is the price of ${s.dish} at ${s.store}?`;
  const reply = await ask(question);
  report(reply.includes(s.price), question, reply);
}

for (const store of checkedStores) {
  const question = `Is ${store.name} open right now?`;
  const reply = (await ask(question)).toLowerCase();
  const word = store.open ? "open" : "closed";
  report(reply.includes(word), question, reply);
}

console.log(`facts: ${passed}/${total}`);
process.exit(total > 0 && passed === total ? 0 : 1);
