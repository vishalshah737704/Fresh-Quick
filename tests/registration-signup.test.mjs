import test from "node:test";
import assert from "node:assert/strict";
import { runSignup } from "../lib/signup-pipeline.ts";
import { validateSignupPayload } from "../lib/signup-validation.ts";
import { normalizeIndianMobile } from "../lib/phone.ts";
import { buildSavedLabel } from "../lib/geocode-parse.ts";

const address = { line1: "12 Linking Rd", line2: "", city: "Mumbai", state: "Maharashtra", pincode: "400050" };
const body = { email: "Asha@B.co", password: "secret1", fullName: "Asha Rao", phone: "98200 12345", address };

function makeDeps(lookup, overrides = {}) {
  const calls = { created: [], reRegistered: [], profile: [], addr: [], deleted: [], geocoded: 0 };
  const deps = {
    validate: (b) => validateSignupPayload(b, normalizeIndianMobile),
    geocode: async () => { calls.geocoded += 1; return { kind: "found", lat: 19.06, lng: 72.83 }; },
    buildLabel: buildSavedLabel,
    messages: { notFound: "nf", unavailable: "un", alreadyPending: "PENDING", alreadyRegistered: "REGISTERED" },
    lookupByEmail: async () => lookup,
    reRegister: async (row) => { calls.reRegistered.push(row); return null; },
    createAuthUser: async (email) => { calls.created.push(email); return { id: "u1" }; },
    insertProfile: async (row) => { calls.profile.push(row); return null; },
    insertAddress: async (row) => { calls.addr.push(row); return null; },
    deleteAuthUser: async (id) => { calls.deleted.push(id); },
    ...overrides,
  };
  return { deps, calls };
}

test("new email: account created, outcome is pending, no login implied", async () => {
  const { deps, calls } = makeDeps({ kind: "none" });
  assert.deepEqual(await runSignup(body, deps), { status: 200, body: { ok: true, status: "pending" } });
  assert.equal(calls.created.length, 1);
  assert.equal(calls.reRegistered.length, 0);
});

test("the lookup receives the trimmed, lower-cased email", async () => {
  let seen;
  const { deps } = makeDeps({ kind: "none" }, { lookupByEmail: async (e) => { seen = e; return { kind: "none" }; } });
  await runSignup({ ...body, email: "  Asha@B.co " }, deps);
  assert.equal(seen, "asha@b.co");
});

test("pending customer: 409 already pending, nothing created", async () => {
  const { deps, calls } = makeDeps({ kind: "found", userId: "u9", role: "customer", approvalStatus: "pending" });
  assert.deepEqual(await runSignup(body, deps), { status: 409, body: { error: "PENDING" } });
  assert.equal(calls.created.length + calls.reRegistered.length, 0);
});

test("approved customer and any non-customer role: 409 already registered", async () => {
  for (const found of [
    { kind: "found", userId: "u9", role: "customer", approvalStatus: "approved" },
    { kind: "found", userId: "u9", role: "vendor", approvalStatus: "rejected" },
    { kind: "found", userId: "u9", role: "admin", approvalStatus: "pending" },
  ]) {
    const { deps, calls } = makeDeps(found);
    assert.deepEqual(await runSignup(body, deps), { status: 409, body: { error: "REGISTERED" } });
    assert.equal(calls.created.length + calls.reRegistered.length, 0);
  }
});

test("rejected customer re-registers: details replaced, outcome pending, no new auth user", async () => {
  const { deps, calls } = makeDeps({ kind: "found", userId: "u9", role: "customer", approvalStatus: "rejected" });
  assert.deepEqual(await runSignup(body, deps), { status: 200, body: { ok: true, status: "pending" } });
  assert.equal(calls.created.length, 0);
  assert.equal(calls.reRegistered.length, 1);
  const row = calls.reRegistered[0];
  assert.equal(row.userId, "u9");
  assert.equal(row.password, "secret1");
  assert.equal(row.phone, "+919820012345");
  assert.equal(row.lat, 19.06);
});

test("re-register failure is a 500 with the generic message", async () => {
  const { deps } = makeDeps({ kind: "found", userId: "u9", role: "customer", approvalStatus: "rejected" }, { reRegister: async () => "failed" });
  assert.deepEqual(await runSignup(body, deps), { status: 500, body: { error: "Failed to create account" } });
});

test("geocoding still runs before the duplicate checks, so a bad address never reaches a lookup", async () => {
  let looked = false;
  const { deps } = makeDeps({ kind: "none" }, { geocode: async () => ({ kind: "not_found" }), lookupByEmail: async () => { looked = true; return { kind: "none" }; } });
  assert.equal((await runSignup(body, deps)).status, 400);
  assert.equal(looked, false);
});
