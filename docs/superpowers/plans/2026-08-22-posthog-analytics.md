# PostHog Product Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate PostHog (Cloud, US) for pageview + custom-event funnels and PII-masked session replay across the signup, vendor-onboarding, and booking funnels, dormant until a key is configured.

**Architecture:** A client `PostHogProvider` initializes `posthog-js` only when `NEXT_PUBLIC_POSTHOG_KEY` is set (mirrors the Sentry dormant pattern). Events flow through a same-origin `/ingest` reverse-proxy rewrite to PostHog Cloud. A typed `track()` helper wraps all custom events and never throws. Manual `$pageview` capture (App Router requirement) powers page-based funnels; hand-placed events cover non-page conversion moments.

**Tech Stack:** Next.js 14 App Router, `posthog-js`, TypeScript, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-22-posthog-analytics-design.md`

## Global Constraints

- **Dormant when unconfigured:** no `NEXT_PUBLIC_POSTHOG_KEY` → no `posthog.init`, and `track()` is a no-op. Nothing analytics-related may throw into app code.
- **Privacy:** `respect_dnt: true`; session replay `maskAllInputs: true`; identify by `user.id` only (never email as distinct_id).
- **US region:** ingest host `https://us.i.posthog.com`, assets `https://us-assets.i.posthog.com`, ui_host `https://us.posthog.com`.
- **Reverse proxy:** the browser sends to same-origin `/ingest`; only the Next rewrite knows the real PostHog host.
- **Config:** `next.config.js` is the ACTIVE config (its `images.remotePatterns` is in effect on prod); `next.config.mjs` is dead and gets deleted.
- Follow existing patterns: Sentry-style dormancy, `@/` import alias, tests under `src/__tests__/`.

---

### Task 1: Install `posthog-js` + env scaffolding

**Files:**

- Modify: `package.json` (dependency)
- Modify: `.env.example`

- [ ] **Step 1: Install the SDK**

Run: `npm install posthog-js`
Expected: `posthog-js` appears in `package.json` dependencies.

- [ ] **Step 2: Document env vars in `.env.example`**

Append:

```
# PostHog product analytics (dormant when unset). US project.
NEXT_PUBLIC_POSTHOG_KEY=
NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
```

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json .env.example
git commit -m "chore(analytics): add posthog-js + env scaffolding"
```

---

### Task 2: Consolidate `next.config` + add the `/ingest` reverse proxy

**Files:**

- Modify: `next.config.js` (add `rewrites`)
- Delete: `next.config.mjs` (dead — verified inactive; `.js` wins Next's config precedence and holds the real `images` config)

**Interfaces:**

- Produces: `/ingest/static/:path*` and `/ingest/:path*` rewrites the client SDK targets via `api_host: '/ingest'`.

- [ ] **Step 1: Add `rewrites()` to `next.config.js`**

In `next.config.js`, add a `rewrites` key to `nextConfig` (alongside `images`). `skipTrailingSlashRedirect` is required so PostHog's trailing-slash paths aren't redirected:

```js
const nextConfig = {
  skipTrailingSlashRedirect: true,
  images: {
    /* ...unchanged... */
  },
  async rewrites() {
    return [
      {
        source: '/ingest/static/:path*',
        destination: 'https://us-assets.i.posthog.com/static/:path*',
      },
      { source: '/ingest/:path*', destination: 'https://us.i.posthog.com/:path*' },
      {
        source: '/ingest/decide',
        destination: 'https://us.i.posthog.com/decide',
      },
    ];
  },
};
```

- [ ] **Step 2: Delete the dead config**

Run: `git rm next.config.mjs`

- [ ] **Step 3: Verify the build still loads config (images allowlist intact)**

Run: `npx next build --no-lint 2>&1 | head -30` (or `npm run build`)
Expected: build starts and completes; no "Invalid next.config" error. (If time-constrained, at minimum `node --input-type=module -e "import('./next.config.js').then(m=>console.log(!!m.default.images, typeof m.default.rewrites))"` prints `true function`.)

- [ ] **Step 4: Commit**

```bash
git add next.config.js
git rm next.config.mjs
git commit -m "fix(config): consolidate to single next.config.js + add posthog /ingest reverse proxy"
```

---

### Task 3: `track()` helper + event constants (TDD)

**Files:**

- Create: `src/lib/analytics/events.ts`
- Create: `src/lib/analytics/track.ts`
- Test: `src/__tests__/lib/analytics/track.test.ts`

**Interfaces:**

- Produces:
  - `ANALYTICS_EVENTS` — const map of event-name string literals.
  - `type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS]`.
  - `track(event: AnalyticsEvent, props?: Record<string, unknown>): void` — no-ops unless PostHog is loaded; never throws.

- [ ] **Step 1: Write the event constants**

`src/lib/analytics/events.ts`:

```ts
/** Canonical analytics event names. Keep values stable — funnels reference them. */
export const ANALYTICS_EVENTS = {
  SIGNUP_STARTED: 'signup_started',
  SIGNUP_SUBMITTED: 'signup_submitted',
  SIGNUP_CONFIRMATION_SENT: 'signup_confirmation_sent',
  ONBOARDING_STEP_COMPLETED: 'onboarding_step_completed',
  ONBOARDING_PUBLISH_BLOCKED: 'onboarding_publish_blocked',
  ONBOARDING_PUBLISHED: 'onboarding_published',
  VENDOR_PROFILE_VIEWED: 'vendor_profile_viewed',
  QUOTE_REQUEST_STARTED: 'quote_request_started',
  QUOTE_REQUEST_SUBMITTED: 'quote_request_submitted',
  DEPOSIT_STARTED: 'deposit_started',
  DEPOSIT_COMPLETED: 'deposit_completed',
} as const;

