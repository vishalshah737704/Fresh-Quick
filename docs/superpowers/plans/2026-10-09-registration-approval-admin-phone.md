# Registration Approval, Piece 3 (Phone Admin Area) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin approve or reject customer registrations from the phone app, with a read-only Overview as the landing screen.

**Architecture:** A third role on the phone: an "Admin" button on the role picker opens `login/admin` (signs in, checks `users.role === "admin"`), then a new `admin/(tabs)` route group with two tabs (Overview, Registrations). All data comes from existing admin API routes through `apiFetch` (Bearer token); the server stays the authority via `resolveAdmin`. Two small pure web files are copied byte-identical to `mobile/lib/` and parity-tested.

**Tech Stack:** Expo SDK 57 / React Native / expo-router (phone), `node --test` with type stripping for pure code, source-assertion tests for screens.

**Spec:** `docs/superpowers/specs/2026-10-09-registration-approval-admin-phone-design.md`

## Global Constraints

- No backend, web or workflow change. Use only: `GET /api/admin/registrations?view=pending|history` (returns `{requests: RegistrationRow[]}`), `GET /api/admin/registrations/summary` (returns `{pending: number}`), `POST /api/admin/registrations/:id/approve`, `POST /api/admin/registrations/:id/reject` with body `{reason}`, `GET /api/admin/orders` (returns `{orders: AdminOrderRow[]}`), `GET /api/admin/restaurants` (returns `{stores: unknown[]}`).
- Rejection reason: validate with the shared `cleanRejectionReason` / `REJECTION_REASON_MAX` (500) from `mobile/lib/registration-model.ts`; never retype that rule.
- Wording is the web's: role-mismatch text "This account is not an admin account."; empty states "No registrations are waiting for approval." and "No decisions yet."; loading text "Loading registrations..."; 409 text comes from the server ("This request was already decided.").
- A sign-in error uses `resolveLoginErrorText(signInError.message, null)` so the raw "User is banned" never shows.
- Pure shared files import nothing at runtime and are copied byte-identical to `mobile/lib/`, guarded in `tests/mobile-parity.test.mjs`. Phone files that import `./api`, `./supabase` or `react-native` are tested by source assertions, not imported.
- 2-space indent, ES modules, `async/await`, descriptive names, comments only for a non-obvious WHY. Brand tokens only from `mobile/theme.ts` (`BRAND`); error text colour `BRAND.colors.dangerTextSafe`.
- No package installs. Gmail is LIVE: never start n8n or `npm run app:start`, never read or print `.env*`, use only throwaway users described in Task 4, delete them afterwards, check what owns a port before stopping it and never stop the running dev servers or the 8081 Metro.
- Stage files by name; never `git add -A`; never stage `.claude/`, `.superpowers/`, `md_version/`, MP4 files.
- Run all commands from the worktree `C:\Vishal\Projects\FoodDelivery_App_WebSite\.claude\worktrees\approval-admin-phone` (branch `approval-admin-phone`).

## Review Focus

- A customer account must be refused on the admin login (role mismatch signs back out). Test: source assertion for the role check plus `signOut`.
- Reject must send no request with an empty, whitespace or over-500-character reason. Test: `cleanRejectionReason` rejects them (already unit-tested on web; assert the phone screen calls it before the request).
- A double tap on Approve or Reject must not send two requests. Test: source assertion for the `busyRef` guard.
- Switching Pending/History quickly must not show the old segment's rows (stale response). Test: source assertion for the request counter.
- A 401/403 from an admin route (non-admin session on an admin screen) must show an error line, never data or a crash. Test: source assertion that load errors set the error text from `ApiError.message`.
- The Overview must not crash on an empty order list (revenue `₹0`, 0 active). Test: `overviewStats([], 0)` through the phone copy.

---

### Task 1: Shared copies, session-guard route type, badge event module

**Files:**
- Create: `mobile/lib/registration-admin.ts` (byte copy of `lib/registration-admin.ts`)
- Create: `mobile/lib/admin-order-view.ts` (byte copy of `lib/admin-order-view.ts`)
- Create: `mobile/lib/admin-pending.ts`
- Modify: `mobile/lib/use-require-session.ts` (line 11: extend the union)
- Modify: `tests/mobile-parity.test.mjs` (two guard lines)
- Create: `tests/mobile-admin.test.mjs`

**Interfaces:**
- Produces:
  - `RegistrationRow`, `shapeRegistrationRows` (mobile copy), `AdminOrderRow`, `overviewStats(orders: {status: OrderStatus; total: number}[], vendorCount: number): {activeOrders: number; vendors: number; revenuePaise: number}` (mobile copy).
  - `notifyAdminPendingChanged(): void` and `onAdminPendingChanged(callback: () => void): () => void` (unsubscribe function) in `mobile/lib/admin-pending.ts`.
  - `useRequireSession(loginRoute: "/login/customer" | "/login/delivery" | "/login/admin")`.

