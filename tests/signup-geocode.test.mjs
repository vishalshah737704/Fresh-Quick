import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateSignupAddress,
  validateSignupPayload,
} from "../lib/signup-validation.ts";
import {
  parseGeocodeResponse,
  geocodeWith,
  buildGeocodeQuery,
  buildSavedLabel,
  GEOCODE_NOT_FOUND_MESSAGE,
  GEOCODE_UNAVAILABLE_MESSAGE,
} from "../lib/geocode-parse.ts";
import { runSignup } from "../lib/signup-pipeline.ts";
import { normalizeIndianMobile } from "../lib/phone.ts";

const address = { line1: "12 Linking Rd", line2: "Bandra West", city: "Mumbai", state: "Maharashtra", pincode: "400050" };
const goodBody = {
  email: "a@b.co",
  password: "secret1",
  fullName: "Asha Rao",
  phone: "98200 12345",
  address,
};
const okResponse = {
  status: "OK",
  results: [
    {
      address_components: [{ types: ["country", "political"], short_name: "IN" }],
      geometry: { location: { lat: 19.06, lng: 72.83 } },
    },
  ],
};

test("validateSignupAddress accepts a full address and trims", () => {
  const r = validateSignupAddress({ ...address, line1: "  12 Linking Rd " });
  assert.equal(r.ok, true);
  assert.equal(r.value.line1, "12 Linking Rd");
});

test("validateSignupAddress: line2 optional, required fields, pincode digits", () => {
  assert.equal(validateSignupAddress({ ...address, line2: undefined }).ok, true);
  for (const field of ["line1", "city", "state", "pincode"]) {
    assert.equal(validateSignupAddress({ ...address, [field]: "  " }).ok, false, field);
  }
  assert.equal(validateSignupAddress({ ...address, pincode: "4000" }).error, "Pincode must be 6 digits");
  assert.equal(validateSignupAddress({ ...address, pincode: "40005a" }).ok, false);
  assert.equal(validateSignupAddress(null).ok, false);
  assert.equal(validateSignupAddress({ ...address, line1: "x".repeat(201) }).ok, false);
});

test("validateSignupPayload normalizes phone and keeps the 6-char password rule", () => {
  const r = validateSignupPayload(goodBody, normalizeIndianMobile);
  assert.equal(r.ok, true);
  assert.equal(r.value.phone, "+919820012345");
  assert.equal(validateSignupPayload({ ...goodBody, password: "12345" }, normalizeIndianMobile).ok, false);
  assert.equal(
    validateSignupPayload({ ...goodBody, phone: "12345" }, normalizeIndianMobile).error,
    "Enter a valid 10-digit Indian mobile number"
  );
  assert.equal(validateSignupPayload({ ...goodBody, phone: undefined }, normalizeIndianMobile).ok, false);
  assert.equal(validateSignupPayload({ ...goodBody, address: undefined }, normalizeIndianMobile).ok, false);
});

test("parseGeocodeResponse", () => {
  assert.deepEqual(parseGeocodeResponse(okResponse), { kind: "found", lat: 19.06, lng: 72.83 });
  assert.equal(parseGeocodeResponse({ status: "ZERO_RESULTS", results: [] }).kind, "not_found");
  assert.equal(parseGeocodeResponse({ status: "OK", results: [] }).kind, "not_found");
  for (const status of ["REQUEST_DENIED", "OVER_QUERY_LIMIT", "UNKNOWN_ERROR", "INVALID_REQUEST"]) {
    assert.equal(parseGeocodeResponse({ status }).kind, "unavailable", status);
  }
  assert.equal(parseGeocodeResponse(null).kind, "unavailable");
  const outside = structuredClone(okResponse);
  outside.results[0].address_components[0].short_name = "US";
  assert.equal(parseGeocodeResponse(outside).kind, "not_found");
  const nan = structuredClone(okResponse);
  nan.results[0].geometry.location.lat = "19";
  assert.equal(parseGeocodeResponse(nan).kind, "not_found");
});

test("buildGeocodeQuery and buildSavedLabel", () => {
  assert.equal(buildGeocodeQuery(address), "12 Linking Rd, Bandra West, Mumbai, Maharashtra, 400050, India");
  assert.equal(buildGeocodeQuery({ ...address, line2: "" }), "12 Linking Rd, Mumbai, Maharashtra, 400050, India");
  assert.equal(buildSavedLabel(address), "12 Linking Rd, Mumbai");
  assert.equal(buildSavedLabel({ ...address, line1: "x".repeat(300) }).length, 200);
});

