import test from "node:test";
import assert from "node:assert/strict";
import { ipBucket, normalizeEmail } from "../lib/registration-status-bucket.ts";

test("ipBucket hashes the address and never contains it", () => {
  const bucket = ipBucket("203.0.113.9", (v) => `h${v.length}`);
  assert.equal(bucket, "regstatus:h11");
  assert.ok(!bucket.includes("203.0.113.9"));
});

test("a missing ip shares one bucket", () => {
  assert.equal(ipBucket(null, (v) => v), "regstatus:unknown");
});

test("normalizeEmail trims and lower-cases, and rejects non-strings and junk", () => {
  assert.equal(normalizeEmail("  Asha@B.CO "), "asha@b.co");
  for (const bad of [undefined, null, 5, "", "   ", "no-at-sign", "a@b".repeat(100)]) {
    assert.equal(normalizeEmail(bad), null, String(bad));
  }
});