- [ ] **Step 1: Worktree environment** (the controller prepared it; verify only)

Run: `ls .env.local node_modules mobile/node_modules >/dev/null 2>&1 && echo ready`
Expected: `ready`. If not, stop and report BLOCKED.

- [ ] **Step 2: Write the failing tests.** Create `tests/mobile-admin.test.mjs`:

```js
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
```

- [ ] **Step 3: Run to verify failure**

Run: `node --test tests/mobile-admin.test.mjs`
Expected: FAIL (files missing).

- [ ] **Step 4: Copy the shared files byte-identical**

Run:
```
cp lib/registration-admin.ts mobile/lib/registration-admin.ts
cp lib/admin-order-view.ts mobile/lib/admin-order-view.ts
```

- [ ] **Step 5: Create `mobile/lib/admin-pending.ts`:**

```ts
// The Registrations screen tells the tab bar to refresh its pending badge after a decision,
// without waiting for the next poll.
const listeners = new Set<() => void>();

export function onAdminPendingChanged(callback: () => void): () => void {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

export function notifyAdminPendingChanged(): void {
  listeners.forEach((callback) => callback());
}
```

- [ ] **Step 6: Extend the session guard.** In `mobile/lib/use-require-session.ts` change

```ts
export function useRequireSession(loginRoute: "/login/customer" | "/login/delivery") {
```
to
```ts
export function useRequireSession(loginRoute: "/login/customer" | "/login/delivery" | "/login/admin") {
```

- [ ] **Step 7: Parity guards.** In `tests/mobile-parity.test.mjs`, inside the test containing `assert.equal(read("../mobile/lib/zippy-gate.ts"), read("../lib/zippy-gate.ts"));`, add after that line:

```js
  assert.equal(read("../mobile/lib/registration-admin.ts"), read("../lib/registration-admin.ts"));
  assert.equal(read("../mobile/lib/admin-order-view.ts"), read("../lib/admin-order-view.ts"));
```

- [ ] **Step 8: Run all checks**

Run: `node --test tests/*.test.mjs`; `cd mobile && npx tsc --noEmit && cd ..`; `npx eslint mobile/lib/admin-pending.ts mobile/lib/use-require-session.ts`
Expected: all pass (593 + 4 = 597 tests).

- [ ] **Step 9: Commit**

```bash
git add mobile/lib/registration-admin.ts mobile/lib/admin-order-view.ts mobile/lib/admin-pending.ts mobile/lib/use-require-session.ts tests/mobile-parity.test.mjs tests/mobile-admin.test.mjs
git commit -m "feat(approval-admin-phone): shared admin copies, session guard route, pending-badge event

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Admin login, role picker button, admin tabs layout, Overview

**Files:**
- Create: `mobile/src/app/login/admin.tsx`
- Modify: `mobile/src/app/index.tsx` (third button)
- Modify: `mobile/src/app/_layout.tsx` (two `Stack.Screen` entries)
- Create: `mobile/src/app/admin/(tabs)/_layout.tsx`
- Create: `mobile/src/app/admin/(tabs)/overview.tsx`
- Modify: `tests/mobile-admin.test.mjs` (append source assertions)

**Interfaces:**
- Consumes: `resolveLoginErrorText` (`mobile/lib/registration-model.ts`), `overviewStats`, `AdminOrderRow` (`mobile/lib/admin-order-view.ts`), `formatPaise` (`mobile/lib/coupon-model.ts`), `apiFetch`, `ApiError` (`mobile/lib/api.ts`), `useRequireSession` (extended in Task 1), `BRAND`.
- Produces: routes `/login/admin`, `/admin/overview`, and the tabs layout file Task 3 extends with the Registrations tab.

- [ ] **Step 1: Write the failing source tests.** Append to `tests/mobile-admin.test.mjs`:

```js
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
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/mobile-admin.test.mjs`
Expected: the four new tests FAIL (files and button missing).

- [ ] **Step 3: Create `mobile/src/app/login/admin.tsx`** (full file):

```tsx
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "../../../lib/supabase";
import { BRAND } from "../../../theme";
import { resolveLoginErrorText } from "../../../lib/registration-model";

