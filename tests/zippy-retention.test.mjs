import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseRetentionDays, parseDryRun, DEFAULT_RETENTION_DAYS } from "../lib/zippy/retention.ts";

test("parseRetentionDays accepts integers 1 to 3650 as numbers or numeric strings", () => {
  assert.equal(parseRetentionDays(1), 1);
  assert.equal(parseRetentionDays(90), 90);
  assert.equal(parseRetentionDays(3650), 3650);
  assert.equal(parseRetentionDays("45"), 45);
});

test("parseRetentionDays falls back for anything else", () => {
  for (const bad of [0, -1, 3651, 1.5, NaN, null, undefined, "abc", "1.5", "0", "", {}]) {
    assert.equal(parseRetentionDays(bad), DEFAULT_RETENTION_DAYS);
  }
  assert.equal(parseRetentionDays("abc", 7), 7);
  assert.equal(DEFAULT_RETENTION_DAYS, 30);
});

test("parseDryRun is true unless the body says dryRun false", () => {
  assert.equal(parseDryRun({ dryRun: false }), false);
  for (const body of [{ dryRun: true }, {}, null, undefined, "false", { dryRun: "false" }, { dryRun: 0 }]) {
    assert.equal(parseDryRun(body), true);
  }
});

test("migration 32 guards the window, is service-role only and touches only Zippy tables", () => {
  const sql = readFileSync(new URL("../supabase/migrations/00000000000032_zippy_retention.sql", import.meta.url), "utf8");
  assert.match(sql, /p_retention_days < 1/);
  assert.match(sql, /security definer/);
  assert.match(sql, /set search_path = ''/);
  assert.match(sql, /revoke all on function public\.purge_zippy_chats\(int, boolean\) from public, anon, authenticated/);
  assert.match(sql, /grant execute on function public\.purge_zippy_chats\(int, boolean\) to service_role/);
  assert.doesNotMatch(sql, /truncate/i);
  assert.doesNotMatch(sql, /execute\s+(format|'|")/i);
  assert.match(sql, /p_retention_days > 3650/);
  const deletes = [...sql.matchAll(/delete from ([\w.]+)/g)].map((m) => m[1]);
  assert.deepEqual(deletes.sort(), ["public.zippy_conversations", "public.zippy_usage"]);
});
