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

const cartOk = { storeId: "s1", storeName: "Dosa Corner", orderNote: "", items: [{ lineId: "m1::o1", name: "Masala Dosa", quantity: 2, price: 130, options: ["Regular"] }] };

test("cart snapshot is optional and defaults to null", () => {
  assert.equal(parseChatRequest({ message: "hi" }).value.cart, null);
  assert.equal(parseChatRequest({ message: "hi", cart: null }).value.cart, null);
});

test("a valid cart snapshot passes through", () => {
  assert.deepEqual(parseChatRequest({ message: "hi", cart: cartOk }).value.cart, cartOk);
  assert.deepEqual(parseChatRequest({ message: "hi", cart: { storeId: null, storeName: null, items: [] } }).value.cart, { storeId: null, storeName: null, orderNote: "", items: [] });
});

test("a snapshot that is not a cart is ignored (null), never a 400", () => {
  const line = cartOk.items[0];
  const originalError = console.error;
  console.error = () => {};
  try {
    for (const cart of ["x", [], { items: "no" }, { storeId: 5, storeName: null, items: [] }, { storeId: "x".repeat(101), storeName: null, items: [] }]) {
      const out = parseChatRequest({ message: "hi", cart });
      assert.equal(out.ok, true, JSON.stringify(cart));
      assert.equal(out.value.cart, null);
    }
  } finally {
    console.error = originalError;
  }
});

test("an over-limit or malformed cart never fails the chat: values are clamped or the line is dropped", () => {
  const line = cartOk.items[0];
  const parse = (cart) => {
    const out = parseChatRequest({ message: "hi", cart });
    assert.equal(out.ok, true);
    return out.value.cart;
  };
  assert.equal(parse({ ...cartOk, items: [{ ...line, quantity: 21 }] }).items[0].quantity, 20);
  assert.equal(parse({ ...cartOk, items: [{ ...line, quantity: 500 }] }).items[0].lineId, line.lineId);
  const sixOptions = "a".repeat(36) + "::" + Array.from({ length: 6 }, () => "b".repeat(36)).join(",");
  assert.equal(parse({ ...cartOk, items: [{ ...line, lineId: sixOptions }] }).items[0].lineId, sixOptions);
  assert.equal(parse({ ...cartOk, items: [{ ...line, lineId: "x".repeat(38 + 37 * 20) }] }).items.length, 1);
  assert.equal(parse({ ...cartOk, items: [{ ...line, lineId: "x".repeat(38 + 37 * 20 + 1) }] }).items.length, 0);
  assert.equal(parse({ ...cartOk, items: Array.from({ length: 60 }, (_, n) => ({ ...line, lineId: "l" + n })) }).items.length, 50);
  const mixed = parse({
    ...cartOk,
    storeName: "x".repeat(300),
    items: [
      null, { ...line, quantity: 0 }, { ...line, quantity: 1.5 }, { ...line, price: -1 }, { ...line, price: Number.NaN }, { ...line, lineId: "" }, { ...line, name: 5 },
      { ...line, lineId: "ok", name: "n".repeat(300), options: Array.from({ length: 30 }, () => "o".repeat(150)) },
    ],
  });
  assert.equal(mixed.items.length, 1);
  assert.equal(mixed.items[0].name.length, 200);
  assert.equal(mixed.items[0].options.length, 20);
  assert.equal(mixed.items[0].options[0].length, 100);
  assert.equal(mixed.storeName.length, 200);
});

test("snapshot orderNote: kept when a string, cut at 500, missing or non-string becomes empty", () => {
  const note = (value) => parseChatRequest({ message: "hi", cart: { ...cartOk, orderNote: value } }).value.cart.orderNote;
  assert.equal(note("no onions"), "no onions");
  assert.equal(note("x".repeat(900)).length, 500);
  for (const bad of [undefined, null, 5, {}, ["a"], true]) assert.equal(note(bad), "");
});
