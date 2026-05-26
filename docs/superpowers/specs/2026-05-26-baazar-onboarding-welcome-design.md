# Baazar Onboarding Welcome — Couple + Vendor Flows Design Spec

**Date:** 2026-05-26
**Components:** Two role-specific welcome/explanation/personalize flows built on the cult-ui Onboarding primitive
**Status:** Approved direction; ready for implementation plan
**Branch:** `feat/baazar-onboarding-welcome`

---

## Goal

Fill the onboarding gap that the user identified: couples currently have zero post-signup explanation (signup → dashboard, nothing in between) and vendors have the existing Sub-project B data-collection wizard but no welcome/explanation surface before/around it. Install the [cult-ui Onboarding primitive](https://cult-ui.com/r/onboarding.json) via shadcn CLI, then build two role-specific composed flows (`CoupleOnboarding`, `VendorOnboarding`) that auto-trigger on first dashboard visit (dismissible after). Both flows follow the same 3-step structure: Welcome features → Personalize → Tips. The vendor flow's "Personalize" step pre-fills the existing wizard's category so vendors don't re-pick. Completion (or skip) is persisted as `users.onboarding_completed_at` so the modal never auto-fires twice.

## Non-goals

- **Replacing Sub-project B's data-collection wizard.** That wizard (StepBasics → StepLocation → StepOnline → StepPortfolio → StepPaymentMode → StepReview) stays exactly as-is at `/dashboard/profile/setup`. The new onboarding component is a PRE-wizard welcome/explanation, not a replacement.
- **Onboarding for Bridal Wear / Decor / Venue vendors.** Those three categories ship as "Coming Soon" until the flat-fee listing sub-project. Vendor onboarding's category picker shows only the 10 commission-active categories.
- **Drip email after onboarding completion.** No "welcome email series" / Resend wire-up here. Persisting `onboarding_data` is enough Day 1; future Resend sub-project can read it later.
- **A/B variants of onboarding content.** Single locked flow per role. Variants are a future analytics-driven follow-up.
- **Custom illustrations or video assets.** Day 1 uses lucide icons + tasteful static graphics (potentially simple SVG illustrations or Unsplash photos for the feature cards). Bespoke illustration is deferred.
- **Per-step analytics.** No per-step drop-off tracking Day 1. Just a single `onboarding_completed_at` timestamp + skip-tracking. Analytics is a future Sub-project.
- **Account-menu "Welcome tour" reopen link.** Out of scope Day 1. The modal only auto-fires on first dashboard visit; if dismissed/skipped, the only way to reopen is to clear `onboarding_completed_at` manually. Adding a reopen link is a follow-up.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  Signup → role select → Supabase Auth sign up → /dashboard   │
├──────────────────────────────────────────────────────────────┤
│  /dashboard renders OnboardingGate (client component)        │
│  ├─ if user.onboarding_completed_at IS NULL                  │
│  │   ├─ if user.role === 'couple'  → <CoupleOnboarding />    │
│  │   └─ if user.role === 'vendor'  → <VendorOnboarding />    │
│  └─ else: no modal                                            │
├──────────────────────────────────────────────────────────────┤
│  Onboarding modal (3 steps, dismissible):                    │
│   1. Welcome features (3 feature cards in carousel)          │
│   2. Personalize (role-specific questions)                   │
│   3. Tips (3 tips + image)                                   │
│                                                               │
│  On Complete OR Skip:                                         │
│   POST /api/users/onboarding-complete                        │
│   ├─ Body: { skipped: boolean, data: object | null }         │
│   └─ Sets users.onboarding_completed_at + onboarding_data    │
│                                                               │
│  For vendor: data.category also writes to vendor_profiles    │
│   so the wizard at /dashboard/profile/setup pre-fills it     │
└──────────────────────────────────────────────────────────────┘
```

### Component decomposition

| File                                                                  | Action      | Responsibility                                                                                                                                                                                                                                                             |
| --------------------------------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/components/ui/onboarding.tsx`                                    | **Install** | Cult-ui Onboarding primitives via `npx shadcn@latest add https://cult-ui.com/r/onboarding.json`. Provides: `Onboarding` shell, `Onboarding.Step`, `Onboarding.StepIndicator`, `Onboarding.Navigation`, `ChoiceGroup`, `FeatureCarousel`, `TipsList`, `useOnboarding` hook. |
| `src/components/onboarding/CoupleOnboarding.tsx`                      | **Create**  | Client component. Composes the primitives with couple-specific content (3 features, event-date + categories questions, 3 tips). M+ token adaptation.                                                                                                                       |
| `src/components/onboarding/VendorOnboarding.tsx`                      | **Create**  | Client component. Composes the primitives with vendor-specific content (3 features, category + years-in-business questions, 3 tips).                                                                                                                                       |
| `src/components/onboarding/OnboardingGate.tsx`                        | **Create**  | Client component rendered inside the dashboard layout. Reads user role + `onboarding_completed_at`; renders the appropriate flow as a modal when null.                                                                                                                     |
| `src/lib/onboarding/welcome-data.ts`                                  | **Create**  | Pure data: `COUPLE_FEATURES`, `COUPLE_TIPS`, `VENDOR_FEATURES`, `VENDOR_TIPS`, plus typed schemas for the personalize-step answers.                                                                                                                                        |
| `src/__tests__/lib/onboarding/welcome-data.test.ts`                   | **Create**  | TDD tests for the data shape (length, required fields, role-scoping invariants).                                                                                                                                                                                           |
| `src/lib/onboarding/onboarding-complete-validation.ts`                | **Create**  | Zod schema for the POST body to `/api/users/onboarding-complete`. Supports couple data (event_date, categories) and vendor data (category, years_in_business) variants.                                                                                                    |
| `src/__tests__/lib/onboarding/onboarding-complete-validation.test.ts` | **Create**  | TDD tests for the zod schema.                                                                                                                                                                                                                                              |
| `src/app/api/users/onboarding-complete/route.ts`                      | **Create**  | POST handler. Auth-gated. Updates `users.onboarding_completed_at` + `users.onboarding_data`. For vendors: also upserts `vendor_profiles.category`.                                                                                                                         |
| `src/__tests__/api/users-onboarding-complete.test.ts`                 | **Create**  | TDD tests for the route (200 on success, 401 anon, 400 invalid body, vendor category write side-effect).                                                                                                                                                                   |
| `supabase/migrations/00043_users_onboarding.sql`                      | **Create**  | Adds `onboarding_completed_at: timestamptz` + `onboarding_data: jsonb` columns to `users`.                                                                                                                                                                                 |
| `src/types/database.types.ts`                                         | **Modify**  | Add the two new columns to the `users` Row / Insert / Update unions.                                                                                                                                                                                                       |
| `src/app/dashboard/layout.tsx` (or wherever dashboard shell lives)    | **Modify**  | Mount `<OnboardingGate />` in the dashboard layout so it renders on every dashboard route.                                                                                                                                                                                 |
| `DESIGN.md`                                                           | **Modify**  | Add `onboarding-welcome:` entry to `components:` block.                                                                                                                                                                                                                    |

---

## Onboarding primitive install (cult-ui)

The primitives are installed via:

```bash
npx shadcn@latest add https://cult-ui.com/r/onboarding.json
```

This creates `src/components/ui/onboarding.tsx` with the exports referenced in the pasted demo:

- `Onboarding` (the shell with internal context)
- `Onboarding.Step` (per-step content slot)
- `Onboarding.StepIndicator` (the dot/pill progress indicator)
- `Onboarding.Navigation` (Back / Next / Complete buttons)
- `ChoiceGroup` + `ChoiceGroup.Item` (radio-style grid for role/goal questions)
- `FeatureCarousel` + `FeatureCarousel.Item` (feature list with carousel state)
- `TipsList` + `TipsList.Item` (numbered tips with optional image slot)
- `useOnboarding()` hook (returns `currentStep`, `stepValue`, `setStepValue`, `handleNext`, `handleBack`, etc.)

### M+ token adaptation

Cult-ui defaults to generic shadcn tokens (`border-primary`, `text-foreground`, `bg-muted`). Our flows wrap the primitives with the right classNames to override:

| Cult-ui default                                    | Baazar M+ override                                                                    |
| -------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `border-primary/30 bg-primary/10` (selected state) | `border-indigo/30 bg-indigo/10` (or `border-hot-pink/30 bg-hot-pink/10` for emphasis) |
| `text-foreground`                                  | `text-ink`                                                                            |
| `text-muted-foreground`                            | `text-ink-muted`                                                                      |
| `bg-muted`                                         | `bg-cream-soft`                                                                       |
| `border-border`                                    | `border-hairline`                                                                     |
| Default font                                       | `font-serif` (Spectral) for headers, default body inherits Schibsted                  |

The primitive shouldn't need modification — only the consuming flows (`CoupleOnboarding` / `VendorOnboarding`) pass M+ classNames.

---

## Couple flow — `CoupleOnboarding`

Modal shell uses Radix Dialog (the cult-ui pattern). Backdrop `bg-ink/50` scrim. Modal content `bg-cream` with `border-hairline` and `rounded-lg`.

### Step 1: Welcome + Features

**Header**:

- Title: `Welcome to Baazar` (Spectral, weight 700, tracking tight)
- Description: `Chicago's marketplace for cultural wedding vendors. Here's what you can do.` (ink-muted)
- StepIndicator: 3 dots (active dot = ink, others = hairline)

**Body**: `FeatureCarousel` (vertical list on left, image preview on right).

3 feature cards:

| ID       | Icon (lucide) | Title                   | Description                                                                                               | Image                                            |
| -------- | ------------- | ----------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `browse` | `Search`      | Browse verified vendors | Search Chicago vendors curated for cultural weddings — photographers, mehndi artists, caterers, and more. | `/component-images/onboarding/couple-browse.png` |
| `save`   | `Heart`       | Save & compare          | Heart the vendors you love. Compare packages, pricing, and availability side-by-side.                     | `/component-images/onboarding/couple-save.png`   |
| `book`   | `ShieldCheck` | Book with confidence    | Small hold deposits via Stripe. Full refund if the vendor doesn't confirm within 72 hours.                | `/component-images/onboarding/couple-book.png`   |

Selected feature shows description text + image preview. Click any card to highlight. Auto-rotate disabled (user-controlled).

### Step 2: Personalize

**Header**:

- Title: `Tell us about your event`
- Description: `Two quick questions so we can show you the most relevant vendors.`

**Body**: Two sub-questions (Q1 → Q2 progression via internal state, same pattern as the demo's HeadlessRoleStep).

**Q1: Event date** (or "still planning")

```
When's the big day?
[ Date picker ─ <DatePicker> primitive from src/components/ui/date-picker.tsx ]
[ Still figuring it out ─ skip button ]
```

Use the existing `<DatePicker>` (shipped PR #22). On select, store ISO date. "Still figuring it out" button skips and advances to Q2 with `event_date: null`.

**Q2: Categories prioritizing** (multi-select, 3-5)

```
Which vendors are top priority for you? (pick 3-5)
[ Grid of 10 commission-active categories with icons ]
```

Use `ChoiceGroup` with `multiSelect`-style logic (cult-ui's primitive may need a small wrapper for multi-select — if not natively supported, build a local variant `ChoiceGroupMulti` that tracks an array). Show all 10 commission-active categories (Photography, Videography & Content, Mehndi, Hair & Makeup, DJ, Catering, Carts, Live Music & Performance, Photobooth, Invitations). **NOT shown**: Bridal Wear, Decor, Venue (the 3 flat-fee/Coming Soon categories).

Selection range: minimum 1, maximum 5. Display selected-count below the grid (`{n}/5 selected`).

"Back" button returns to Q1.

### Step 3: Tips

**Header**:

- Title: `You're ready to start`
- Description: `Three things to remember as you explore.`

**Body**: `TipsList` (3 tips + optional image preview).

| #   | Tip text                                                                                                                                                         |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Click the heart on any vendor card to save them. Your shortlist lives in your dashboard.                                                                         |
| 2   | Submitting a booking request sends it to the vendor — they respond within 72 hours with their quote. You only pay the hold deposit if you accept.                |
| 3   | For non-standard requests (multi-day events, custom catering, large guest counts), use the **Custom Request** card on a vendor's profile to brief them directly. |

Right column: `/component-images/onboarding/couple-tips.png` (or similar — implementer to source).

**Footer**: `Onboarding.Navigation` with `completeLabel="Start browsing"`. On complete: POST `/api/users/onboarding-complete` → navigate to `/vendors`.

### Skip behavior

A "Skip for now" link in the modal header (top-right). Click → POST `/api/users/onboarding-complete` with `{ skipped: true, data: null }` → modal closes → user lands on `/dashboard`. The timestamp is set so the modal won't re-trigger.

---

## Vendor flow — `VendorOnboarding`

### Step 1: Welcome + Features

**Header**:

- Title: `Welcome to Baazar for vendors`
- Description: `Get discovered by Chicago couples. Here's how it works.`

**Body**: `FeatureCarousel` with 3 features:

| ID           | Icon (lucide)   | Title                | Description                                                                                                        | Image                                                |
| ------------ | --------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| `discovered` | `Eye`           | Get discovered       | Chicago couples search verified vendors in your category. Show up where they're already looking.                   | `/component-images/onboarding/vendor-discovered.png` |
| `calendar`   | `CalendarCheck` | Manage your calendar | Block dates, set capacity, prevent double-bookings. We automatically check availability before accepting bookings. | `/component-images/onboarding/vendor-calendar.png`   |
| `paid`       | `CreditCard`    | Get paid securely    | Stripe holds the deposit when a couple books. You're paid out after the event completes. No chasing invoices.      | `/component-images/onboarding/vendor-paid.png`       |

### Step 2: Personalize

**Header**:

- Title: `Tell us about your business`
- Description: `Two quick questions to set up your profile.`

**Q1: Category** (single-select, 10 commission-active categories)

```
Which category best describes your business?
[ Grid of 10 commission categories with icons ]
```

`ChoiceGroup` (single-select). Show only the 10 commission-active categories — same set as Couple Q2. NOT showing Bridal Wear / Decor / Venue (flat-fee deferred).

**Q2: Years in business**

```
How long have you been in business?
[ Less than 1 year ] [ 1-3 years ] [ 3-10 years ] [ 10+ years ]
```

4-option `ChoiceGroup`. Single-select. Used downstream for a vendor card "Established" badge or for sort weighting.

### Step 3: Tips

**Header**:

- Title: `You're ready to publish`
- Description: `Three things to remember as you build out your profile.`

**Body**: `TipsList`:

| #   | Tip text                                                                                                                  |
| --- | ------------------------------------------------------------------------------------------------------------------------- |
| 1   | Complete your profile (basics, photos, packages) to publish to the marketplace. Couples can't book you until you publish. |
| 2   | Set your **response SLA** under Profile → Settings. Couples see this on your card — fast responders book more.            |
| 3   | Keep your calendar up to date. Blocked dates prevent surprise double-bookings and protect your reputation.                |

**Footer**: `Onboarding.Navigation` with `completeLabel="Build my profile"`. On complete:

- POST `/api/users/onboarding-complete` with the data
- API route writes `users.onboarding_completed_at` + `onboarding_data` + upserts the category into `vendor_profiles`
- Frontend navigates to `/dashboard/profile/setup` (the existing Sub-project B wizard)

The wizard's first step (StepBasics) auto-fills the category from `vendor_profiles.category`, so vendors don't re-pick.

---

## Trigger logic — `OnboardingGate`

A client component mounted in the dashboard layout that renders the modal automatically on first visit.

```tsx
'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { CoupleOnboarding } from './CoupleOnboarding';
import { VendorOnboarding } from './VendorOnboarding';

export function OnboardingGate() {
  const [user, setUser] = useState<UserWithRole | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // Fetch user role + onboarding_completed_at
    // If null → open the modal
  }, []);

  if (!user) return null;
  if (user.onboarding_completed_at) return null;

  if (user.role === 'couple') {
    return <CoupleOnboarding open={open} onOpenChange={setOpen} />;
  }
  if (user.role === 'vendor') {
    return <VendorOnboarding open={open} onOpenChange={setOpen} />;
  }

  return null;
}
```

Mounted in `src/app/dashboard/layout.tsx` so it renders on every dashboard route. Server-side data fetch (rather than client-side) is preferable to avoid layout shift — the implementer should fetch the role + completed timestamp during the dashboard layout's RSC render and pass it down as a prop. If the wizard hasn't been published yet (i.e., user.role is unknown for some reason), fall back to no modal.

---

## API + data

### Migration `00043_users_onboarding.sql`

```sql
-- Adds onboarding state to the users table:
--   - onboarding_completed_at: timestamp when the user finishes (or skips)
--     the welcome onboarding modal. NULL = not yet completed; modal auto-fires.
--   - onboarding_data: jsonb stash of the user's answers. Shape varies by role:
--       Couple: { event_date: 'YYYY-MM-DD' | null, categories: string[] }
--       Vendor: { category: string, years_in_business: '0-1' | '1-3' | '3-10' | '10+' }
--     For skipped sessions: NULL.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS onboarding_data jsonb;

CREATE INDEX IF NOT EXISTS users_onboarding_pending_idx
  ON users (id)
  WHERE onboarding_completed_at IS NULL;
```

The partial index speeds up the "is this user still in onboarding?" check that runs on every dashboard render.

### Type sync `src/types/database.types.ts`

Append to `users` Row / Insert / Update:

- `onboarding_completed_at: string | null` (Row)
- `onboarding_completed_at?: string | null` (Insert / Update)
- `onboarding_data: Json | null` (Row)
- `onboarding_data?: Json | null` (Insert / Update)

### POST `/api/users/onboarding-complete`

Body schema (zod):

```ts
const baseSchema = z.object({
  skipped: z.boolean(),
});

const coupleDataSchema = z.object({
  event_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  categories: z.array(z.string()).min(1).max(5),
});

const vendorDataSchema = z.object({
  category: z.string().min(1),
  years_in_business: z.enum(['0-1', '1-3', '3-10', '10+']),
});

export const onboardingCompleteSchema = z.discriminatedUnion('skipped', [
  z.object({ skipped: z.literal(true), data: z.null() }),
  z.object({
    skipped: z.literal(false),
    data: z.union([coupleDataSchema, vendorDataSchema]),
  }),
]);
```

Handler behavior:

1. Auth check (401 if no user)
2. Validate body (400 if invalid)
3. Fetch user role from `users.role`
4. If skipped: update `users.onboarding_completed_at = now()` and `onboarding_data = null`
5. If completed + role === 'couple': update both
6. If completed + role === 'vendor':
   - Validate data conforms to vendor schema (re-narrow)
   - Upsert into `vendor_profiles` (or update if exists): set `category = data.category`
   - Update `users.onboarding_completed_at = now()` and `onboarding_data = { years_in_business }` (omit category since it lives in vendor_profiles)
7. Return `{ ok: true }`

If the vendor_profiles upsert fails (e.g., row already exists with a different category), log + return 200 anyway — the user's onboarding is "done" even if the pre-fill failed. They can change the category in the wizard.

---

## Visual + brand integration

### Modal styling

- Backdrop: `bg-ink/50` (motion: fade-in 200ms)
- Modal content: `bg-cream` + `border-hairline` + `rounded-lg` + max-width `3xl` (~768px)
- Header section: `bg-cream-soft` band with the title + step indicator. Spectral title, ink-muted description.
- Step indicator: 3 dots, active = `bg-ink`, inactive = `bg-hairline`
- Feature cards: `border-hairline` default, `border-indigo/30 bg-indigo/10` when active (highlighted)
- ChoiceGroup items: same default + active treatment as feature cards
- Tips numbered badges: `bg-cream-soft text-ink-muted` (matches DESIGN.md tips pattern)

### Motion

- Modal open: 200ms scrim fade + 320ms modal scale-in (cult-ui default; verify on install)
- Step transitions: instant (no slide animation between steps Day 1 — keeps it crisp)
- Feature carousel: 200ms opacity transition between active descriptions
- ChoiceGroup item: 150ms border-color transition on hover/select

`prefers-reduced-motion` honored via cult-ui's built-in motion handling (verify on install; if absent, wrap with our own).

### Accessibility

- Modal: `role="dialog"`, `aria-modal="true"`, `aria-labelledby` pointing to the title
- Step indicator: `aria-current="step"` on the active dot, all dots get `aria-label="Step {n} of 3"`
- ChoiceGroup: `role="radiogroup"` (or `role="group"` for multi-select), each item `role="radio"` (or `aria-checked` for multi)
- Skip button: clearly labeled `Skip for now`
- All actions reachable via keyboard tab; arrow keys move selection within ChoiceGroup
- Modal close via Escape key fires the skip action (not "X close without persisting") — so the modal never re-fires after pressing Escape

### Skip vs close

There's intentionally only one path out for incomplete onboarding: the "Skip for now" link. Closing via Escape key, backdrop click, or the X button (if cult-ui ships one) is wired to the same skip handler — so the timestamp is set in every case. This prevents the modal from re-firing endlessly if the user dismisses it without clicking Skip.

---

## Out of scope (deferred follow-ups)

- **Account-menu "Welcome tour" reopen link** — once dismissed, the only way to re-trigger is to clear `onboarding_completed_at`. Adding a manual reopen surface (in user dropdown or settings page) is a Day 2+ enhancement.
- **Resend welcome email series** — when a user completes onboarding, no email goes out. The future Resend wire-up sub-project can hook into `onboarding_completed_at` becoming non-null.
- **Per-step drop-off analytics** — Day 1 only tracks "completed vs skipped." Per-step events (which step did skippers stop at?) is a future analytics sub-project.
- **A/B variants of the flow** — fixed copy + content Day 1. Variants land when we have enough volume for the test to mean something.
- **Vendor onboarding for Bridal Wear / Decor / Venue** — those flow through the future flat-fee sub-project's separate onboarding (likely a much shorter flow + Stripe Billing signup).
- **Couple personalization-driven recommendations** — Day 1 we store `event_date` + `categories` in `onboarding_data` but no recommendation surface consumes them yet. The "For you" personalized vendor list is a separate sub-project.
- **Vendor years-in-business badge on vendor card** — we collect `years_in_business` Day 1 but the vendor card doesn't show an "Established" badge yet. Future card-polish PR.
- **Editable onboarding answers** — once submitted, a user can't go back and change their answers via UI. They'd have to ask support (or the future profile-settings page would expose this).
- **Custom illustration / video** — Day 1 uses static images (PNGs to be sourced). Bespoke illustration is a future content sub-project.

---

## Visual references

- The pasted demo (HeadlessOnboardingDemo from cult-ui) is the canonical interaction reference. Adapted to M+ tokens and Baazar's role-aware content.
- No new brainstorm mockups for this spec — the cult-ui demo + this written spec are sufficient. If the implementer wants a brand-aware preview before coding, they can build a quick HTML mockup in `.superpowers/brainstorm/55066-1779426490/content/` and ping the user.

---

## Open questions

None blocking. Implementer should verify:

1. The exact shadcn CLI command for cult-ui works as expected (it installs to `src/components/ui/onboarding.tsx`). If the install fails or generates a different path, adjust file paths in this spec accordingly.
2. Whether cult-ui's `ChoiceGroup` natively supports multi-select. If not, the implementer needs a small wrapper (`ChoiceGroupMulti`) for the couple's Q2 categories question.
3. Whether the `users` table already has a `role` column (it should, per Sub-project B / earlier auth work). If not, surface this as a schema-drift issue and add it via a follow-up migration.
