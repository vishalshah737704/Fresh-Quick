import test from "node:test";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import {
  rateLimitPlan,
  preAuthPlan,
  readLimits,
  retryAfterSeconds,
  limitMessage,
  LIMIT_DAY_MESSAGE,
  LIMIT_BUSY_MESSAGE,
  LIMIT_GLOBAL_DAY_MESSAGE,
} from "../lib/zippy/rate-limit.ts";
import { clientIpFromForwarded, parseTrustedHops } from "../lib/zippy/client-ip.ts";
import { MAX_BODY_BYTES, declaredLengthTooLarge, readTextWithCap } from "../lib/zippy/body-cap.ts";

const NAMES = [
  "ZIPPY_LIMIT_USER_PER_MIN", "ZIPPY_LIMIT_USER_PER_DAY", "ZIPPY_LIMIT_VISITOR_PER_MIN",
  "ZIPPY_LIMIT_VISITOR_PER_DAY", "ZIPPY_LIMIT_GLOBAL_VISITORS_PER_MIN", "ZIPPY_LIMIT_GLOBAL_VISITORS_PER_DAY",
  "ZIPPY_LIMIT_GLOBAL_USERS_PER_MIN", "ZIPPY_LIMIT_GLOBAL_USERS_PER_DAY", "ZIPPY_LIMIT_ALL_PER_DAY",
  "ZIPPY_LIMIT_IP_BURST_PER_MIN",
];
for (const name of NAMES) delete process.env[name];

test("defaults", () => {
  assert.deepEqual(readLimits({}), {
    userPerMin: 10, userPerDay: 60, visitorPerMin: 5, visitorPerDay: 20,
    globalVisitorsPerMin: 60, globalVisitorsPerDay: 1000, globalUsersPerMin: 120,
    globalUsersPerDay: 5000, allPerDay: 8000, ipBurstPerMin: 40,
  });
});

test("env overrides apply; invalid values fall back to the default", () => {
  const l = readLimits({ ZIPPY_LIMIT_USER_PER_MIN: "3", ZIPPY_LIMIT_ALL_PER_DAY: " 500 ", ZIPPY_LIMIT_IP_BURST_PER_MIN: "1000000" });
  assert.equal(l.userPerMin, 3);
  assert.equal(l.allPerDay, 500);
  assert.equal(l.ipBurstPerMin, 1000000);
  for (const bad of ["0", "-1", "abc", "", "1.5", "1000001", "1e3", "NaN"]) {
    assert.equal(readLimits({ ZIPPY_LIMIT_USER_PER_DAY: bad }).userPerDay, 60, bad);
  }
});

test("signed-in plan: identity, then global users, then the overall ceiling", () => {
  const plan = rateLimitPlan({ userId: "u1", ip: "1.2.3.4" });
  assert.deepEqual(plan.map((p) => p.bucket), ["user:u1:min", "user:u1:day", "users:all:min", "users:all:day", "all:day"]);
  assert.deepEqual(plan.map((p) => p.windowSeconds), [60, 86400, 60, 86400, 86400]);
  assert.deepEqual(plan.map((p) => p.limit), [10, 60, 120, 5000, 8000]);
  assert.deepEqual(plan.map((p) => p.kind), ["minute", "day", "global", "globalDay", "globalDay"]);
});

test("visitor plan: hashed IP buckets, global visitors, then the ceiling; raw IP never stored", () => {
  const plan = rateLimitPlan({ userId: null, ip: "1.2.3.4" });
  assert.equal(plan.length, 5);
  for (const p of plan.slice(0, 2)) assert.match(p.bucket, /^ip:[0-9a-f]{16}:(min|day)$/);
  for (const p of plan) assert.ok(!p.bucket.includes("1.2.3.4"));
  assert.deepEqual(plan.slice(2).map((p) => p.bucket), ["visitors:all:min", "visitors:all:day", "all:day"]);
  assert.deepEqual(plan.map((p) => p.limit), [5, 20, 60, 1000, 8000]);
  assert.deepEqual(plan.map((p) => p.kind), ["minute", "day", "global", "globalDay", "globalDay"]);
});

test("the plan does not repeat the pre-auth burst bucket", () => {
  for (const plan of [rateLimitPlan({ userId: null, ip: "1.2.3.4" }), rateLimitPlan({ userId: "u", ip: "1.2.3.4" })]) {
    assert.ok(!plan.some((p) => p.bucket.startsWith("ipburst:")));
  }
});

test("null IP shares one strict bucket; same IP gives the same bucket", () => {
  assert.equal(rateLimitPlan({ userId: null, ip: null })[0].bucket, "ip:unknown:min");
  assert.equal(
    rateLimitPlan({ userId: null, ip: "9.9.9.9" })[0].bucket,
    rateLimitPlan({ userId: null, ip: "9.9.9.9" })[0].bucket,
  );
  assert.deepEqual(rateLimitPlan({ userId: null, ip: null }).slice(2).map((p) => p.bucket), ["visitors:all:min", "visitors:all:day", "all:day"]);
});

