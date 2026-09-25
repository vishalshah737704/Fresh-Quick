# Uber Eats-style redesign — Piece 1: Design Token Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Fresh & Quick's 6 brand color tokens, swap its fonts (Geist → Inter + Poppins), and normalize card border-radius/shadow usage across all four role surfaces to match the approved Uber+sweetgreen blended theme, with zero page-layout changes.

**Architecture:** This is a pure token-and-primitive-styling change. Two files (`lib/branding.ts`, `app/globals.css`) are the source of truth for color and font tokens (per the project's own "branding stays isolated" rule); every component and page already consumes those tokens through Tailwind utility classes (`bg-brand-primary`, `text-brand-ink`, etc.) rather than hardcoded hex values, so updating the token definitions cascades automatically. The remaining work is a mechanical audit: shrinking a handful of `rounded-xl`/`rounded-2xl` card containers to the approved `rounded-lg` (8px), and removing `shadow-sm` from static (non-interactive) cards while keeping it only on the one genuinely interactive card component.

**Tech Stack:** Next.js 15 (App Router), Tailwind CSS v4 (`@theme inline` token block), `next/font/google`, TypeScript.

**Spec:** `docs/superpowers/specs/2026-09-25-uber-eats-design-refresh-design.md`

## Global Constraints

- Colors: `primary=#12140f`, `accent=#b6e02e`, `background=#faf9f4`, `surface=#ffffff`, `ink=#12140f`, `inkMuted=#6b6b62`.
- Accent (`#b6e02e`) must always pair with near-black text, never white — WCAG AA fails with white text on this lime.
- Card/input border radius: `8px` (Tailwind's `rounded-lg`). Button radius: `999px` (Tailwind's `rounded-full`) — already correct everywhere, no button changes needed.
- Card shadow: flat by default; the one approved subtle value (`0 3px 14px -6px rgba(0,0,0,0.18)`) only on featured/interactive cards (hover states), never as a static default.
- Body/UI font: Inter. Headline font (page `<h1>`s and section headers only): Poppins, weight 300.
- No page-layout, component-structure, or new-UI changes in this piece (that's pieces 2-6).
- `npm run build` must pass, not just `tsc --noEmit` (project rule — a missing Suspense boundary broke a prior phase's production build when only `tsc` was checked).

## Review Focus

- **Accent-as-large-fill regression**: every current `bg-brand-accent` usage is `/10` or `/5` opacity (confirmed via repo-wide grep before writing this plan) — a future edit that introduces a solid full-strength `bg-brand-accent` fill would violate the "used sparingly" rule and fail accent-on-white-text contrast. Task 4's audit step explicitly re-checks this.
- **White text on the new near-black primary**: `HeroSearch.tsx` renders white text on `bg-brand-primary` — confirm this still passes contrast after the swap from `#DC2626` to `#12140f` (it will — near-black is higher contrast than the old red — but Task 4 verifies visually rather than assuming).
- **Stale worktree copies drifting from `main`**: `.claude/worktrees/customer-flow-doordash-polish/lib/branding.ts` and its `app/globals.css` are untouched leftover worktree files containing the *old* token values. They are not part of the active build and Task 1 does not touch them — flagging so no one "fixes" them by mistake or gets confused finding old hex values there during the audit.
- **Geist Mono removal breaking a hidden consumer**: confirmed via grep that only `app/layout.tsx` and `app/globals.css` reference `--font-geist-mono`/`font-mono` — Task 2 removes it, and its own build step re-verifies nothing else referenced it.
- **`rounded-2xl` on the restaurant hero image** (`app/customer/restaurants/[id]/page.tsx:83`) is a large 64-unit-tall image container, not a small item card — shrinking its radius to 8px changes its visual proportions more noticeably than the smaller cards. Task 3 calls this out explicitly rather than treating it identically to the others.

---

## File Structure

No new files. All changes are to existing files:

- `lib/branding.ts` — 6 hex values (Task 1)
- `app/globals.css` — same 6 CSS custom properties, plus new font custom properties and a `.font-heading` utility class (Tasks 1-2)
- `app/layout.tsx` — font loader swap (Task 2)
- `components/HeroSearch.tsx` — apply `.font-heading` to its `<h1>`, drop `rounded-xl` → `rounded-lg` (Tasks 2-3)
- `components/RestaurantCard.tsx` — shadow behavior (interactive card, keeps subtle hover shadow) (Task 3)
- `components/OrderStatusTimeline.tsx` — `rounded-xl` → `rounded-lg` (Task 3)
- `app/vendor/orders/page.tsx`, `app/vendor/menu/page.tsx`, `app/delivery/dashboard/page.tsx`, `app/vendor/dashboard/page.tsx` — `rounded-xl` → `rounded-lg` on list-item cards (Task 3)
- `app/customer/login/page.tsx`, `app/customer/restaurants/[id]/page.tsx`, `app/customer/checkout/page.tsx`, `app/customer/orders/[id]/page.tsx` — `rounded-xl`/`rounded-2xl` → `rounded-lg`, and `shadow-sm` removed from static cards (Task 3)

---

### Task 1: Color token swap

**Files:**
- Modify: `lib/branding.ts`
- Modify: `app/globals.css:14-19`

**Interfaces:**
- Consumes: nothing (this is the root token source).
- Produces: `BRAND.theme.{primary,accent,background,surface,ink,inkMuted}` (consumed by any future server-side code that reads `lib/branding.ts` directly) and the CSS custom properties `--color-brand-{primary,accent,bg,surface,ink,ink-muted}` (consumed by every `bg-brand-*`/`text-brand-*`/`border-brand-*` Tailwind utility class already used throughout `app/` and `components/`).

- [ ] **Step 1: Update `lib/branding.ts`**

Replace the file's contents:

```typescript
export const BRAND = {
  name: "Fresh & Quick",
  theme: {
    primary: "#12140f",
    accent: "#b6e02e",
    background: "#faf9f4",
    surface: "#ffffff",
    ink: "#12140f",
    inkMuted: "#6b6b62",
  },
} as const;
```

- [ ] **Step 2: Update `app/globals.css`'s token block**

In the `@theme inline` block, replace lines 14-19:

```css
  /* Keep in sync with lib/branding.ts's BRAND.theme values. */
  --color-brand-primary: #12140f;
  --color-brand-accent: #b6e02e;
  --color-brand-bg: #faf9f4;
  --color-brand-surface: #ffffff;
  --color-brand-ink: #12140f;
  --color-brand-ink-muted: #6b6b62;
```

- [ ] **Step 3: Verify no old hex values remain**

Run: `grep -rn "DC2626\|F97316\|FFF8F0\|1F1B16\|6B6153" lib/ app/ components/ --include="*.ts" --include="*.tsx" --include="*.css"`
Expected: no output (empty). (This intentionally does not search `.claude/worktrees/` — see Review Focus note on the stale worktree copy.)

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: build succeeds with no errors.

- [ ] **Step 5: Commit**

```bash
git add lib/branding.ts app/globals.css
git commit -m "feat: swap brand color tokens to blended Uber/sweetgreen theme"
```

---

### Task 2: Typography swap (Inter + Poppins, drop Geist)

**Files:**
- Modify: `app/layout.tsx`
- Modify: `app/globals.css:1-33`
- Modify: `components/HeroSearch.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: the CSS custom property `--font-heading` and a `.font-heading` utility class (defined here, first consumed by `HeroSearch.tsx` in this same task, and available for pieces 2-6 to apply to any future section headings).

- [ ] **Step 1: Replace font loaders in `app/layout.tsx`**

Replace the full file contents:

```typescript
import type { Metadata } from "next";
import { Inter, Poppins } from "next/font/google";
import { BRAND } from "@/lib/branding";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const poppins = Poppins({
  variable: "--font-poppins",
  weight: ["300"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: BRAND.name,
  description: `${BRAND.name} — food delivery, ordering, and vendor management.`,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${poppins.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
```

- [ ] **Step 2: Update `app/globals.css`'s font tokens and body rule**

Replace lines 1-33 (everything from the top through the `body` rule) with:

```css
@import "tailwindcss";

:root {
  --background: #ffffff;
  --foreground: #171717;
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --font-sans: var(--font-inter);
  /* Keep in sync with lib/branding.ts's BRAND.theme values. */
  --color-brand-primary: #12140f;
  --color-brand-accent: #b6e02e;
  --color-brand-bg: #faf9f4;
  --color-brand-surface: #ffffff;
  --color-brand-ink: #12140f;
  --color-brand-ink-muted: #6b6b62;
}

@media (prefers-color-scheme: dark) {
  :root {
    --background: #0a0a0a;
    --foreground: #ededed;
  }
}

body {
  background: var(--color-brand-bg);
  color: var(--color-brand-ink);
  font-family: var(--font-sans), Arial, Helvetica, sans-serif;
}

/* Deliberately outside @theme: --font-poppins isn't registered as a Tailwind
   theme token, so this can't collide with an auto-generated Tailwind utility
   of the same name. */
.font-heading {
  font-family: var(--font-poppins), Arial, Helvetica, sans-serif;
  font-weight: 300;
}
```

- [ ] **Step 3: Apply `.font-heading` to the one existing hero heading**

In `components/HeroSearch.tsx`, change the `<h1>` from `font-bold` to the new heading font (weight 300 is set by the `.font-heading` class itself, so drop `font-bold`):

```typescript
import { BRAND } from "@/lib/branding";

export function HeroSearch() {
  return (
    <section className="rounded-lg bg-brand-primary px-6 py-10 text-white">
      <h1 className="font-heading text-3xl">{BRAND.name}</h1>
      <p className="mt-2 text-white/90">Fresh food, delivered fast.</p>
    </section>
  );
}
```

(Note: this also changes `rounded-xl` → `rounded-lg` per Task 3's radius rule — done here since it's the same line, rather than touching this file twice.)

- [ ] **Step 4: Verify Geist has no other consumers**

Run: `grep -rn "geist\|Geist" app/ components/ --include="*.ts" --include="*.tsx" --include="*.css"`
Expected: no output (empty) — confirms nothing outside the two files just edited referenced Geist.

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: build succeeds with no errors.

- [ ] **Step 6: Commit**

```bash
git add app/layout.tsx app/globals.css components/HeroSearch.tsx
git commit -m "feat: swap Geist for Inter/Poppins, add heading font utility"
```

---

### Task 3: Card radius and shadow normalization

**Files:**
- Modify: `components/RestaurantCard.tsx:24`
- Modify: `components/OrderStatusTimeline.tsx:29`
- Modify: `app/vendor/orders/page.tsx:95`
- Modify: `app/vendor/menu/page.tsx:153,182`
- Modify: `app/delivery/dashboard/page.tsx:186,204`
- Modify: `app/vendor/dashboard/page.tsx:59`
- Modify: `app/customer/login/page.tsx:61`
- Modify: `app/customer/restaurants/[id]/page.tsx:83,107`
- Modify: `app/customer/checkout/page.tsx:88,93,120`
- Modify: `app/customer/orders/[id]/page.tsx:127,133,149`

**Interfaces:**
- Consumes: nothing new (pure class-name edits on existing JSX).
- Produces: nothing new (no new exports/props) — this task only changes rendered class names.

- [ ] **Step 1: Shrink `rounded-xl`/`rounded-2xl` to `rounded-lg` on all list/card containers**

For each line below, replace `rounded-xl` or `rounded-2xl` with `rounded-lg` (leave every other class on the line unchanged):

`components/OrderStatusTimeline.tsx:29` — from:
```typescript
      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
```
to:
```typescript
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
```

`app/vendor/orders/page.tsx:95` — from:
```typescript
        <li key={order.id} className="rounded-xl border border-brand-ink-muted/10 bg-brand-surface p-3">
```
to:
```typescript
        <li key={order.id} className="rounded-lg border border-brand-ink-muted/10 bg-brand-surface p-3">
```

`app/vendor/menu/page.tsx:153` — from:
```typescript
      <div className="mb-6 flex flex-col gap-2 rounded-xl border border-brand-ink-muted/10 bg-brand-surface p-3">
```
to:
```typescript
      <div className="mb-6 flex flex-col gap-2 rounded-lg border border-brand-ink-muted/10 bg-brand-surface p-3">
```

`app/vendor/menu/page.tsx:182` — from:
```typescript
        <li key={item.id} className="flex flex-col gap-2 rounded-xl border border-brand-ink-muted/10 bg-brand-surface p-2">
```
to:
```typescript
        <li key={item.id} className="flex flex-col gap-2 rounded-lg border border-brand-ink-muted/10 bg-brand-surface p-2">
```

`app/delivery/dashboard/page.tsx:186` — from:
```typescript
          <li key={o.id} className="flex items-center justify-between rounded-xl border border-brand-ink-muted/10 bg-brand-surface p-2">
```
to:
```typescript
          <li key={o.id} className="flex items-center justify-between rounded-lg border border-brand-ink-muted/10 bg-brand-surface p-2">
```

`app/delivery/dashboard/page.tsx:204` — from:
```typescript
          <li key={o.id} className="flex flex-col gap-1 rounded-xl border border-brand-ink-muted/10 bg-brand-surface p-2">
```
to:
```typescript
          <li key={o.id} className="flex flex-col gap-1 rounded-lg border border-brand-ink-muted/10 bg-brand-surface p-2">
```

`app/vendor/dashboard/page.tsx:59` — from:
```typescript
      <div className="mb-4 flex items-center gap-3 rounded-xl border border-brand-ink-muted/10 bg-brand-surface p-3">
```
to:
```typescript
      <div className="mb-4 flex items-center gap-3 rounded-lg border border-brand-ink-muted/10 bg-brand-surface p-3">
```

`app/customer/login/page.tsx:61` — from:
```typescript
    <div className="mx-auto max-w-sm rounded-xl border border-brand-ink-muted/10 bg-brand-surface p-6 shadow-sm">
```
to (also drops `shadow-sm` — a static login card, not interactive, per the flat-by-default rule):
```typescript
    <div className="mx-auto max-w-sm rounded-lg border border-brand-ink-muted/10 bg-brand-surface p-6">
```

`app/customer/restaurants/[id]/page.tsx:83` — from:
```typescript
      <div className="relative mb-6 h-64 w-full overflow-hidden rounded-2xl bg-brand-accent/10 shadow-sm">
```
to (also drops `shadow-sm` — a decorative image block, not an interactive card):
```typescript
      <div className="relative mb-6 h-64 w-full overflow-hidden rounded-lg bg-brand-accent/10">
```

`app/customer/restaurants/[id]/page.tsx:107` — from:
```typescript
      <div className="flex flex-col divide-y divide-brand-ink-muted/10 rounded-xl border border-brand-ink-muted/10 bg-brand-surface">
```
to:
```typescript
      <div className="flex flex-col divide-y divide-brand-ink-muted/10 rounded-lg border border-brand-ink-muted/10 bg-brand-surface">
```

`app/customer/checkout/page.tsx:88` — from:
```typescript
          <section className="rounded-xl border border-brand-ink-muted/10 bg-brand-surface p-4 shadow-sm">
```
to (also drops `shadow-sm` — static form section):
```typescript
          <section className="rounded-lg border border-brand-ink-muted/10 bg-brand-surface p-4">
```

`app/customer/checkout/page.tsx:93` — same substitution as line 88 (identical class string):
```typescript
          <section className="rounded-lg border border-brand-ink-muted/10 bg-brand-surface p-4">
```

`app/customer/checkout/page.tsx:120` — same substitution as line 88:
```typescript
          <section className="rounded-lg border border-brand-ink-muted/10 bg-brand-surface p-4">
```

`app/customer/orders/[id]/page.tsx:127` — from:
```typescript
          <section className="rounded-xl border border-brand-ink-muted/10 bg-brand-surface p-4 shadow-sm">
```
to (also drops `shadow-sm`):
```typescript
          <section className="rounded-lg border border-brand-ink-muted/10 bg-brand-surface p-4">
```

`app/customer/orders/[id]/page.tsx:133` — from:
```typescript
            <div className="flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-brand-ink-muted/25 bg-brand-ink-muted/5 px-4 py-8 text-center">
```
to:
```typescript
            <div className="flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-brand-ink-muted/25 bg-brand-ink-muted/5 px-4 py-8 text-center">
```

`app/customer/orders/[id]/page.tsx:149` — from:
```typescript
          <section className="rounded-xl border border-brand-ink-muted/10 bg-brand-surface p-4 shadow-sm text-sm text-brand-ink-muted">
```
to (also drops `shadow-sm`):
```typescript
          <section className="rounded-lg border border-brand-ink-muted/10 bg-brand-surface p-4 text-sm text-brand-ink-muted">
```

- [ ] **Step 2: Update `RestaurantCard.tsx` to the approved subtle-on-hover-only shadow**

This is the one genuinely interactive card (a clickable `<Link>` with a hover state) — per spec it's the one place a shadow is allowed, but only on hover, not as a static default. Replace line 24:

From:
```typescript
      className="block overflow-hidden rounded-xl border border-brand-ink-muted/10 bg-brand-surface shadow-sm transition-shadow hover:shadow-md"
```
To:
```typescript
      className="block overflow-hidden rounded-lg border border-brand-ink-muted/10 bg-brand-surface shadow-none transition-shadow hover:shadow-[0_3px_14px_-6px_rgba(0,0,0,0.18)]"
```

- [ ] **Step 3: Verify no unintended `rounded-xl`/`rounded-2xl` remain outside their approved uses**

Run: `grep -rn "rounded-xl\|rounded-2xl\|rounded-3xl" app/ components/`
Expected: no output (empty). (If any appear, they were missed above — add the same substitution.)

- [ ] **Step 4: Verify no static card kept a default shadow**

Run: `grep -rn "shadow-sm\|shadow-md\|shadow-lg" app/ components/`
Expected: only `components/CartPanel.tsx:17` (`shadow-lg` — persistent bottom cart bar, UI chrome not a card, intentionally kept) and `components/CartConflictDialog.tsx:12` (`shadow-lg` — modal dialog overlay, intentionally kept per spec's cards-only scope). If any other line appears, it was missed above.

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: build succeeds with no errors.

- [ ] **Step 6: Commit**

```bash
git add components/RestaurantCard.tsx components/OrderStatusTimeline.tsx app/vendor/orders/page.tsx app/vendor/menu/page.tsx app/delivery/dashboard/page.tsx app/vendor/dashboard/page.tsx app/customer/login/page.tsx "app/customer/restaurants/[id]/page.tsx" app/customer/checkout/page.tsx "app/customer/orders/[id]/page.tsx"
git commit -m "style: normalize card radius to 8px and drop static-card shadows"
```

---

### Task 4: Full 4-surface visual smoke test

**Files:**
- None modified — this task is verification only, using Playwright against the running dev server.

**Interfaces:**
- Consumes: the completed token/font/shape changes from Tasks 1-3.
- Produces: a pass/fail confirmation this plan's Testing Plan requires before the piece is considered done.

- [ ] **Step 1: Start the app**

Follow `docs/DEPLOYMENT.md` section 3 to ensure Docker Desktop is running and `.env.local` is populated, then run `npm run app:start` (or `npm run app:start:dev` for a dev-mode server if iterating). Confirm `http://localhost:3000` returns HTTP 200 before proceeding.

- [ ] **Step 2: Screenshot each surface at desktop width**

Using the Playwright MCP browser tool (`browser_resize` to 1280×800, then `browser_navigate` + `browser_take_screenshot` for each), capture:
- `/customer` (home page — confirms `HeroSearch`'s new cream background, near-black primary banner, heading font, and card radius)
- `/customer/restaurants/[any-seeded-id]` (confirms the hero image block and menu list card radius)
- `/vendor/dashboard` (after logging in with `vendor.demo@foodhub.local` / `demo1234`)
- `/delivery/dashboard` (after logging in with any delivery test account)
- `/admin/login` and, if reachable, `/admin/dashboard` (`admin@foodhub.local` / `admin-demo-password`)

- [ ] **Step 3: Screenshot each surface at mobile width**

`browser_resize` to 390×844, repeat the same five navigations and screenshots.

- [ ] **Step 4: Visually confirm no regressions**

For each of the 10 screenshots, confirm: text is legible against its background (no accent-colored text on an accent background, no muted text that's unreadably low-contrast on the new cream `#faf9f4`), the cream background renders (not the old `#FFF8F0` peach or stark white), and card corners read as noticeably less rounded than before (8px vs. the old 12-16px) without looking sharp/harsh.

- [ ] **Step 5: Confirm the accent-as-large-fill Review Focus item**

Run: `grep -rn "bg-brand-accent" app/ components/ --include="*.tsx"`
Expected: every match includes an opacity suffix (`/5`, `/10`, etc.) — no bare `bg-brand-accent` without a suffix. This was true before this plan's changes (confirmed during planning) and none of Tasks 1-3 touched accent-background usage, so this step is a final confirmation, not expected to find anything new.

- [ ] **Step 6: Commit (if any follow-up fixes were needed in Step 4)**

If Step 4 found a real regression, fix it, re-screenshot the affected surface, and commit:
```bash
git add -A
git commit -m "fix: address visual regression found in design-refresh smoke test"
```
If no regressions were found, skip this step — there is nothing to commit.
