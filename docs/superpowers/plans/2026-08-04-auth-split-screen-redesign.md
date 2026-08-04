# Auth Split-Screen Redesign (Login + Signup) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign both `login` and `signup` as a unified two-column split screen (Figma-faithful brand panel + form panel), re-skinning the existing forms without changing any auth behavior.

**Architecture:** A shared `AuthSplitLayout` renders a left `AuthBrandPanel` (cream→haldi gradient, wordmark, inline brand SVG, context-aware heading + benefit chips) and a right form column. The shared `(auth)/layout.tsx` slims to a passthrough; both `login/page.tsx` and `signup/page.tsx` wrap their existing forms in `AuthSplitLayout`. Forms are re-skinned in place — same fields, same handlers, hot-pink primary CTAs.

**Tech Stack:** Next.js 14 App Router (server + client components), Tailwind (locked brand tokens: `cream`, `haldi`, `ink`, `hot-pink`, `hot-pink`), shadcn primitives (`Button`/`Input`/`Label`/`Separator`), Supabase auth (unchanged), Playwright e2e.

## Global Constraints

- **Branch:** `feat/homepage-signup-redesign` (already checked out; homepage WIP is uncommitted here — touch ONLY `src/app/(auth)/**` and `src/components/auth/**`, never `page.tsx`/`HomepageHero.tsx`/`marketplace/*`).
- **Brand tokens only** — no new colors/fonts. Gradient = `from-cream to-[#fff2d5]`. Wordmark serif = `font-serif`, hot-pink period. ([[baazar-palette-locked-m-plus]], [[baazar-typography-locked-ty-c-hybrid]])
- **Primary CTA = hot-pink.** The `Button` `primary` variant is INK by default (`bg-ink text-cream hover:bg-hot-pink`); force pink with `className="bg-hot-pink text-cream hover:bg-hot-pink/90"` exactly as `HomepageHero` does. Never edit `button.tsx`.
- **Behavior-preserving re-skin — DO NOT re-wire.** Preserve every A0 behavior (below). No new signup fields, no Apple OAuth, no schema/backend, no changes to Supabase calls, cookie round-trip, claim-token decode, or redirect handling.
- **Registry-first** ([[feedback-registry-first-components]]): only `@shadcn` registry is configured (core primitives, no split-auth block) — hand-roll the shell from primitives; do not add registries for this.
- **Illustration = inline SVG committed to repo.** No Figma export dependency (expires ~7 days; ~3 monthly MCP reads left).
- **Verification is visual + behavioral, not new unit tests.** Presentational components get NO fabricated unit tests. Each task verifies via `npm run typecheck`, `npm run lint`, existing Playwright e2e (`tests/e2e/auth.spec.ts`, `tests/e2e/bucket-j-customer-signup-email-password.spec.ts`), and a browser screenshot. Final task runs `npm run build`.
- **Commit per task.** End every commit message with the repo's Co-Authored-By + Claude-Session trailers.

### A0. Preserved behaviors (hard requirements)

**Signup** (`signup/signup-form.tsx` + `signup/page.tsx`): role picker (couple/vendor) hidden & locked when `prefilledRole` is set from a claim token; "Claiming your business" banner; Google OAuth via `signup_role` cookie round-trip; Full Name / Email / Password (min 8) / Terms gate; `return_to` handling; claim wins over role.

**Login** (`components/auth/LoginForm.tsx`): email/password sign-in; `redirect` query → destination; forgot-password link (preserves redirect); signup link (preserves return_to); Google OAuth; `Suspense` wrapper (uses `useSearchParams`).

---

## File structure

**Create:**

- `src/components/auth/auth-panel-content.ts` — variant → {heading, subcopy, chips} presets + `AuthPanelVariant` type.
- `src/components/auth/AuthBrandIllustration.tsx` — inline brand SVG (server component, no `'use client'`).
- `src/components/auth/AuthBrandPanel.tsx` — left panel (wordmark + illustration + heading + chips). Server component.
- `src/components/auth/AuthSplitLayout.tsx` — grid shell (brand panel + form column + mobile wordmark + footer links). Server component.