// Mirrors app/admin/login/page.tsx on the web: sign in, then verify users.role === "admin"; sign back out
// with an error on a mismatch. The role check is a courtesy: every admin API route re-checks the role.
export default function AdminLoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleLogin() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (signInError) {
        setError(resolveLoginErrorText(signInError.message, null));
        return;
      }
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user.id;
      const { data: profile } = await supabase.from("users").select("role").eq("id", userId).single();
      if (profile?.role !== "admin") {
        setError("This account is not an admin account.");
        await supabase.auth.signOut();
        return;
      }
      router.replace("/admin/overview");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.flex}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.heading}>Admin Log In</Text>
        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor={BRAND.colors.inkMuted}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor={BRAND.colors.inkMuted}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />
        {error && <Text style={styles.error}>{error}</Text>}
        <Pressable style={styles.button} onPress={handleLogin} disabled={submitting}>
          {submitting ? <ActivityIndicator color={BRAND.colors.surface} /> : <Text style={styles.buttonText}>Log In</Text>}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: BRAND.colors.background },
  container: {
    flexGrow: 1,
    backgroundColor: BRAND.colors.background,
    padding: 24,
    gap: 12,
    justifyContent: "center",
  },
  heading: {
    fontFamily: BRAND.fonts.heading,
    fontSize: 24,
    color: BRAND.colors.ink,
    marginBottom: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: BRAND.colors.inkMuted,
    borderRadius: BRAND.radius,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: BRAND.fonts.body,
    color: BRAND.colors.ink,
    backgroundColor: BRAND.colors.surface,
  },
  error: {
    color: BRAND.colors.dangerTextSafe,
    fontFamily: BRAND.fonts.body,
  },
  button: {
    backgroundColor: BRAND.colors.primaryTextSafe,
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
  },
  buttonText: {
    color: BRAND.colors.surface,
    fontFamily: BRAND.fonts.bodySemiBold,
    fontSize: 16,
  },
});
```

- [ ] **Step 4: Role picker.** In `mobile/src/app/index.tsx`, directly after the "Delivery Partner" `<Pressable ...>...</Pressable>` block add:

```tsx
      <Pressable
        style={[styles.button, styles.secondaryButton]}
        onPress={() => router.push("/login/admin")}
      >
        <Text style={styles.secondaryButtonText}>Admin</Text>
      </Pressable>
```

- [ ] **Step 5: Root layout.** In `mobile/src/app/_layout.tsx`, after the line `<Stack.Screen name="login/delivery" options={{ title: "Delivery Partner Log In" }} />` add:

```tsx
        <Stack.Screen name="login/admin" options={{ title: "Admin Log In" }} />
```
and after the `delivery/history` `Stack.Screen` line add:

```tsx
        <Stack.Screen name="admin/(tabs)" options={{ headerShown: false, title: "Admin" }} />
```

- [ ] **Step 6: Create `mobile/src/app/admin/(tabs)/_layout.tsx`** (Task 3 adds the second tab):

```tsx
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BRAND } from "../../../../theme";