test("pre-auth plan is one hashed burst bucket", () => {
  const plan = preAuthPlan("1.2.3.4");
  assert.equal(plan.length, 1);
  assert.match(plan[0].bucket, /^ipburst:[0-9a-f]{16}:min$/);
  assert.equal(plan[0].limit, 40);
  assert.equal(plan[0].windowSeconds, 60);
  assert.equal(preAuthPlan(null)[0].bucket, "ipburst:unknown:min");
});

test("plans read env at call time", () => {
  process.env.ZIPPY_LIMIT_VISITOR_PER_MIN = "2";
  try {
    assert.equal(rateLimitPlan({ userId: null, ip: "1.1.1.1" })[0].limit, 2);
  } finally {
    delete process.env.ZIPPY_LIMIT_VISITOR_PER_MIN;
  }
  assert.equal(rateLimitPlan({ userId: null, ip: "1.1.1.1" })[0].limit, 5);
});

test("retryAfterSeconds matches fixed-window arithmetic", () => {
  assert.equal(retryAfterSeconds(60, 0), 60);
  assert.equal(retryAfterSeconds(60, 59_999), 1);
  assert.equal(retryAfterSeconds(60, 60_000), 60);
  assert.equal(retryAfterSeconds(60, 30_500), 30);
  assert.equal(retryAfterSeconds(86400, 86_399_000), 1);
  assert.equal(retryAfterSeconds(86400, 86_400_000), 86400);
});

test("limit messages by class", () => {
  assert.equal(limitMessage("minute", 12), "You're asking a little too fast. Please wait 12 seconds and try again.");
  assert.equal(limitMessage("day", 5), LIMIT_DAY_MESSAGE);
  assert.equal(limitMessage("global", 5), LIMIT_BUSY_MESSAGE);
  assert.equal(limitMessage("globalDay", 5), LIMIT_GLOBAL_DAY_MESSAGE);
  assert.equal(LIMIT_GLOBAL_DAY_MESSAGE, "Zippy has reached its limit for today. Please try again later today.");
});

test("trusted proxy hops parsing", () => {
  assert.equal(parseTrustedHops(undefined), 1);
  assert.equal(parseTrustedHops("0"), 0);
  assert.equal(parseTrustedHops("2"), 2);
  assert.equal(parseTrustedHops(" 5 "), 5);
  for (const bad of ["6", "-1", "x", "", "1.5"]) assert.equal(parseTrustedHops(bad), 1, bad);
});

test("client IP extraction by trusted hops", () => {
  const h = "6.6.6.6, 1.2.3.4, 10.0.0.1";
  assert.equal(clientIpFromForwarded(h, 0), null);
  assert.equal(clientIpFromForwarded(h, 1), "10.0.0.1");
  assert.equal(clientIpFromForwarded(h, 2), "1.2.3.4");
  assert.equal(clientIpFromForwarded(h, 3), "6.6.6.6");
  assert.equal(clientIpFromForwarded(h, 4), null);
  assert.equal(clientIpFromForwarded(null, 1), null);
  assert.equal(clientIpFromForwarded("", 1), null);
  assert.equal(clientIpFromForwarded("1.2.3.4", 2), null);
  assert.equal(clientIpFromForwarded("  1.2.3.4  ,   5.6.7.8  ", 1), "5.6.7.8");
  assert.equal(clientIpFromForwarded("1.2.3.4,", 1), null);
  assert.equal(clientIpFromForwarded("::1", 1), "0:0:0:0::/64");
  assert.equal(clientIpFromForwarded("evil, 2001:db8::1", 1), "2001:db8:0:0::/64");
});

test("a spoofed leftmost entry does not change the identified client (hops 1)", () => {
  assert.equal(clientIpFromForwarded("1.1.1.1, 9.9.9.9", 1), clientIpFromForwarded("2.2.2.2, 9.9.9.9", 1));
});

test("body cap", () => {
  assert.equal(MAX_BODY_BYTES, 200_000);
  assert.equal(declaredLengthTooLarge(null), false);
  assert.equal(declaredLengthTooLarge("200000"), false);
  assert.equal(declaredLengthTooLarge("200001"), true);
  assert.equal(declaredLengthTooLarge(" 999999999 "), true);
  assert.equal(declaredLengthTooLarge("abc"), false);
  assert.equal(declaredLengthTooLarge(""), false);
});

test("client IP is normalised before use", () => {
  assert.equal(clientIpFromForwarded("1.2.3.4:5678", 1), "1.2.3.4");
  assert.equal(clientIpFromForwarded("[2001:DB8::1]:443", 1), "2001:db8:0:0::/64");
  assert.equal(clientIpFromForwarded("[::1]", 1), "0:0:0:0::/64");
  assert.equal(clientIpFromForwarded("::ffff:1.2.3.4", 1), "1.2.3.4");
  assert.equal(clientIpFromForwarded("::FFFF:1.2.3.4", 1), "1.2.3.4");
  assert.equal(clientIpFromForwarded("::ffff:102:304", 1), "1.2.3.4");
  assert.equal(clientIpFromForwarded("2001:DB8::ABCD", 1), "2001:db8:0:0::/64");
});