**Modify:**

- `src/app/(auth)/layout.tsx` — slim to passthrough.
- `src/app/(auth)/signup/page.tsx` — wrap `SignupForm` in `AuthSplitLayout`.
- `src/app/(auth)/signup/signup-form.tsx` — drop Card chrome, pink CTA, header copy.
- `src/app/(auth)/login/page.tsx` — wrap `LoginForm` in `AuthSplitLayout`.
- `src/components/auth/LoginForm.tsx` — drop Card chrome, pink CTA.

---

## Task 1: Shared brand panel (content + illustration + panel)

Build the three new left-panel building blocks. Unwired — no page renders them yet, so no visual change to live auth.

**Files:**

- Create: `src/components/auth/auth-panel-content.ts`
- Create: `src/components/auth/AuthBrandIllustration.tsx`
- Create: `src/components/auth/AuthBrandPanel.tsx`

**Interfaces:**

- Produces: `type AuthPanelVariant = 'couple' | 'vendor' | 'login'`; `AUTH_PANEL_CONTENT: Record<AuthPanelVariant, { heading: string; subcopy: string; chips: string[] }>`; `AuthBrandIllustration({ className }: { className?: string })`; `AuthBrandPanel({ variant }: { variant: AuthPanelVariant })`.

- [ ] **Step 1: Create the content presets**

`src/components/auth/auth-panel-content.ts`:

```ts
export type AuthPanelVariant = 'couple' | 'vendor' | 'login';

interface PanelContent {
  heading: string;
  subcopy: string;
  chips: string[];
}

export const AUTH_PANEL_CONTENT: Record<AuthPanelVariant, PanelContent> = {
  couple: {
    heading: 'Plan your celebration with Baazar',
    subcopy:
      'Chicago’s marketplace for culturally-focused wedding and event vendors — discover, compare, and book with confidence.',
    chips: ['Verified vendors', 'Secure 5% deposit', 'Your whole celebration in one place'],
  },
  vendor: {
    heading: 'Join Baazar as a Vendor',
    subcopy:
      'List your business on the marketplace built for cultural weddings and reach couples who are ready to book.',
    chips: [
      'No listing fees',
      'Verified leads with a pre-committed deposit',
      'A culture-focused vendor marketplace',
    ],
  },
  login: {
    heading: 'Welcome back',
    subcopy: 'Sign in to manage your bookings, quotes, and profile on Baazar.',
    chips: ['Verified vendors', 'Secure 5% deposit', 'Your whole celebration in one place'],
  },
};
```

- [ ] **Step 2: Create the inline brand illustration**

`src/components/auth/AuthBrandIllustration.tsx` — an on-brand celebratory mandap/arch with confetti in palette colors. No `'use client'`.

