// Live-check fixtures for C1. `create` makes a throwaway customer (GoTrue admin API), reuses an existing
// store, its owner and an existing delivery partner, and inserts two DELIVERED orders by SQL with triggers
// off (no webhook, no email). `cleanup` removes exactly what `create` made (state in .superpowers/sdd/c1-fixtures.json).
// Never touches other customers or orders. Local stack only.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";

const STATE = ".superpowers/sdd/c1-fixtures.json";
const DB = "supabase_db_phase1-scaffold-db";
const API = "http://127.0.0.1:54321";

const sh = (cmd, args, input) =>
  execFileSync(cmd, args, { encoding: "utf8", input, shell: process.platform === "win32" && cmd === "npx" });
const psql = (sql) =>
  sh("docker", ["exec", "-i", DB, "psql", "-U", "postgres", "-At", "-v", "ON_ERROR_STOP=1"], sql).trim();

function serviceKey() {
  const out = sh("npx", ["supabase", "status", "-o", "env"]);
  const match = out.match(/^SERVICE_ROLE_KEY="?([^"\r\n]+)"?/m);
  if (!match) throw new Error("SERVICE_ROLE_KEY not found in supabase status");
  return match[1];
}

async function create() {
  if (existsSync(STATE)) throw new Error(`${STATE} exists; run cleanup first`);
  const key = serviceKey();
  const email = `c1-test-${Date.now()}@example.invalid`;
  const password = `C1test-${Math.random().toString(36).slice(2)}A1`;
  const res = await fetch(`${API}/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  const created = await res.json();
  if (!res.ok) throw new Error(`create user failed: ${JSON.stringify(created)}`);
  const customerId = created.id;

  // One store that has at least two products, its owner, and any existing delivery partner.
  const row = psql(`
    select s.id || '|' || s.owner_id || '|' || (select user_id from public.delivery_partners limit 1) || '|' ||
           (select string_agg(id::text, ',') from (select id from public.products where store_id = s.id and is_available order by id limit 2) p)
    from public.stores s
    where (select count(*) from public.products where store_id = s.id and is_available) >= 2
    order by s.id limit 1;`);
  const [storeId, ownerId, partnerId, productCsv] = row.split("|");
  const productIds = productCsv.split(",");

  const orderIds = [crypto.randomUUID(), crypto.randomUUID()];
  const addressId = crypto.randomUUID();
  psql(`
    begin;
    set local session_replication_role = replica;
    insert into public.users (id, role, full_name) values ('${customerId}', 'customer', 'C1 Tester');
    insert into public.addresses (id, user_id, line1, lat, lng) values ('${addressId}', '${customerId}', 'C1 test street', 19.07, 72.87);
    ${orderIds
      .map(
        (id) => `insert into public.orders (id, customer_id, store_id, delivery_partner_id, delivery_address_id, status, subtotal, total, recipient_name, recipient_email, recipient_phone, delivered_at)
      values ('${id}', '${customerId}', '${storeId}', '${partnerId}', '${addressId}', 'delivered', 200, 200, 'C1 Tester', 'c1@example.invalid', '9999999999', now() - interval '2 hours');
    ${productIds
      .map((p) => `insert into public.order_items (order_id, product_id, quantity, unit_price) values ('${id}', '${p}', 1, 100);`)
      .join("\n    ")}`
      )
      .join("\n    ")}
    commit;`);

  const state = {
    customer: { id: customerId, email, password },
    partner: { id: partnerId },
    store: { id: storeId, ownerId },
    orders: orderIds.map((id) => ({ id, productIds })),
    addressId,
  };
  mkdirSync(".superpowers/sdd", { recursive: true });
  writeFileSync(STATE, JSON.stringify(state, null, 2));
  console.log(JSON.stringify({ ...state, customer: { id: customerId, email, password } }, null, 2));
}

async function cleanup() {
  if (!existsSync(STATE)) {
    console.log("nothing to clean");
    return;
  }
  const state = JSON.parse(readFileSync(STATE, "utf8"));
  const key = serviceKey();
  const ids = state.orders.map((o) => `'${o.id}'`).join(",");
  // review photos first (the bucket objects are not covered by cascades)
  const photos = psql(`select photo_path from public.reviews where order_id in (${ids}) and photo_path is not null;`)
    .split("\n").filter(Boolean);
  for (const path of photos) {
    await fetch(`${API}/storage/v1/object/review-photos/${path}`, {
      method: "DELETE",
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
  }
  psql(`
    begin;
    delete from public.orders where id in (${ids});
    delete from public.addresses where id = '${state.addressId}';
    commit;`);
  await fetch(`${API}/auth/v1/admin/users/${state.customer.id}`, {
    method: "DELETE",
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  // aggregates of the store/products/partner are recomputed from what remains
  psql(`
    update public.stores s set rating_sum = coalesce((select sum(rating) from public.reviews r where r.store_id = s.id and r.status = 'visible'), 0),
      rating_count = (select count(*) from public.reviews r where r.store_id = s.id and r.status = 'visible') where s.id = '${state.store.id}';
    update public.stores set rating = case when rating_count > 0 then round(rating_sum::numeric / rating_count, 1) else coalesce(seed_rating, 0) end where id = '${state.store.id}';
    update public.products p set rating_sum = coalesce((select sum(stars) from public.review_dishes rd join public.reviews r on r.id = rd.review_id where rd.product_id = p.id and r.status = 'visible'), 0),
      rating_count = (select count(*) from public.review_dishes rd join public.reviews r on r.id = rd.review_id where rd.product_id = p.id and r.status = 'visible')
      where p.store_id = '${state.store.id}';
    update public.delivery_partners dp set rating_sum = coalesce((select sum(stars) from public.review_partner rp join public.reviews r on r.id = rp.review_id where rp.partner_id = dp.user_id and r.status = 'visible'), 0),
      rating_count = (select count(*) from public.review_partner rp join public.reviews r on r.id = rp.review_id where rp.partner_id = dp.user_id and r.status = 'visible')
      where dp.user_id = '${state.partner.id}';`);
  rmSync(STATE);
  console.log("cleaned");
}

const command = process.argv[2];
if (command === "create") await create();
else if (command === "cleanup") await cleanup();
else {
  console.error("usage: node scripts/c1-fixtures.mjs create|cleanup");
  process.exitCode = 1;
}