// Admin bottom tabs. The native header is hidden, so the scene needs the top inset itself
// (same reason as the customer tabs layout).
export default function AdminTabsLayout() {
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        sceneStyle: { paddingTop: insets.top },
        tabBarActiveTintColor: BRAND.colors.ink,
        tabBarInactiveTintColor: BRAND.colors.inkMuted,
        tabBarStyle: {
          backgroundColor: BRAND.colors.surface,
          borderTopColor: BRAND.colors.inkMuted + "22",
        },
        tabBarLabelStyle: { fontFamily: BRAND.fonts.bodyMedium, fontSize: 11 },
      }}
    >
      <Tabs.Screen
        name="overview"
        options={{
          title: "Overview",
          headerShown: false,
          tabBarIcon: ({ color, size }) => <Ionicons name="grid-outline" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
```

- [ ] **Step 7: Create `mobile/src/app/admin/(tabs)/overview.tsx`** (full file):

```tsx
import { useCallback, useRef, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { supabase } from "../../../../lib/supabase";
import { apiFetch, ApiError } from "../../../../lib/api";
import { BRAND } from "../../../../theme";
import { useRequireSession } from "../../../../lib/use-require-session";
import { overviewStats, type AdminOrderRow } from "../../../../lib/admin-order-view";
import { formatPaise } from "../../../../lib/coupon-model";

// Mirrors app/admin/(portal)/dashboard/page.tsx on the web, read-only (no auto-acceptance toggle).
export default function AdminOverviewScreen() {
  useRequireSession("/login/admin");
  const router = useRouter();
  const [orders, setOrders] = useState<AdminOrderRow[]>([]);
  const [vendorCount, setVendorCount] = useState(0);
  const [pending, setPending] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    try {
      const [orderBody, storeBody] = await Promise.all([
        apiFetch<{ orders: AdminOrderRow[] }>("/api/admin/orders"),
        apiFetch<{ stores: unknown[] }>("/api/admin/restaurants"),
      ]);
      if (seq !== loadSeq.current) return;
      setOrders(orderBody.orders);
      setVendorCount(storeBody.stores.length);
      setError(null);
      try {
        const summary = await apiFetch<{ pending: number }>("/api/admin/registrations/summary");
        if (seq === loadSeq.current) setPending(summary.pending);
      } catch {
        // The tile keeps its previous value if the summary cannot be read.
      }
    } catch (err) {
      if (seq !== loadSeq.current) return;
      setError(err instanceof ApiError && err.message ? err.message : "Failed to load overview");
    } finally {
      if (seq === loadSeq.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/");
  }

  const stats = overviewStats(orders, vendorCount);

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void load();
          }}
        />
      }
    >
      <View style={styles.headerRow}>
        <Text style={styles.heading}>Overview</Text>
        <Pressable onPress={() => void signOut()} accessibilityRole="button">
          <Text style={styles.signOut}>Sign out</Text>
        </Pressable>
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      {loading ? (
        <ActivityIndicator color={BRAND.colors.primary} />
      ) : (
        <View style={styles.tiles}>
          <View style={[styles.tile, { backgroundColor: BRAND.colors.accentTextSafe }]}>
            <Text style={styles.tileLabel}>Registrations awaiting approval</Text>
            <Text style={styles.tileValue}>{pending}</Text>
          </View>
          <View style={[styles.tile, { backgroundColor: BRAND.colors.primaryTextSafe }]}>
            <Text style={styles.tileLabel}>Active orders</Text>
            <Text style={styles.tileValue}>{stats.activeOrders}</Text>
          </View>
          <View style={[styles.tile, { backgroundColor: BRAND.colors.ink }]}>
            <Text style={styles.tileLabel}>Vendors</Text>
            <Text style={styles.tileValue}>{stats.vendors}</Text>
          </View>
          <View style={[styles.tile, { backgroundColor: BRAND.colors.accentTextSafe }]}>
            <Text style={styles.tileLabel}>Revenue</Text>
            <Text style={styles.tileValue}>{formatPaise(stats.revenuePaise)}</Text>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 12, flexGrow: 1, backgroundColor: BRAND.colors.background },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  heading: { fontFamily: BRAND.fonts.heading, fontSize: 24, color: BRAND.colors.ink },
  signOut: { fontFamily: BRAND.fonts.bodySemiBold, color: BRAND.colors.ink, textDecorationLine: "underline" },
  error: { color: BRAND.colors.dangerTextSafe, fontFamily: BRAND.fonts.body },
  tiles: { gap: 12 },
  tile: { borderRadius: 16, padding: 16 },
  tileLabel: { color: "#ffffffcc", fontFamily: BRAND.fonts.body, fontSize: 14 },
  tileValue: { color: "#ffffff", fontFamily: BRAND.fonts.heading, fontSize: 30 },
});
```

- [ ] **Step 8: Run all checks**

Run: `node --test tests/*.test.mjs`; `cd mobile && npx tsc --noEmit && cd ..`; `npx eslint mobile/src/app/login/admin.tsx "mobile/src/app/admin/(tabs)/_layout.tsx" "mobile/src/app/admin/(tabs)/overview.tsx" mobile/src/app/index.tsx mobile/src/app/_layout.tsx`
Expected: all pass (597 + 4 = 601 tests).

- [ ] **Step 9: Commit**

```bash
git add mobile/src/app/login/admin.tsx mobile/src/app/index.tsx mobile/src/app/_layout.tsx "mobile/src/app/admin/(tabs)/_layout.tsx" "mobile/src/app/admin/(tabs)/overview.tsx" tests/mobile-admin.test.mjs
git commit -m "feat(approval-admin-phone): admin login, role picker button and Overview

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Registrations tab (Pending and History, Approve, Reject with reason, badge)

**Files:**
- Create: `mobile/src/app/admin/(tabs)/registrations.tsx`
- Modify: `mobile/src/app/admin/(tabs)/_layout.tsx` (second tab with a pending badge)
- Modify: `mobile/src/app/admin/(tabs)/overview.tsx` (tile opens Registrations)
- Modify: `tests/mobile-admin.test.mjs` (append source assertions)

**Interfaces:**
- Consumes: `RegistrationRow` (`mobile/lib/registration-admin.ts`), `cleanRejectionReason`, `REJECTION_REASON_MAX` (`mobile/lib/registration-model.ts`), `notifyAdminPendingChanged`, `onAdminPendingChanged` (`mobile/lib/admin-pending.ts`), `apiFetch`, `ApiError`, `useRequireSession`.
- Produces: route `/admin/registrations`.

- [ ] **Step 1: Write the failing source tests.** Append to `tests/mobile-admin.test.mjs`:

```js
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
  assert.match(screen, /\/approve/);
  assert.match(screen, /\/reject/);
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
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/mobile-admin.test.mjs`
Expected: the four new tests FAIL.

- [ ] **Step 3: Create `mobile/src/app/admin/(tabs)/registrations.tsx`** (full file):

```tsx
import { useCallback, useRef, useState } from "react";
import { ActivityIndicator, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { apiFetch, ApiError } from "../../../../lib/api";
import { BRAND } from "../../../../theme";
import { useRequireSession } from "../../../../lib/use-require-session";
import type { RegistrationRow } from "../../../../lib/registration-admin";
import { REJECTION_REASON_MAX, cleanRejectionReason } from "../../../../lib/registration-model";
import { notifyAdminPendingChanged } from "../../../../lib/admin-pending";

type Segment = "pending" | "history";

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : "");

// Mirrors app/admin/(portal)/registrations/page.tsx on the web, including its fixes: a loading state before
// the empty text, stale responses dropped, one decision at a time, tapping the active segment does nothing.
export default function AdminRegistrationsScreen() {
  useRequireSession("/login/admin");
  const [segment, setSegment] = useState<Segment>("pending");
  const [rows, setRows] = useState<RegistrationRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<RegistrationRow | null>(null);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const requestRef = useRef(0);
  const busyRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    const mine = ++requestRef.current;
    try {
      const body = await apiFetch<{ requests: RegistrationRow[] }>(`/api/admin/registrations?view=${segment}`);
      if (mine !== requestRef.current) return;
      setRows(body.requests);
      setError(null);
    } catch (err) {
      if (mine !== requestRef.current) return;
      setError(err instanceof ApiError && err.message ? err.message : "Failed to load registrations");
    } finally {
      if (mine === requestRef.current) {
        setLoaded(true);
        setRefreshing(false);
      }
    }
  }, [segment]);

  useFocusEffect(
    useCallback(() => {
      void load();
      const timer = setInterval(() => void load(), 30000);
      return () => clearInterval(timer);
    }, [load])
  );

  // Returns an error text, or null on success.
  async function decide(row: RegistrationRow, kind: "approve" | "reject", reasonText?: string): Promise<string | null> {
    if (busyRef.current) return "Another decision is still being saved.";
    busyRef.current = row.id;
    setBusyId(row.id);
    try {
      await apiFetch(`/api/admin/registrations/${row.id}/${kind}`, {
        method: "POST",
        body: kind === "reject" ? { reason: reasonText } : undefined,
      });
      notifyAdminPendingChanged();
      return null;
    } catch (err) {
      return err instanceof ApiError && err.message ? err.message : `Failed to ${kind}`;
    } finally {
      busyRef.current = null;
      setBusyId(null);
    }
  }

  async function approve(row: RegistrationRow) {
    setError(null);
    const failure = await decide(row, "approve");
    if (failure) setError(failure);
    await load();
  }

  function openReject(row: RegistrationRow) {
    setRejecting(row);
    setReason("");
    setReasonError(null);
  }

  async function submitReject() {
    if (!rejecting) return;
    const cleaned = cleanRejectionReason(reason);
    if (!cleaned.ok) {
      setReasonError(cleaned.error);
      return;
    }
    const failure = await decide(rejecting, "reject", cleaned.value);
    if (failure) {
      setReasonError(failure);
      await load();
      return;
    }
    setRejecting(null);
    await load();
  }

  return (
    <View style={styles.flex}>
      <View style={styles.headerBlock}>
        <Text style={styles.heading}>Registrations</Text>
        <View style={styles.segmentRow}>
          {(["pending", "history"] as const).map((tab) => (
            <Pressable
              key={tab}
              accessibilityRole="button"
              onPress={() => {
                if (tab === segment) return;
                setRows([]);
                setLoaded(false);
                setSegment(tab);
              }}
              style={[styles.segment, segment === tab && styles.segmentActive]}
            >
              <Text style={[styles.segmentText, segment === tab && styles.segmentTextActive]}>
                {tab === "pending" ? "Pending" : "History"}
              </Text>
            </Pressable>
          ))}
        </View>
        {error && <Text style={styles.error}>{error}</Text>}
      </View>

      <ScrollView
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load();
            }}
          />
        }
      >
        {!loaded ? (
          <Text style={styles.muted}>Loading registrations...</Text>
        ) : rows.length === 0 ? (
          <Text style={styles.muted}>
            {segment === "pending" ? "No registrations are waiting for approval." : "No decisions yet."}
          </Text>
        ) : (
          rows.map((row) => (
            <View key={row.id} style={styles.card}>
              <Text style={styles.name}>{row.fullName || "(no name)"}</Text>
              <Text style={styles.line}>{row.email}</Text>
              {row.phone ? <Text style={styles.line}>{row.phone}</Text> : null}
              <Text style={styles.line}>{[row.line1, row.city, row.pincode].filter(Boolean).join(", ")}</Text>
              <Text style={styles.small}>Registered {when(row.createdAt)}</Text>
              {segment === "history" ? (
                <>
                  <Text style={styles.line}>
                    {row.status === "approved" ? "Approved" : "Rejected"} {when(row.reviewedAt)}
                  </Text>
                  {row.reason ? <Text style={styles.line}>Reason: {row.reason}</Text> : null}
                </>
              ) : (
                <View style={styles.actions}>
                  <Pressable
                    accessibilityRole="button"
                    style={[styles.approve, busyId !== null && styles.disabled]}
                    disabled={busyId !== null}
                    onPress={() => void approve(row)}
                  >
                    {busyId === row.id ? <ActivityIndicator color="#fff" /> : <Text style={styles.approveText}>Approve</Text>}
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    style={[styles.reject, busyId !== null && styles.disabled]}
                    disabled={busyId !== null}
                    onPress={() => openReject(row)}
                  >
                    <Text style={styles.rejectText}>Reject</Text>
                  </Pressable>
                </View>
              )}
            </View>
          ))
        )}
      </ScrollView>

      <Modal visible={rejecting !== null} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setRejecting(null)}>
        <View style={styles.backdrop}>
          <View style={styles.dialog}>
            <Text style={styles.dialogTitle}>Reject {rejecting?.fullName || rejecting?.email}</Text>
            <Text style={styles.small}>The reason is emailed to the customer (up to {REJECTION_REASON_MAX} characters).</Text>
            <TextInput
              style={styles.reasonInput}
              placeholder="Reason"
              placeholderTextColor={BRAND.colors.inkMuted}
              multiline
              value={reason}
              onChangeText={(text) => {
                setReason(text);
                setReasonError(null);
              }}
            />
            {reasonError && <Text style={styles.error}>{reasonError}</Text>}
            <View style={styles.actions}>
              <Pressable accessibilityRole="button" style={styles.cancel} onPress={() => setRejecting(null)} disabled={busyId !== null}>
                <Text style={styles.rejectText}>Cancel</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                style={[styles.rejectFill, busyId !== null && styles.disabled]}
                onPress={() => void submitReject()}
                disabled={busyId !== null}
              >
                {busyId !== null ? <ActivityIndicator color="#fff" /> : <Text style={styles.approveText}>Reject</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: BRAND.colors.background },
  headerBlock: { padding: 16, gap: 10 },
  heading: { fontFamily: BRAND.fonts.heading, fontSize: 24, color: BRAND.colors.ink },
  segmentRow: { flexDirection: "row", gap: 8 },
  segment: { borderRadius: 999, borderWidth: 1, borderColor: BRAND.colors.inkMuted, paddingHorizontal: 16, paddingVertical: 6 },
  segmentActive: { backgroundColor: BRAND.colors.primaryTextSafe, borderColor: BRAND.colors.primaryTextSafe },
  segmentText: { fontFamily: BRAND.fonts.bodyMedium, color: BRAND.colors.ink },
  segmentTextActive: { color: "#fff" },
  error: { color: BRAND.colors.dangerTextSafe, fontFamily: BRAND.fonts.body },
  list: { padding: 16, paddingTop: 0, gap: 12 },
  muted: { color: BRAND.colors.inkMuted, fontFamily: BRAND.fonts.body },
  card: { backgroundColor: BRAND.colors.surface, borderRadius: 16, padding: 14, gap: 4 },
  name: { fontFamily: BRAND.fonts.bodySemiBold, fontSize: 16, color: BRAND.colors.ink },
  line: { fontFamily: BRAND.fonts.body, color: BRAND.colors.ink },
  small: { fontFamily: BRAND.fonts.body, color: BRAND.colors.inkMuted, fontSize: 12 },
  actions: { flexDirection: "row", gap: 10, marginTop: 8, justifyContent: "flex-end" },
  approve: { backgroundColor: BRAND.colors.accentTextSafe, borderRadius: 999, paddingHorizontal: 20, paddingVertical: 10, minWidth: 96, alignItems: "center" },
  approveText: { color: "#fff", fontFamily: BRAND.fonts.bodySemiBold },
  reject: { borderWidth: 1, borderColor: BRAND.colors.dangerTextSafe, borderRadius: 999, paddingHorizontal: 20, paddingVertical: 10 },
  rejectText: { color: BRAND.colors.dangerTextSafe, fontFamily: BRAND.fonts.bodySemiBold },
  rejectFill: { backgroundColor: BRAND.colors.dangerTextSafe, borderRadius: 999, paddingHorizontal: 20, paddingVertical: 10, minWidth: 96, alignItems: "center" },
  cancel: { borderWidth: 1, borderColor: BRAND.colors.inkMuted, borderRadius: 999, paddingHorizontal: 20, paddingVertical: 10 },
  disabled: { opacity: 0.5 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: 24 },
  dialog: { backgroundColor: BRAND.colors.surface, borderRadius: BRAND.radius, padding: 20, gap: 10 },
  dialogTitle: { fontFamily: BRAND.fonts.bodySemiBold, fontSize: 18, color: BRAND.colors.ink },
  reasonInput: {
    borderWidth: 1,
    borderColor: BRAND.colors.inkMuted,
    borderRadius: BRAND.radius,
    padding: 10,
    minHeight: 90,
    textAlignVertical: "top",
    fontFamily: BRAND.fonts.body,
    color: BRAND.colors.ink,
  },
});
```

- [ ] **Step 4: Add the Registrations tab and badge.** In `mobile/src/app/admin/(tabs)/_layout.tsx` replace the whole file with:

```tsx
import { useEffect, useState } from "react";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BRAND } from "../../../../theme";
import { apiFetch } from "../../../../lib/api";
import { onAdminPendingChanged } from "../../../../lib/admin-pending";

// Admin bottom tabs. The native header is hidden, so the scene needs the top inset itself
// (same reason as the customer tabs layout). The Registrations tab shows the pending count.
export default function AdminTabsLayout() {
  const insets = useSafeAreaInsets();
  const [pending, setPending] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      try {
        const summary = await apiFetch<{ pending: number }>("/api/admin/registrations/summary");
        if (!cancelled) setPending(summary.pending);
      } catch {
        // Not signed in as an admin (or offline): the badge simply stays as it was.
      }
    }
    void refresh();
    const timer = setInterval(() => void refresh(), 30000);
    const off = onAdminPendingChanged(() => void refresh());
    return () => {
      cancelled = true;
      clearInterval(timer);
      off();
    };
  }, []);

  return (
    <Tabs
      screenOptions={{
        sceneStyle: { paddingTop: insets.top },
        tabBarActiveTintColor: BRAND.colors.ink,
        tabBarInactiveTintColor: BRAND.colors.inkMuted,
        tabBarStyle: {
          backgroundColor: BRAND.colors.surface,
          borderTopColor: BRAND.colors.inkMuted + "22",
        },
        tabBarLabelStyle: { fontFamily: BRAND.fonts.bodyMedium, fontSize: 11 },
      }}
    >
      <Tabs.Screen
        name="overview"
        options={{
          title: "Overview",
          headerShown: false,
          tabBarIcon: ({ color, size }) => <Ionicons name="grid-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="registrations"
        options={{
          title: "Registrations",
          headerShown: false,
          tabBarBadge: pending > 0 ? pending : undefined,
          tabBarIcon: ({ color, size }) => <Ionicons name="people-outline" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
```

- [ ] **Step 5: Overview tile opens Registrations.** In `mobile/src/app/admin/(tabs)/overview.tsx` replace the first tile's `<View style={[styles.tile, { backgroundColor: BRAND.colors.accentTextSafe }]}>` (the one containing "Registrations awaiting approval") and its matching closing `</View>` with a `Pressable`:

```tsx
          <Pressable
            accessibilityRole="button"
            style={[styles.tile, { backgroundColor: BRAND.colors.accentTextSafe }]}
            onPress={() => router.navigate("/admin/registrations")}
          >
            <Text style={styles.tileLabel}>Registrations awaiting approval</Text>
            <Text style={styles.tileValue}>{pending}</Text>
          </Pressable>
```

- [ ] **Step 6: Run all checks**

Run: `node --test tests/*.test.mjs`; `cd mobile && npx tsc --noEmit && cd ..`; `npx eslint "mobile/src/app/admin/(tabs)/registrations.tsx" "mobile/src/app/admin/(tabs)/_layout.tsx" "mobile/src/app/admin/(tabs)/overview.tsx"`
Expected: all pass (601 + 4 = 605 tests). If `tsc` rejects `router.navigate("/admin/registrations")` as an unknown route (typed routes are off in this app, so it should not), report it instead of casting.

- [ ] **Step 7: Commit**

```bash
git add "mobile/src/app/admin/(tabs)/registrations.tsx" "mobile/src/app/admin/(tabs)/_layout.tsx" "mobile/src/app/admin/(tabs)/overview.tsx" tests/mobile-admin.test.mjs
git commit -m "feat(approval-admin-phone): Registrations tab with approve, reject reason and pending badge

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Live verification on the Android emulator (controller runs this, not a subagent)

**Files:** none changed (fixes, if any, get their own commits).

**Throwaway data (Vishal's decision, 2026-10-09):** customers use plus-addresses of `vishalsshah555@outlook.com` (for example `vishalsshah555+pa1@outlook.com`, `+pa2`, `+pa3`). Workflow 11 emails the admin account's own address on every new registration; to keep that inside Vishal's inbox, temporarily set the admin's auth email to `vishalsshah555@outlook.com` (`update auth.users set email=... where email='admin@foodhub.local'`), log in on the phone with it and the demo admin password from README, and RESTORE `admin@foodhub.local` afterwards. Registrations are created by `POST /api/auth/signup` on port 3000 (curl, real geocoder address "Linking Road", Mumbai, Maharashtra, 400050). One decision at a time; each decision emails the customer alias (live Gmail).

- [ ] **Step 1: Preconditions.** Supabase, the four dev servers on 3000-3003 and Metro on 8081 are up (`docker ps`, port check). Metro on 8081 serves the MAIN checkout, so run a SECOND Metro from this worktree: copy `mobile/.env` from the main checkout into `mobile/.env` here (git-ignored), check 8082 is free, start `CI=1 npx expo start --port 8082` from `mobile/`, boot the emulator with `.\scripts\start-emulator.ps1`, open `exp://10.0.2.2:8082`. Fill forms with `adb shell input text` and `keyevent 61` (Tab) between fields; Android Back with no keyboard open leaves the app.
- [ ] **Step 2: Walk the flows.** (1) Role picker shows Admin; (2) a customer account (approved `vishalsshah555+pa0@...` or any existing approved customer) on the Admin login shows "This account is not an admin account." and is signed out; (3) wrong password shows the GoTrue text; (4) admin login lands on Overview, tiles match the web Overview for the same data (compare with `GET /api/admin/orders` count via curl or the web page); (5) create two pending registrations by curl: the Registrations badge shows 2 within the poll or on refresh and the pending cards show name, email, phone, address; (6) Approve one: card disappears, badge drops, History shows it, the approval email arrives; (7) Reject the other: empty reason shows the inline error and sends no request; a reason saves, History shows it with the reason, the rejection email arrives; (8) tapping the active segment keeps the rows; (9) a repeated decision on an already decided request (decide via curl, then tap on a stale card) shows "This request was already decided."; (10) Sign out returns to the role picker.
- [ ] **Step 3: Cleanup.** Restore the admin email, delete every throwaway user (`delete from auth.users where email like 'vishalsshah555+pa%'`), remove the copied `mobile/.env`, stop only the processes you started (the 8082 Metro, the emulator).
- [ ] **Step 4: Record results** in the ledger (what passed, what was not driven).

---

### Task 5: Documentation and knowledge check

**Files:**
- Modify: `docs/Mobile_App_User_Manual.docx` and `docs/Mobile_App_User_Manual.pdf` (in place, python-docx)
- Check: `knowledge/**` for admin claims
- Modify: `CLAUDE.md`, `MEMORY.md`, `README.md`

- [ ] **Step 1: Phone manual** v4.14 -> v4.15: a new admin chapter or section (the Admin button on the start screen is for administrators only; admin login; Overview tiles; the Registrations tab, Pending and History, Approve, Reject with a required reason of up to 500 characters that is emailed to the customer; sign out) and the start-screen description updated to three buttons. Verify every sentence against the code. Edit in place with python-docx; renumber the hand-typed static TOC (convert with `C:\Program Files\LibreOffice\program\soffice.exe --headless --convert-to pdf`, read each chapter start page; some lines split the page number across runs); regenerate the PDF and confirm each TOC number. Text only.
- [ ] **Step 2: Knowledge check.** Grep `knowledge/` for statements that the phone app has only Customer and Delivery roles or that admins cannot use the phone; fix only what is wrong. Say whether a re-ingest is needed.
- [ ] **Step 3: Memory docs.** CLAUDE.md: a "Customer registration approval, piece 3" bullet (what shipped, files, live results, what was not driven, remaining iPhone check) and update the earlier piece 1/2 bullets' "piece 3 not started" wording. MEMORY.md: a piece 3 entry. README.md: one sentence under the registration approval section (the phone has an admin area for registrations).
- [ ] **Step 4: Verify and commit.**

Run: `node --test tests/*.test.mjs`; `git status --short`.

```bash
git add docs/Mobile_App_User_Manual.docx docs/Mobile_App_User_Manual.pdf CLAUDE.md MEMORY.md README.md
git add knowledge/<file>   # only if changed
git commit -m "docs(approval-admin-phone): phone manual v4.15, memory docs

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git push -u origin approval-admin-phone
```

Merging to `main` waits for Vishal's "Commit Work".

---

## Self-review (done)

- **Spec coverage:** role picker button, admin login with role check and friendly sign-in errors (Task 2); route group, tabs and session guard (Tasks 1-3); Overview tiles and sign out (Task 2); Registrations with Pending/History, polling, stale guard, busy guard, reject modal with shared validation, 409 text, badge (Task 3); shared copies with parity (Task 1); live checks incl. Gmail handling and cleanup (Task 4); docs (Task 5). No backend change anywhere.
- **Placeholder scan:** none; every code step carries full code.
- **Type consistency:** `RegistrationRow`, `AdminOrderRow`, `overviewStats`, `notifyAdminPendingChanged`, `onAdminPendingChanged`, `useRequireSession("/login/admin")` named identically across tasks.