test("geocodeWith: request shape, missing key, http error, thrown fetch", async () => {
  let seen = "";
  const fetchOk = async (url) => {
    seen = url;
    return { ok: true, json: async () => okResponse };
  };
  assert.equal((await geocodeWith(fetchOk, "KEY", address)).kind, "found");
  assert.match(seen, /^https:\/\/maps\.googleapis\.com\/maps\/api\/geocode\/json\?address=/);
  assert.match(seen, /components=country:IN&region=in&key=KEY$/);
  assert.equal((await geocodeWith(fetchOk, undefined, address)).kind, "unavailable");
  assert.equal((await geocodeWith(fetchOk, "", address)).kind, "unavailable");
  assert.equal((await geocodeWith(async () => ({ ok: false, json: async () => ({}) }), "K", address)).kind, "unavailable");
  assert.equal((await geocodeWith(async () => { throw new Error("net KEY"); }, "K", address)).kind, "unavailable");
  assert.equal((await geocodeWith(async () => ({ ok: true, json: async () => { throw new Error("bad"); } }), "K", address)).kind, "unavailable");
});

function makeDeps(overrides = {}) {
  const calls = { created: [], profile: [], addr: [], deleted: [] };
  const deps = {
    validate: (b) => validateSignupPayload(b, normalizeIndianMobile),
    geocode: async () => ({ kind: "found", lat: 19.06, lng: 72.83 }),
    buildLabel: buildSavedLabel,
    messages: { notFound: GEOCODE_NOT_FOUND_MESSAGE, unavailable: GEOCODE_UNAVAILABLE_MESSAGE },
    createAuthUser: async (email, password) => {
      calls.created.push({ email, password });
      return { id: "u1" };
    },
    insertProfile: async (row) => {
      calls.profile.push(row);
      return null;
    },
    insertAddress: async (row) => {
      calls.addr.push(row);
      return null;
    },
    deleteAuthUser: async (id) => {
      calls.deleted.push(id);
    },
    ...overrides,
  };
  return { deps, calls };
}

test("runSignup success writes profile with saved location and the default address", async () => {
  const { deps, calls } = makeDeps();
  const out = await runSignup(goodBody, deps);
  assert.deepEqual(out, { status: 200, body: { ok: true } });
  assert.equal(calls.profile[0].phone, "+919820012345");
  assert.equal(calls.profile[0].label, "12 Linking Rd, Mumbai");
  assert.equal(calls.profile[0].lat, 19.06);
  assert.equal(calls.addr[0].userId, "u1");
  assert.deepEqual(calls.deleted, []);
});

test("runSignup validation error: 400, nothing geocoded or created", async () => {
  let geocoded = false;
  const { deps, calls } = makeDeps({ geocode: async () => { geocoded = true; return { kind: "found", lat: 1, lng: 1 }; } });
  const out = await runSignup({ ...goodBody, address: { ...address, pincode: "12" } }, deps);
  assert.equal(out.status, 400);
  assert.equal(geocoded, false);
  assert.equal(calls.created.length, 0);
});

test("runSignup address not found: 400 and no account", async () => {
  const { deps, calls } = makeDeps({ geocode: async () => ({ kind: "not_found" }) });
  const out = await runSignup(goodBody, deps);
  assert.deepEqual(out, { status: 400, body: { error: GEOCODE_NOT_FOUND_MESSAGE } });
  assert.equal(calls.created.length, 0);
});

test("runSignup geocoder unavailable: 503 and no account", async () => {
  const { deps, calls } = makeDeps({ geocode: async () => ({ kind: "unavailable" }) });
  const out = await runSignup(goodBody, deps);
  assert.deepEqual(out, { status: 503, body: { error: GEOCODE_UNAVAILABLE_MESSAGE } });
  assert.equal(calls.created.length, 0);
});

test("runSignup duplicate email / auth failure: 400 with the auth message", async () => {
  const { deps, calls } = makeDeps({ createAuthUser: async () => ({ error: "already registered" }) });
  const out = await runSignup(goodBody, deps);
  assert.deepEqual(out, { status: 400, body: { error: "already registered" } });
  assert.equal(calls.deleted.length, 0);
});

test("runSignup profile failure rolls back the auth user", async () => {
  const { deps, calls } = makeDeps({ insertProfile: async () => "boom secret detail" });
  const out = await runSignup(goodBody, deps);
  assert.deepEqual(out, { status: 500, body: { error: "Failed to create account" } });
  assert.deepEqual(calls.deleted, ["u1"]);
});

test("runSignup address failure rolls back; thrown insert also rolls back", async () => {
  const a = makeDeps({ insertAddress: async () => "x" });
  assert.equal((await runSignup(goodBody, a.deps)).status, 500);
  assert.deepEqual(a.calls.deleted, ["u1"]);
  const b = makeDeps({ insertAddress: async () => { throw new Error("db down"); } });
  assert.equal((await runSignup(goodBody, b.deps)).status, 500);
  assert.deepEqual(b.calls.deleted, ["u1"]);
});

test("runSignup still returns 500 when the rollback itself throws", async () => {
  const { deps } = makeDeps({
    insertAddress: async () => "x",
    deleteAuthUser: async () => { throw new Error("no"); },
  });
  assert.equal((await runSignup(goodBody, deps)).status, 500);
});
