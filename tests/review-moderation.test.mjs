import test from "node:test";
import assert from "node:assert/strict";
import { buildModerationPatch } from "../lib/review-moderation.ts";

const NOW = "2026-10-07T12:00:00.000Z";

test("hide needs a reason, trims it, stamps hidden_at and resolves the open report", () => {
  assert.deepEqual(buildModerationPatch("hide", "  abusive  ", NOW), {
    ok: true,
    patch: { status: "hidden", hidden_reason: "abusive", hidden_at: NOW, reported_at: null },
  });
  for (const reason of [undefined, null, "", "   ", 42]) {
    assert.equal(buildModerationPatch("hide", reason, NOW).ok, false, String(reason));
  }
  assert.equal(buildModerationPatch("hide", "x".repeat(301), NOW).ok, false);
  assert.equal(buildModerationPatch("hide", "bad\u0000", NOW).ok, false);
});

test("unhide clears the hidden fields and makes the review visible again", () => {
  assert.deepEqual(buildModerationPatch("unhide", undefined, NOW), {
    ok: true,
    patch: { status: "visible", hidden_reason: null, hidden_at: null },
  });
});

test("dismiss-report clears only the open report flag", () => {
  assert.deepEqual(buildModerationPatch("dismiss", undefined, NOW), { ok: true, patch: { reported_at: null } });
});