```tsx
/**
 * Inline brand illustration for the auth split-screen brand panel — a stylized
 * celebration arch (mandap) with confetti in the locked palette. Committed inline
 * so it never depends on the (expiring) Figma asset export. Decorative only.
 */
export function AuthBrandIllustration({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 400 320"
      className={className}
      role="img"
      aria-label="Baazar celebration illustration"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* soft ground */}
      <ellipse cx="200" cy="290" rx="150" ry="18" fill="#1a1a1a" opacity="0.06" />
      {/* arch */}
      <path
        d="M96 288 V150 a104 104 0 0 1 208 0 V288"
        fill="none"
        stroke="#1a1a1a"
        strokeWidth="10"
        strokeLinecap="round"
      />
      {/* arch inner fill */}
      <path d="M112 288 V150 a88 88 0 0 1 176 0 V288 Z" fill="#d1006c" opacity="0.08" />
      {/* haldi crown */}
      <path
        d="M150 96 a50 50 0 0 1 100 0"
        fill="none"
        stroke="#f2b92e"
        strokeWidth="8"
        strokeLinecap="round"
      />
      {/* pillars base flourish */}
      <circle cx="96" cy="288" r="12" fill="#1a1a1a" />
      <circle cx="304" cy="288" r="12" fill="#1a1a1a" />
      {/* hanging bells / diyas */}
      <circle cx="200" cy="150" r="14" fill="#d1006c" />
      <circle cx="200" cy="150" r="6" fill="#ffec1f" />
      {/* confetti */}
      <rect
        x="60"
        y="60"
        width="10"
        height="10"
        rx="2"
        fill="#f2b92e"
        transform="rotate(20 65 65)"
      />
      <rect
        x="330"
        y="80"
        width="10"
        height="10"
        rx="2"
        fill="#d1006c"
        transform="rotate(-15 335 85)"
      />
      <circle cx="70" cy="150" r="5" fill="#d1006c" />
      <circle cx="335" cy="160" r="5" fill="#f2b92e" />
      <rect
        x="140"
        y="40"
        width="8"
        height="8"
        rx="2"
        fill="#ffec1f"
        transform="rotate(30 144 44)"
      />
      <rect
        x="250"
        y="44"
        width="8"
        height="8"
        rx="2"
        fill="#f2b92e"
        transform="rotate(-25 254 48)"
      />
    </svg>
  );
}
```

- [ ] **Step 3: Create the brand panel**

`src/components/auth/AuthBrandPanel.tsx`. No `'use client'` (static). Inline the check glyph (no icon-lib dependency).

```tsx
import Link from 'next/link';
import { AUTH_PANEL_CONTENT, type AuthPanelVariant } from './auth-panel-content';
import { AuthBrandIllustration } from './AuthBrandIllustration';

/**
 * Left brand panel of the auth split-screen. Cream→haldi gradient, baazar. wordmark,
 * inline brand illustration, and a variant-aware heading + benefit chips.
 * Hidden below lg (AuthSplitLayout shows a compact wordmark on mobile instead).
 */
export function AuthBrandPanel({ variant }: { variant: AuthPanelVariant }) {
  const { heading, subcopy, chips } = AUTH_PANEL_CONTENT[variant];
  return (
    <aside className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-cream to-[#fff2d5] p-12 lg:flex">
      <Link href="/" className="relative z-10 inline-block">
        <p className="m-0 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink/60">
          MADE IN <span className="text-haldi">CHICAGO</span>
        </p>
        <span
          aria-label="Baazar"
          className="mt-1 block font-serif text-4xl font-extrabold lowercase leading-none tracking-[-0.025em] text-ink"
        >
          baazar
          <span aria-hidden className="text-hot-pink">
            .
          </span>
        </span>
      </Link>

      <div className="relative z-0 flex flex-1 items-center justify-center py-8">
        <AuthBrandIllustration className="w-full max-w-sm" />
      </div>

      <div className="relative z-10 max-w-md">
        <h2 className="m-0 font-serif text-3xl font-extrabold leading-[1.05] tracking-[-0.02em] text-ink">
          {heading}
        </h2>
        <p className="mt-3 text-base leading-[1.5] text-ink/70">{subcopy}</p>
        <ul className="mt-6 flex flex-col gap-2">
          {chips.map((c) => (
            <li key={c} className="flex items-center gap-2 text-sm font-medium text-ink">
              <svg
                aria-hidden
                viewBox="0 0 20 20"
                className="h-4 w-4 shrink-0 text-hot-pink"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4 10.5l4 4 8-9" />
              </svg>
              {c}
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
```

- [ ] **Step 4: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS (new files compile; no unused warnings).

- [ ] **Step 5: Commit**

```bash
git add src/components/auth/auth-panel-content.ts src/components/auth/AuthBrandIllustration.tsx src/components/auth/AuthBrandPanel.tsx
git commit -m "feat(auth): brand panel — content presets, inline illustration, panel"
```