test("IPv6 addresses collapse to their /64 prefix, whatever the spelling", () => {
  const prefix = "2001:db8:1:2::/64";
  for (const ip of ["2001:db8:1:2::1", "2001:DB8:1:2:0:0:0:1", "2001:db8:1:2:aaaa:bbbb:cccc:dddd", "2001:0db8:0001:0002::", "[2001:db8:1:2::9]:443", "2001:db8:1:2:3:4:5:6"]) {
    assert.equal(clientIpFromForwarded(ip, 1), prefix, ip);
  }
  assert.notEqual(clientIpFromForwarded("2001:db8:1:3::1", 1), prefix);
  assert.equal(clientIpFromForwarded("::1", 1), "0:0:0:0::/64");
  assert.equal(clientIpFromForwarded("fe80::1", 1), "fe80:0:0:0::/64");
  assert.equal(clientIpFromForwarded("fe80::abcd%eth0", 1), "fe80:0:0:0::/64");
  assert.equal(clientIpFromForwarded("FE80::1", 1), clientIpFromForwarded("fe80:0:0:0:9::2", 1));
});

test("IPv4 and IPv4-mapped IPv6 are unchanged by the /64 rule; unparseable text is left as it was", () => {
  assert.equal(clientIpFromForwarded("203.0.113.7", 1), "203.0.113.7");
  assert.equal(clientIpFromForwarded("::ffff:203.0.113.7", 1), "203.0.113.7");
  assert.equal(clientIpFromForwarded("gg::1", 1), "gg::1");
  assert.equal(clientIpFromForwarded("1::2::3", 1), "1::2::3");
});

test("the bucket hash is salted by ZIPPY_IP_HASH_SALT read at call time; unset or empty keeps today's hash", () => {
  const saved = process.env.ZIPPY_IP_HASH_SALT;
  const bucket = () => rateLimitPlan({ userId: null, ip: "203.0.113.7" })[0].bucket;
  try {
    delete process.env.ZIPPY_IP_HASH_SALT;
    const unsalted = bucket();
    assert.equal(unsalted, "ip:" + createHash("sha256").update("203.0.113.7").digest("hex").slice(0, 16) + ":min");
    process.env.ZIPPY_IP_HASH_SALT = "";
    assert.equal(bucket(), unsalted);
    process.env.ZIPPY_IP_HASH_SALT = "pepper";
    const salted = bucket();
    assert.notEqual(salted, unsalted);
    assert.notEqual(preAuthPlan("203.0.113.7")[0].bucket, "ipburst:" + unsalted.split(":")[1] + ":min");
    process.env.ZIPPY_IP_HASH_SALT = "other";
    assert.notEqual(bucket(), salted);
    process.env.ZIPPY_IP_HASH_SALT = "pepper";
    assert.equal(bucket(), salted);
    assert.equal(rateLimitPlan({ userId: null, ip: null })[0].bucket, "ip:unknown:min");
  } finally {
    if (saved === undefined) delete process.env.ZIPPY_IP_HASH_SALT;
    else process.env.ZIPPY_IP_HASH_SALT = saved;
  }
});

function fakeStream(chunks) {
  let i = 0;
  const state = { cancelled: false };
  return {
    state,
    getReader: () => ({
      read: async () => (i < chunks.length ? { done: false, value: chunks[i++] } : { done: true }),
      cancel: async () => { state.cancelled = true; },
    }),
  };
}
const enc = (s) => new TextEncoder().encode(s);

test("readTextWithCap: under, exact and over the cap", async () => {
  let r = await readTextWithCap(fakeStream([enc("ab"), enc("cd")]), 10);
  assert.deepEqual(r, { ok: true, text: "abcd" });
  const exact = fakeStream([enc("abcde"), enc("fghij")]);
  r = await readTextWithCap(exact, 10);
  assert.deepEqual(r, { ok: true, text: "abcdefghij" });
  assert.equal(exact.state.cancelled, false);
  const first = fakeStream([enc("x".repeat(11))]);
  assert.deepEqual(await readTextWithCap(first, 10), { ok: false });
  assert.equal(first.state.cancelled, true);
  const across = fakeStream([enc("x".repeat(6)), enc("x".repeat(6)), enc("never")]);
  assert.deepEqual(await readTextWithCap(across, 10), { ok: false });
  assert.equal(across.state.cancelled, true);
});

test("readTextWithCap: empty stream, null body and a multibyte character split across chunks", async () => {
  assert.deepEqual(await readTextWithCap(fakeStream([]), 10), { ok: true, text: "" });
  assert.deepEqual(await readTextWithCap(null, 10), { ok: true, text: "" });
  const bytes = enc("a€b"); // euro sign is 3 bytes
  const r = await readTextWithCap(fakeStream([bytes.slice(0, 2), bytes.slice(2)]), 10);
  assert.deepEqual(r, { ok: true, text: "a€b" });
  assert.deepEqual(await readTextWithCap(fakeStream([bytes]), 4), { ok: false });
  assert.deepEqual(await readTextWithCap(fakeStream([bytes]), 5), { ok: true, text: "a€b" });
});
