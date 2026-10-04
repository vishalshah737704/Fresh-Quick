import test from "node:test";
import assert from "node:assert/strict";
import { parseBearer, parseChatRequest } from "../lib/zippy/validate.ts";

test("parseBearer distinguishes no header, a token, and junk", () => {
  assert.deepEqual(parseBearer(null), { kind: "none" });
  assert.deepEqual(parseBearer("Bearer abc.def"), { kind: "token", token: "abc.def" });
  assert.deepEqual(parseBearer("bearer abc"), { kind: "token", token: "abc" });
  assert.deepEqual(parseBearer("Bearer "), { kind: "malformed" });
  assert.deepEqual(parseBearer("Basic abc"), { kind: "malformed" });
  assert.deepEqual(parseBearer(""), { kind: "none" });
});

test("parseChatRequest accepts a minimal valid body", () => {
  const r = parseChatRequest({ message: "  How do I order?  " });
  assert.equal(r.ok, true);
  assert.equal(r.value.message, "How do I order?");
  assert.equal(r.value.conversationId, null);
  assert.deepEqual(r.value.history, []);
  assert.equal(r.value.stream, true);
});

test("parseChatRequest rejects bad messages with a clear error", () => {
  for (const body of [null, "x", [], {}, { message: 5 }, { message: "" }, { message: "   " }]) {
    const r = parseChatRequest(body);
    assert.equal(r.ok, false, JSON.stringify(body));
    assert.ok(typeof r.error === "string" && r.error.length > 0);
  }
  assert.equal(parseChatRequest({ message: "a".repeat(1001) }).ok, false);
  assert.equal(parseChatRequest({ message: "a".repeat(1000) }).ok, true);
});

test("parseChatRequest validates conversationId and history shape", () => {
  const id = "123e4567-e89b-42d3-a456-426614174000";
  assert.equal(parseChatRequest({ message: "hi", conversationId: id }).value.conversationId, id);
  assert.equal(parseChatRequest({ message: "hi", conversationId: "nope" }).ok, false);
  assert.equal(parseChatRequest({ message: "hi", history: "x" }).ok, false);
  assert.equal(parseChatRequest({ message: "hi", history: [{ role: "user" }] }).ok, false);
  const ok = parseChatRequest({
    message: "hi",
    stream: false,
    history: [{ role: "user", content: "q" }, { role: "assistant", content: "a" }],
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.value.stream, false);
  assert.equal(ok.value.history.length, 2);
});

test("parseChatRequest rejects null and non-object history items without throwing", () => {
  for (const badItem of [null, undefined, 5, "x", true]) {
    const r = parseChatRequest({ message: "hi", history: [badItem] });
    assert.equal(r.ok, false, `history with ${JSON.stringify(badItem)} should fail`);
    assert.equal(r.error, "Invalid history");
  }
});

test("parseChatRequest history caps", () => {
  const turn = (role, n) => ({ role, content: "a".repeat(n) });
  const ten = Array.from({ length: 10 }, (_, k) => turn(k % 2 ? "assistant" : "user", k % 2 ? 6000 : 10));
  assert.equal(parseChatRequest({ message: "q", history: ten }).ok, true);
  assert.equal(parseChatRequest({ message: "q", history: [turn("user", 8001)] }).ok, false);
  assert.equal(parseChatRequest({ message: "q", history: [turn("user", 8000)] }).ok, true);
  assert.equal(parseChatRequest({ message: "q", history: Array.from({ length: 51 }, () => turn("user", 2)) }).ok, false);
  const heavy = Array.from({ length: 10 }, () => turn("assistant", 4500));
  assert.equal(parseChatRequest({ message: "q", history: heavy }).ok, false);
  const oldPrefix = [
    ...Array.from({ length: 40 }, () => turn("user", 3000)),
    ...Array.from({ length: 10 }, () => turn("assistant", 5)),
  ];
  assert.equal(parseChatRequest({ message: "q", history: oldPrefix }).ok, true);
});

test("parseChatRequest location: absent is null, valid is kept, anything else is a 400", () => {
  assert.equal(parseChatRequest({ message: "hi" }).value.location, null);
  assert.equal(parseChatRequest({ message: "hi", location: null }).value.location, null);
  assert.deepEqual(parseChatRequest({ message: "hi", location: { lat: 19.076, lng: 72.8777 } }).value.location, { lat: 19.076, lng: 72.8777 });
  assert.equal(parseChatRequest({ message: "hi", location: { lat: 90, lng: -180 } }).ok, true);
  for (const bad of [{}, { lat: 91, lng: 0 }, { lat: 0, lng: 181 }, { lat: "1", lng: 2 }, { lat: NaN, lng: 0 }, { lat: Infinity, lng: 0 }, [], "x", 5]) {
    assert.equal(parseChatRequest({ message: "hi", location: bad }).ok, false, JSON.stringify(bad));
  }
});

const cartOk = { storeId: "s1", storeName: "Dosa Corner", items: [{ lineId: "m1::o1", name: "Masala Dosa", quantity: 2, price: 130, options: ["Regular"] }] };

test("cart snapshot is optional and defaults to null", () => {
  assert.equal(parseChatRequest({ message: "hi" }).value.cart, null);
  assert.equal(parseChatRequest({ message: "hi", cart: null }).value.cart, null);
});

test("a valid cart snapshot passes through", () => {
  assert.deepEqual(parseChatRequest({ message: "hi", cart: cartOk }).value.cart, cartOk);
  assert.deepEqual(parseChatRequest({ message: "hi", cart: { storeId: null, storeName: null, items: [] } }).value.cart, { storeId: null, storeName: null, items: [] });
});

test("an invalid cart snapshot is rejected", () => {
  const line = cartOk.items[0];
  const bad = [
    "x", [], { items: "no" }, { storeId: 5, storeName: null, items: [] },
    { ...cartOk, items: Array.from({ length: 51 }, () => line) },
    { ...cartOk, items: [{ ...line, quantity: 0 }] }, { ...cartOk, items: [{ ...line, quantity: 21 }] }, { ...cartOk, items: [{ ...line, quantity: 1.5 }] },
    { ...cartOk, items: [{ ...line, price: -1 }] }, { ...cartOk, items: [{ ...line, price: Number.NaN }] },
    { ...cartOk, items: [{ ...line, lineId: "" }] }, { ...cartOk, items: [{ ...line, lineId: "x".repeat(201) }] },
    { ...cartOk, items: [{ ...line, name: 5 }] }, { ...cartOk, items: [{ ...line, options: "Regular" }] },
    { ...cartOk, items: [{ ...line, options: Array.from({ length: 21 }, () => "o") }] }, { ...cartOk, items: [null] },
    { ...cartOk, storeName: "x".repeat(201) },
  ];
  for (const cart of bad) {
    assert.deepEqual(parseChatRequest({ message: "hi", cart }), { ok: false, error: "Invalid cart" }, JSON.stringify(cart).slice(0, 80));
  }
});