---

## Task 2: Split shell + migrate both pages (structural)

Build `AuthSplitLayout`, slim `(auth)/layout.tsx`, and move BOTH login and signup into the split — forms unchanged inside for now. This is the atomic migration: after it, both pages render as split screens and all A0 behavior still works (form bodies untouched).

**Files:**

- Create: `src/components/auth/AuthSplitLayout.tsx`
- Modify: `src/app/(auth)/layout.tsx`
- Modify: `src/app/(auth)/login/page.tsx`
- Modify: `src/app/(auth)/signup/page.tsx`

**Interfaces:**

- Consumes: `AuthBrandPanel`, `AuthPanelVariant` (Task 1).
- Produces: `AuthSplitLayout({ variant, children }: { variant: AuthPanelVariant; children: React.ReactNode })`.

- [ ] **Step 1: Create the split layout**

`src/components/auth/AuthSplitLayout.tsx`. Includes the mobile-only compact wordmark (shown when the brand panel is hidden) and the footer legal links (absorbed from the old layout).

```tsx
import Link from 'next/link';
import { AuthBrandPanel } from './AuthBrandPanel';
import type { AuthPanelVariant } from './auth-panel-content';

/**
 * Two-column auth shell: left AuthBrandPanel (lg+), right form column. Stacks to a
 * single column under lg with a compact wordmark header above the form. Shared by
 * both /login and /signup so auth reads as one unified surface.
 */
export function AuthSplitLayout({
  variant,
  children,
}: {
  variant: AuthPanelVariant;
  children: React.ReactNode;
}) {
  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[1.05fr_0.95fr]">
      <AuthBrandPanel variant={variant} />

      <main className="flex flex-col bg-white">
        {/* Mobile-only compact wordmark (brand panel is hidden < lg) */}
        <div className="px-4 pt-10 text-center lg:hidden">
          <Link href="/" className="inline-block">
            <p className="m-0 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink/60">
              MADE IN <span className="text-haldi">CHICAGO</span>
            </p>
            <span
              aria-label="Baazar"
              className="mt-1 block font-serif text-4xl font-extrabold lowercase leading-none tracking-[-0.025em] text-ink"
            >
              baazar
              <span aria-hidden className="text-hot-pink">
                .
              </span>
            </span>
          </Link>
        </div>

        <div className="flex flex-1 items-center justify-center px-4 py-10 sm:px-8">
          <div className="w-full max-w-md">{children}</div>
        </div>

        <footer className="px-4 pb-8 text-center text-xs text-ink/50">
          <Link href="/terms" className="hover-pink-text">
            Terms
          </Link>
          <span className="mx-2">·</span>
          <Link href="/privacy" className="hover-pink-text">
            Privacy
          </Link>
          <span className="mx-2">·</span>
          <Link href="/" className="hover-pink-text">
            Back to baazar.io
          </Link>
        </footer>
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Slim the shared layout to a passthrough**

Replace the entire body of `src/app/(auth)/layout.tsx` with:

```tsx
/**
 * Auth route-group shell. The split-screen chrome (brand panel, wordmark, footer)
 * now lives in AuthSplitLayout, rendered per-page, so this is a passthrough.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
```

- [ ] **Step 3: Wrap the login page**

`src/app/(auth)/login/page.tsx`:

```tsx
import { LoginForm } from '@/components/auth/LoginForm';
import { AuthSplitLayout } from '@/components/auth/AuthSplitLayout';

export const dynamic = 'force-dynamic';

export default function LoginPage() {
  return (
    <AuthSplitLayout variant="login">
      <LoginForm />
    </AuthSplitLayout>
  );
}
```

- [ ] **Step 4: Wrap the signup page (role-aware variant)**

In `src/app/(auth)/signup/page.tsx`, add the import and wrap the returned `<SignupForm />`. The panel variant follows the server-resolved role (vendor for claims/`prefilledRole`, else couple). Keep all existing claim-decode logic unchanged.

Add import near the top:

```tsx
import { AuthSplitLayout } from '@/components/auth/AuthSplitLayout';
```

Replace the final `return (...)` with:

```tsx
return (
  <AuthSplitLayout variant={prefilledRole === 'vendor' ? 'vendor' : 'couple'}>
    <SignupForm returnTo={returnTo} prefilledRole={prefilledRole} claimContext={claimContext} />
  </AuthSplitLayout>
);
```

- [ ] **Step 5: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 6: Visual + behavior check in browser**

Run `npm run dev`, then load `/login` and `/signup` (and `/signup?return_to=%2Fclaim%2F...` if a claim token is handy). Confirm: split screen renders (brand panel left on desktop), form works, mobile (<1024px) stacks with the compact wordmark. Take screenshots to `.claude/screenshots/auth-split-*.png`.

- [ ] **Step 7: Run auth e2e (behavior gate)**

Run: `npm run test:e2e -- tests/e2e/auth.spec.ts tests/e2e/bucket-j-customer-signup-email-password.spec.ts`
Expected: PASS (login + signup flows unaffected by the structural swap).

- [ ] **Step 8: Commit**

```bash
git add src/components/auth/AuthSplitLayout.tsx "src/app/(auth)/layout.tsx" "src/app/(auth)/login/page.tsx" "src/app/(auth)/signup/page.tsx"
git commit -m "feat(auth): migrate login + signup to shared split-screen shell"
```

---

## Task 3: Signup form re-skin

Re-skin the signup form to sit in the form column: drop the outer Card chrome, hot-pink primary CTA, refreshed header copy. No field/handler changes.

**Files:**

- Modify: `src/app/(auth)/signup/signup-form.tsx`

**Interfaces:**

- Consumes: renders inside `AuthSplitLayout` form column (Task 2). Props unchanged (`returnTo`, `prefilledRole`, `claimContext`).

- [ ] **Step 1: Make the Card borderless (blend into the column)**

In `signup-form.tsx`, change the root `<Card className="border-ink/10 shadow-sm">` to:

```tsx
    <Card className="border-none bg-transparent p-0 shadow-none">
```

(The claim banner's `rounded-t-[inherit]` still works; it just has no visible card border now.)

- [ ] **Step 2: Refresh the header copy**

Leave the `CardTitle`/`CardDescription` logic, but confirm the non-claim title reads "Create your account" (already does) and keep the description. No change needed if already matching; otherwise set:

```tsx
<CardTitle className="font-spectral text-2xl text-ink">
  {claimContext ? 'Claim your listing' : 'Create your account'}
</CardTitle>
```

- [ ] **Step 3: Make the submit button hot-pink**

Change the submit `<Button type="submit" className="w-full" ...>` to force the pink treatment (default variant is ink):

```tsx
<Button
  type="submit"
  className="w-full bg-hot-pink text-cream hover:-translate-y-px hover:bg-hot-pink/90 hover:shadow-pink motion-reduce:hover:translate-y-0"
  disabled={loading || !agreed || !role}
>
  {submitLabel}
</Button>
```

- [ ] **Step 4: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 5: Browser check**

`npm run dev` → `/signup`. Confirm: borderless form in the white column, pink "Sign up as…" CTA, role picker + Google + terms all present and interactive. Screenshot to `.claude/screenshots/auth-signup-reskin.png`.

- [ ] **Step 6: Signup e2e (behavior gate)**

Run: `npm run test:e2e -- tests/e2e/bucket-j-customer-signup-email-password.spec.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(auth)/signup/signup-form.tsx"
git commit -m "feat(auth): re-skin signup form for split column + pink CTA"
```

---

## Task 4: Login form re-skin

Mirror the signup treatment on login so the two pages are visually identical minus the form body.

**Files:**

- Modify: `src/components/auth/LoginForm.tsx`

**Interfaces:**

- Consumes: renders inside `AuthSplitLayout` form column (Task 2). Signature unchanged (`React.ComponentPropsWithoutRef<'div'>`).

- [ ] **Step 1: Make the Card borderless**

In `LoginForm.tsx`, change `<Card className="border-ink/10 shadow-sm">` to:

```tsx
      <Card className="border-none bg-transparent p-0 shadow-none">
```

- [ ] **Step 2: Make the "Sign in" button hot-pink**

Change the submit `<Button type="submit" className="w-full" ...>` to:

```tsx
<Button
  type="submit"
  className="w-full bg-hot-pink text-cream hover:-translate-y-px hover:bg-hot-pink/90 hover:shadow-pink motion-reduce:hover:translate-y-0"
  disabled={loading}
>
  {loading ? 'Signing in…' : 'Sign in'}
</Button>
```

(Leave the Google `variant="outline"` button as-is.)

- [ ] **Step 3: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 4: Browser check**

`npm run dev` → `/login`. Confirm: borderless form in the white column, pink "Sign in" CTA, "Welcome back" brand panel on the left, forgot-password + signup links + Google intact. Screenshot to `.claude/screenshots/auth-login-reskin.png`.

- [ ] **Step 5: Login e2e (behavior gate)**

Run: `npm run test:e2e -- tests/e2e/auth.spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/auth/LoginForm.tsx
git commit -m "feat(auth): re-skin login form to match split column + pink CTA"
```

---

## Task 5: Full verification pass

Final gate before this ships in the homepage+auth PR.

**Files:** none (verification only).

- [ ] **Step 1: Production build**

Run: `npm run build`
Expected: PASS (no type errors, no build-time failures in the `(auth)` routes).

- [ ] **Step 2: Full auth e2e**

Run: `npm run test:e2e -- tests/e2e/auth.spec.ts tests/e2e/bucket-j-customer-signup-email-password.spec.ts`
Expected: PASS.

- [ ] **Step 3: Responsive + a11y spot-check**

In the browser at 375px, 768px, and 1440px widths: no horizontal scroll; brand panel hidden < lg with compact wordmark shown; form reachable and centered; tab order sane; check contrast of pink CTA text on pink. Screenshot each width.

- [ ] **Step 4: Confirm no cross-scope edits**

Run: `git diff --name-only main...HEAD` and confirm every changed file is under `src/app/(auth)/`, `src/components/auth/`, or `docs/superpowers/` — nothing in `marketplace/` / `page.tsx` / `HomepageHero.tsx` (those belong to the homepage track).

- [ ] **Step 5: Update memory**

Mark the auth track shipped-to-branch in `homepage_signup_figma_redesign.md` (commits, what landed). Note it merges as part of the unified homepage+auth PR when both tracks are ready; full CI green (incl. e2e) required before merge ([[merge-rule-full-ci-green]]).

---

## Self-review notes

- **Spec coverage:** A0 preserved behaviors → guarded in every task + e2e gates (Tasks 2/3/4/5). A1 shell → Tasks 1–2. A2 signup re-skin → Task 3. A3 login re-skin → Task 4. Illustration (inline SVG) → Task 1. Responsive/mobile wordmark → Task 2 (built) + Task 5 (verified). Registry-first → Global Constraints (hand-roll, only `@shadcn` configured).
- **Deferred (out of scope, per spec):** exact Figma handshake export, richer vendor fields, Apple OAuth, `DESIGN.md` pink-CTA amendment — none are tasks here.
- **Type consistency:** `AuthPanelVariant` + `AUTH_PANEL_CONTENT` (Task 1) consumed by `AuthBrandPanel` (Task 1) and `AuthSplitLayout` (Task 2) and page wrappers (Task 2) — names match throughout. `AuthBrandIllustration({ className })` signature consistent.
- **Placeholder scan:** every code step contains real, final code — no TBD/TODO.