export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];
```

- [ ] **Step 2: Write the failing test**

`src/__tests__/lib/analytics/track.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { track } from '@/lib/analytics/track';
import { ANALYTICS_EVENTS } from '@/lib/analytics/events';

const capture = vi.fn();
vi.mock('posthog-js', () => ({
  default: {
    get __loaded() {
      return (globalThis as { __phLoaded?: boolean }).__phLoaded ?? false;
    },
    capture: (...args: unknown[]) => capture(...args),
  },
}));

describe('track', () => {
  beforeEach(() => {
    capture.mockClear();
    (globalThis as { __phLoaded?: boolean }).__phLoaded = false;
  });

  it('no-ops when PostHog is not loaded', () => {
    track(ANALYTICS_EVENTS.SIGNUP_STARTED);
    expect(capture).not.toHaveBeenCalled();
  });

  it('captures event + props when loaded', () => {
    (globalThis as { __phLoaded?: boolean }).__phLoaded = true;
    track(ANALYTICS_EVENTS.SIGNUP_SUBMITTED, { role: 'vendor' });
    expect(capture).toHaveBeenCalledWith('signup_submitted', { role: 'vendor' });
  });

  it('never throws if capture blows up', () => {
    (globalThis as { __phLoaded?: boolean }).__phLoaded = true;
    capture.mockImplementationOnce(() => {
      throw new Error('boom');
    });
    expect(() => track(ANALYTICS_EVENTS.ONBOARDING_PUBLISHED)).not.toThrow();
  });

  it('event constants are unique', () => {
    const vals = Object.values(ANALYTICS_EVENTS);
    expect(new Set(vals).size).toBe(vals.length);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/__tests__/lib/analytics/track.test.ts`
Expected: FAIL — `@/lib/analytics/track` not found.

- [ ] **Step 4: Write `src/lib/analytics/track.ts`**

```ts
import posthog from 'posthog-js';
import type { AnalyticsEvent } from './events';

/**
 * Capture a custom analytics event. No-ops unless posthog-js is initialized
 * (dormant when NEXT_PUBLIC_POSTHOG_KEY is unset) and never throws into callers.
 */
export function track(event: AnalyticsEvent, props?: Record<string, unknown>): void {
  try {
    if (typeof window === 'undefined') return;
    if (!posthog.__loaded) return;
    posthog.capture(event, props);
  } catch {
    // Analytics must never break the app.
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/__tests__/lib/analytics/track.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/analytics/events.ts src/lib/analytics/track.ts src/__tests__/lib/analytics/track.test.ts
git commit -m "feat(analytics): typed track() helper + event constants"
```

---

### Task 4: `PostHogProvider` (dormant init + pageview + identify) + wire into layout

**Files:**

- Create: `src/components/analytics/PostHogProvider.tsx`
- Create: `src/components/analytics/PostHogPageView.tsx`
- Create: `src/components/analytics/PostHogIdentify.tsx`
- Modify: `src/app/layout.tsx`

**Interfaces:**

- Consumes: `posthog-js`, `@/lib/supabase/client` (browser client — verify export name with `grep -rn "createBrowserClient\|createClient" src/lib/supabase/client.ts`).
- Produces: `<PostHogProvider>{children}</PostHogProvider>` wrapping the app.

- [ ] **Step 1: Write the provider (dormant when key unset)**

`src/components/analytics/PostHogProvider.tsx`:

```tsx
'use client';
import { useEffect } from 'react';
import posthog from 'posthog-js';
import { PostHogProvider as PHProvider } from 'posthog-js/react';
import { Suspense } from 'react';
import { PostHogPageView } from './PostHogPageView';
import { PostHogIdentify } from './PostHogIdentify';

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    if (!key || posthog.__loaded) return; // dormant when unconfigured
    posthog.init(key, {
      api_host: '/ingest',
      ui_host: 'https://us.posthog.com',
      capture_pageview: false, // captured manually (App Router)
      autocapture: true,
      respect_dnt: true,
      persistence: 'localStorage+cookie',
      person_profiles: 'always',
      session_recording: { maskAllInputs: true, maskTextSelector: '[data-ph-mask]' },
    });
  }, []);

  return (
    <PHProvider client={posthog}>
      <Suspense fallback={null}>
        <PostHogPageView />
      </Suspense>
      <PostHogIdentify />
      {children}
    </PHProvider>
  );
}
```

- [ ] **Step 2: Write the pageview tracker**

`src/components/analytics/PostHogPageView.tsx`:

```tsx
'use client';
import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import posthog from 'posthog-js';

export function PostHogPageView() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  useEffect(() => {
    if (!posthog.__loaded) return;
    let url = window.origin + pathname;
    const qs = searchParams.toString();
    if (qs) url += `?${qs}`;
    posthog.capture('$pageview', { $current_url: url });
  }, [pathname, searchParams]);
  return null;
}
```

- [ ] **Step 3: Write the identify effect**

First confirm the browser-client export: `grep -rn "export" src/lib/supabase/client.ts`. Then `src/components/analytics/PostHogIdentify.tsx` (adjust the import to the actual export):

```tsx
'use client';
import { useEffect } from 'react';
import posthog from 'posthog-js';
import { createClient } from '@/lib/supabase/client';

export function PostHogIdentify() {
  useEffect(() => {
    const supabase = createClient();
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (!posthog.__loaded) return;
      if (event === 'SIGNED_IN' && session?.user) {
        posthog.identify(session.user.id, {
          role: (session.user.user_metadata as { role?: string })?.role,
        });
      } else if (event === 'SIGNED_OUT') {
        posthog.reset();
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);
  return null;
}
```

- [ ] **Step 4: Wrap the app in `layout.tsx`**

In `src/app/layout.tsx`, import the provider and wrap the existing `NuqsAdapter` subtree:

```tsx
import { PostHogProvider } from '@/components/analytics/PostHogProvider';
// ...
<body className={/* unchanged */}>
  <PostHogProvider>
    <NuqsAdapter>
      {children}
      <Toaster richColors position="top-right" />
    </NuqsAdapter>
  </PostHogProvider>
</body>;
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. (If `posthog-js/react` types are missing, they ship with `posthog-js`; confirm the version installed exports `PostHogProvider` from `posthog-js/react`.)

- [ ] **Step 6: Commit**

```bash
git add src/components/analytics/ src/app/layout.tsx
git commit -m "feat(analytics): PostHog provider — dormant init, pageview capture, identify"
```

---

### Task 5: Instrument signup events

**Files:**

- Modify: `src/app/(auth)/signup/signup-form.tsx`

**Interfaces:**

- Consumes: `track`, `ANALYTICS_EVENTS` from Task 3.

- [ ] **Step 1: Add the import**

At the top of `signup-form.tsx`:

```ts
import { track } from '@/lib/analytics/track';
import { ANALYTICS_EVENTS } from '@/lib/analytics/events';
```

- [ ] **Step 2: Fire `signup_started` on mount**

Add a `useEffect(() => { track(ANALYTICS_EVENTS.SIGNUP_STARTED); }, [])` inside `SignupForm`.

- [ ] **Step 3: Fire `signup_submitted` + `signup_confirmation_sent`**

Locate the `supabase.auth.signUp` success branch (search `setSentTo`). On a successful signUp, before `setSentTo(email)`:

```ts
track(ANALYTICS_EVENTS.SIGNUP_SUBMITTED, { role: role ?? prefilledRole ?? 'unknown' });
```

And in the branch that flips to the "check your inbox" state (where `setSentTo` is called for confirmation):

```ts
track(ANALYTICS_EVENTS.SIGNUP_CONFIRMATION_SENT);
```

- [ ] **Step 4: Typecheck + commit**

Run: `npx tsc --noEmit` → no errors.

```bash
git add "src/app/(auth)/signup/signup-form.tsx"
git commit -m "feat(analytics): instrument signup funnel events"
```

---

### Task 6: Instrument onboarding publish events

**Files:**

- Modify: `src/components/onboarding/StepReview.tsx`

**Interfaces:**

- Consumes: `track`, `ANALYTICS_EVENTS`.

Note: per-step progression is captured automatically by `$pageview` on each `/dashboard/profile/setup/<step>` route (Task 4), so a separate `onboarding_step_completed` event is redundant and omitted in v1 — the step funnel is built from pageviews. Only the non-page publish moments are hand-placed here.

- [ ] **Step 1: Add imports to `StepReview.tsx`**

```ts
import { track } from '@/lib/analytics/track';
import { ANALYTICS_EVENTS } from '@/lib/analytics/events';
```

- [ ] **Step 2: Fire published / publish_blocked in `onPublish`**

In the existing `onPublish` handler: on `res.ok` (before `router.push`):

```ts
track(ANALYTICS_EVENTS.ONBOARDING_PUBLISHED);
```

On failure (in the `!res.ok` branch, after parsing `json`):

```ts
track(ANALYTICS_EVENTS.ONBOARDING_PUBLISH_BLOCKED, {
  reason: json.field ?? json.error ?? 'unknown',
});
```

- [ ] **Step 3: Typecheck + commit**

Run: `npx tsc --noEmit` → no errors.

```bash
git add src/components/onboarding/StepReview.tsx
git commit -m "feat(analytics): instrument onboarding publish events"
```

---

### Task 7: Instrument booking / quote events

**Files:**

- Modify: `src/components/marketplace/vendor-profile/VendorHero.tsx` (or the vendor profile client entry — locate the client component rendered on `/vendors/[slug]`)
- Modify: the quote-request trigger + submit (locate: `grep -rln "quote" src/components/booking src/components/marketplace`)
- Modify: `src/components/dashboard/DepositDialog.tsx`

**Interfaces:**

- Consumes: `track`, `ANALYTICS_EVENTS`.

- [ ] **Step 1: `vendor_profile_viewed`**

In the client component for the vendor profile page, add on mount:

```ts
useEffect(() => {
  track(ANALYTICS_EVENTS.VENDOR_PROFILE_VIEWED, { slug });
}, [slug]);
```

(If no existing client component receives `slug`, add the call in the existing client `VendorHero`/booking card that already has the vendor slug/id in props.)

- [ ] **Step 2: `quote_request_started` + `quote_request_submitted`**

Find the quote-request modal open handler and its submit-success. Add `track(ANALYTICS_EVENTS.QUOTE_REQUEST_STARTED)` on open and `track(ANALYTICS_EVENTS.QUOTE_REQUEST_SUBMITTED)` on a successful submit response.

- [ ] **Step 3: `deposit_started` + `deposit_completed`**

In `DepositDialog.tsx` (or the checkout entry found via `grep -rln "createCheckout\|deposit" src/components`), fire `deposit_started` when the deposit/checkout action begins and `deposit_completed` on success return.

- [ ] **Step 4: Typecheck + commit**

Run: `npx tsc --noEmit` → no errors.

```bash
git add src/components
git commit -m "feat(analytics): instrument booking + quote funnel events"
```

---

### Task 8: Privacy policy update + lightweight non-blocking notice

**Files:**

- Modify: `src/app/(marketplace)/privacy/page.tsx`
- Create: `src/components/analytics/AnalyticsNotice.tsx`
- Modify: `src/app/layout.tsx` (render the notice)

- [ ] **Step 1: Update the privacy policy**

In `privacy/page.tsx`, replace the line stating "no advertising, tracking, or analytics cookies at this time" with a paragraph disclosing: Baazar uses **PostHog** for product analytics and **session replay** (masked recordings — no form input values, no payment data); data is used to improve the product; users can opt out via browser Do-Not-Track / Global Privacy Control or by contacting `hello@baazar.io`.

- [ ] **Step 2: Write the notice component**

`src/components/analytics/AnalyticsNotice.tsx` — a `'use client'` dismissible bottom banner, `localStorage` key `baazar_analytics_notice_dismissed`, copy: "We use cookies & analytics to improve Baazar." + a link to `/privacy` ("Learn more") + a dismiss button. Non-blocking (renders regardless of analytics state; does not gate `posthog.init`). Match the brand palette (cream bg, ink text). Returns `null` until mounted (avoid hydration mismatch) and when already dismissed.

- [ ] **Step 3: Render it in `layout.tsx`**

Inside `<PostHogProvider>`, after `{children}`, add `<AnalyticsNotice />`.

- [ ] **Step 4: Typecheck + commit**

Run: `npx tsc --noEmit` → no errors.

```bash
git add "src/app/(marketplace)/privacy/page.tsx" src/components/analytics/AnalyticsNotice.tsx src/app/layout.tsx
git commit -m "feat(analytics): privacy policy disclosure + non-blocking analytics notice"
```

---

### Task 9: Full verification + manual smoke

**Files:** none (verification only)

- [ ] **Step 1: Full unit suite + typecheck**

Run: `npx vitest run` then `npx tsc --noEmit`
Expected: all green (new `track` tests included), no type errors.

- [ ] **Step 2: Dormancy check**

With `NEXT_PUBLIC_POSTHOG_KEY` unset, run `npm run dev` and load a page; confirm no `/ingest` requests fire and no console errors (analytics fully dormant).

- [ ] **Step 3: Manual smoke (requires a dev PostHog key)**

Set `NEXT_PUBLIC_POSTHOG_KEY` to a dev PostHog project key, `npm run dev`, then in a browser: load a page, submit signup. In PostHog → Activity, confirm `$pageview` and `signup_submitted` appear, and that a session recording is captured with inputs masked. (Can be deferred to the reviewer with the real key; note if skipped.)

- [ ] **Step 4: Final commit (if any verification tweaks)**

```bash
git commit -am "chore(analytics): verification pass" || true
```

---

## Suggested funnels to build in PostHog (post-merge, in the PostHog UI)

1. **Vendor onboarding:** `/signup` pageview → `signup_submitted{role:vendor}` → `signup_confirmation_sent` → first `/dashboard/profile/setup/*` pageview → per-step `/setup/<step>` pageviews → `onboarding_published`.
2. **Signup:** `signup_started` → `signup_submitted` → `signup_confirmation_sent`.
3. **Booking:** `vendor_profile_viewed` → `quote_request_started` → `quote_request_submitted`; deposit branch → `deposit_started` → `deposit_completed`.
