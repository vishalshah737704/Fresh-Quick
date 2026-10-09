import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as webView from "../lib/admin-order-view.ts";
import * as mobileView from "../mobile/lib/admin-order-view.ts";
import * as mobileAdmin from "../mobile/lib/registration-admin.ts";
import { notifyAdminPendingChanged, onAdminPendingChanged } from "../mobile/lib/admin-pending.ts";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("overviewStats on the phone copy matches web and survives an empty list", () => {
  assert.deepEqual(mobileView.overviewStats([], 0), { activeOrders: 0, vendors: 0, revenuePaise: 0 });
  const orders = [
    { status: "placed", total: 100 },
    { status: "delivered", total: 50.5 },
    { status: "cancelled", total: 70 },
    { status: "rejected", total: 20 },
  ];
  assert.deepEqual(mobileView.overviewStats(orders, 3), webView.overviewStats(orders, 3));
  assert.deepEqual(mobileView.overviewStats(orders, 3), { activeOrders: 1, vendors: 3, revenuePaise: 15050 });
});

test("shapeRegistrationRows on the phone copy is allow-listed and tolerant", () => {
  assert.deepEqual(mobileAdmin.shapeRegistrationRows(null), []);
  const [row] = mobileAdmin.shapeRegistrationRows([{ user_id: "u1", email: "a@b.co", full_name: "A", secret: "x" }]);
  assert.equal(row.id, "u1");
  assert.equal(row.fullName, "A");
  assert.equal("secret" in row, false);
});

test("admin pending event notifies subscribers until they unsubscribe", () => {
  let calls = 0;
  const off = onAdminPendingChanged(() => { calls += 1; });
  notifyAdminPendingChanged();
  notifyAdminPendingChanged();
  assert.equal(calls, 2);
  off();
  notifyAdminPendingChanged();
  assert.equal(calls, 2);
});

test("session guard accepts the admin login route", () => {
  assert.match(read("../mobile/lib/use-require-session.ts"), /"\/login\/admin"/);
});

test("role picker has an Admin button to the admin login", () => {
  const picker = read("../mobile/src/app/index.tsx");
  assert.match(picker, /router\.push\("\/login\/admin"\)/);
  assert.match(picker, />Admin</);
});

test("admin login checks the role, signs a non-admin out, and never shows the raw banned text", () => {
  const login = read("../mobile/src/app/login/admin.tsx");
  assert.match(login, /profile\?\.role !== "admin"/);
  assert.match(login, /This account is not an admin account\./);
  assert.match(login, /supabase\.auth\.signOut\(\)/);
  assert.match(login, /resolveLoginErrorText\(signInError\.message, null\)/);
  assert.doesNotMatch(login, /setError\(signInError\.message\)/);
  assert.match(login, /router\.replace\("\/admin\/overview"\)/);
});

test("root layout registers the admin login and admin tabs", () => {
  const layout = read("../mobile/src/app/_layout.tsx");
  assert.match(layout, /name="login\/admin"/);
  assert.match(layout, /name="admin\/\(tabs\)"/);
});

test("overview loads orders, vendors and the pending count, guards the session, and can sign out", () => {
  const overview = read("../mobile/src/app/admin/(tabs)/overview.tsx");
  assert.match(overview, /useRequireSession\("\/login\/admin"\)/);
  assert.match(overview, /\/api\/admin\/orders/);
  assert.match(overview, /\/api\/admin\/restaurants/);
  assert.match(overview, /\/api\/admin\/registrations\/summary/);
  assert.match(overview, /overviewStats\(/);
  assert.match(overview, /formatPaise\(/);
  assert.match(overview, /supabase\.auth\.signOut\(\)/);
  assert.match(overview, /ApiError/);
});

test("registrations screen: guards, loads both segments, polls with cleanup, drops stale responses", () => {
  const screen = read("../mobile/src/app/admin/(tabs)/registrations.tsx");
  assert.match(screen, /useRequireSession\("\/login\/admin"\)/);
  assert.match(screen, /\/api\/admin\/registrations\?view=\$\{segment\}/);
  assert.match(screen, /setInterval\(/);
  assert.match(screen, /clearInterval\(/);
  assert.match(screen, /requestRef\.current/);
  assert.match(screen, /if \(tab === segment\) return;/);
  assert.match(screen, /Loading registrations\.\.\./);
  assert.match(screen, /No registrations are waiting for approval\./);
  assert.match(screen, /No decisions yet\./);
});

test("registrations screen: one decision at a time, reason validated before any request", () => {
  const screen = read("../mobile/src/app/admin/(tabs)/registrations.tsx");
  assert.match(screen, /busyRef\.current/);
  assert.match(screen, /cleanRejectionReason\(/);
  assert.match(screen, /REJECTION_REASON_MAX/);
  assert.match(screen, /`\/api\/admin\/registrations\/\$\{row\.id\}\/\$\{kind\}`/);
  assert.match(screen, /decide\(row, "approve"\)/);
  assert.match(screen, /decide\(rejecting, "reject", cleaned\.value\)/);
  assert.match(screen, /body: kind === "reject" \? \{ reason: reasonText \} : undefined/);
  assert.match(screen, /loadRef\.current = load/);
  assert.equal((screen.match(/await loadRef\.current\(\)/g) ?? []).length, 3);
  assert.doesNotMatch(screen, /await load\(\)/);
  assert.match(screen, /await loadRef\.current\(\);\n\s*\/\/[^\n]*\n\s*if \(failure\) setError\(failure\)/);
  assert.match(screen, /if \(busyId === null\) setRejecting\(null\)/);
  assert.match(screen, /notifyAdminPendingChanged\(\)/);
  assert.match(screen, /err instanceof ApiError/);
  assert.doesNotMatch(screen, /rejection_reason|\bREASON_MAX\s*=\s*500/);
});

test("admin tabs: Registrations tab with a pending badge that refreshes on the event", () => {
  const layout = read("../mobile/src/app/admin/(tabs)/_layout.tsx");
  assert.match(layout, /name="registrations"/);
  assert.match(layout, /tabBarBadge/);
  assert.match(layout, /onAdminPendingChanged\(/);
  assert.match(layout, /\/api\/admin\/registrations\/summary/);
  assert.match(layout, /clearInterval\(/);
});

test("overview tile opens the Registrations tab", () => {
  assert.match(read("../mobile/src/app/admin/(tabs)/overview.tsx"), /router\.navigate\("\/admin\/registrations"\)/);
});

test("admin lists clear the floating Zippy button and a 409 refreshes the pending badge", () => {
  const screen = read("../mobile/src/app/admin/(tabs)/registrations.tsx");
  assert.match(screen, /paddingBottom: 160/);
  assert.match(read("../mobile/src/app/admin/(tabs)/overview.tsx"), /paddingBottom: 160/);
  assert.match(screen, /err\.status === 409[\s\S]{0,80}notifyAdminPendingChanged\(\)/);
});
