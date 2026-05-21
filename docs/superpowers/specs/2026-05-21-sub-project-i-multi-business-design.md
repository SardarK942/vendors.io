# Sub-project I — Multi-Business per Vendor Account

## 0. Status

- **Branch**: `feat/sub-project-i-multi-business`
- **Migration**: `supabase/migrations/00035_sub_project_i_multi_business.sql`
- **Origin**: Sub-project I of the post-launch decomposition (see `docs/phases.md`). The out-of-scope row in [`sub-project A's design`](./2026-05-11-sub-project-a-packages-design.md) names I as "Multi-business per vendor account."
- **Sequencing**: Last functional sub-project before UI polish. Follows E (vendor CRM redesign, shipped 2026-05-21). Unblocks J (homepage polish) + H (advanced search filters). K (vendor scraper) intentionally last.
- **Build approach**: Single bundled PR (same shape as B/C/D/F/G/E).
- **Scope framing**: **Edge case** (~3% of vendors). Minimal surface area added; zero behavior change for single-business 97%.

## 1. Goals

Let one auth user own multiple `vendor_profiles` (e.g., a photography business + a DJ business), with a clean switching UX. Avoid disturbing the E-shipped CRM surface for the overwhelming majority of vendors who only run one business.

### Success criteria

1. A single-business vendor sees **no UI change** from today. No switcher in the topbar; Inbox/Operations/Money/etc. all work exactly as shipped in E.
2. The user-avatar menu in `<Navbar>` has an "Add another business" link (visible to all vendors).
3. Clicking it drops the vendor into the existing B onboarding wizard, header swapped to "Set up your next business." On completion, a second `vendor_profiles` row exists for that user.
4. From then on, the topbar shows a **switcher pill** ("Khan Photography ▾") that opens a dropdown of all the user's businesses. Selecting one updates `users.active_vendor_profile_id`.
5. Per-business filtering applies to: Inbox, Operations, Bookings archive, Analytics teaser, Money, Calendar, Profile settings.
6. Per-user (unchanged) for: Notifications bell, the Notifications page.
7. Stripe: when adding the second business, default flow shares the user's existing Stripe Connect account (zero new KYC). Override toggle ("Use a separate Stripe account for this business") drops into a fresh KYC flow that creates a new `stripe_account` row.
8. Cross-business deep-link from a notification: opens the booking detail without changing the active business. Toast after action + business-name chip in the panel header.
9. Lint, build, vitest, and existing E2E pass. New tests cover the active-vendor helper, the switcher mechanic, RLS isolation between businesses, and key cross-business E2E flows.

### Acceptance criteria

A user signs up, completes the B wizard, has 1 vendor_profile, sees zero new UI beyond the user-menu link. They click "Add another business," run through the wizard again (Stripe step defaults to "use existing"), complete it. Now `users.active_vendor_profile_id` is the new business, topbar pill appears showing the new business name. Inbox/Operations/Money switch to the new business. They click the pill, swap back to business #1 — work surfaces update. A new booking request arrives for business #1 while they're in business #2's context — notification appears in the user-wide bell; clicking it opens the booking detail (with a chip saying "Business #1") without changing their active context; they accept; toast offers "Switch to Business #1 to see in Operations" with a switch button.

### Out of scope (deferred or parking lot)

| Area | Disposition |
|---|---|
| Business deletion / archiving UI | Out — existing `is_active` pause handles "stop accepting bookings" for one business; hard deletion is admin-only via support |
| Team / multi-user-per-business | Out — sub-project beyond MVP |
| Shared resources across businesses (packages, calendar capacity, portfolio) | Out — every resource is per-business; vendor manages duplicates manually if relevant |
| Aggregated cross-business analytics | Out — analytics teaser is per-business; full analytics page is still later-phase |
| Marketplace surface of "vendor's other businesses" | Out — listings are independent (each `vendor_profile` is one marketplace listing) |
| Stripe Connect account merging (split → shared) | Out — Stripe doesn't support this; vendor would do it manually with support |
| Business reordering in the switcher dropdown | Out — businesses ordered by `created_at ASC` (oldest first) |

## 2. Locked design decisions

9 decisions locked during brainstorming on 2026-05-21:

1. **Scope framing** — Edge case (Frame A): minimal surface, ~3-4 days, zero behavior change for single-business.
2. **Switcher visibility** — Pill in topbar only when `count > 1`; "Add another business" link in user-avatar dropdown (always present for vendors).
3. **Stripe Connect model** — Hybrid. Default to shared (vendor reuses their existing Stripe account when adding a second business). Override toggle creates a separate Stripe account per business. Implemented by flipping the FK: `vendor_profiles.stripe_account_id` (was `stripe_accounts.vendor_profile_id`).
4. **E surfaces scoping** — Per-business: Inbox, Operations, Bookings archive, Analytics teaser, Money, Calendar, Profile, Packages. Per-user: Notifications bell + page.
5. **Active business mechanism** — `users.active_vendor_profile_id` column. NULL means "fall back to user's only vendor_profile" (single-business default).
6. **Cross-business deeplinks** — Booking detail is context-neutral. No auto-switch. Business chip in panel header + post-action toast with one-click switch.
7. **Add-business flow** — Reuse the B onboarding wizard verbatim. `?next=true` query param signals second-business mode. Stripe step gains a "use existing" (default) vs "set up new" toggle.
8. **Marketplace listings** — Each business is its own `/vendors/[slug]` page. Independent reviews, portfolio, packages. No couple-facing cross-listing affordance.
9. **Refactor architecture** — New helper `getActiveVendorProfile(supabase, userId)` in `src/lib/vendor/active.ts`. Mechanically refactor ~15 sites that do `.eq('user_id', user.id).single()` to use the helper.

## 3. Topbar switcher + user-avatar menu

### `<BusinessSwitcher>` (new client component)

**File**: `src/components/dashboard/BusinessSwitcher.tsx`

Server-rendered conditionally: `<Navbar>` fetches `getActiveVendorProfile(supabase, user.id)` once for vendor users. If `totalCount > 1`, render `<BusinessSwitcher activeBusinessId={activeId} businesses={list} />`. Otherwise render nothing — single-business vendors see zero UI change.

**UI shape:**
- A shadcn `<DropdownMenu>` trigger button styled as a pill: `[icon] Khan Photography ▾`
- Dropdown content lists all businesses; the active one has a check mark
- Clicking a non-active business: `POST /api/users/me/active-business { vendorProfileId }`, then `router.refresh()` to re-render server components with the new active context
- Below the list, a divider + "Add another business" link

**Mobile**: pill works the same on narrow viewports; long business names truncate via `text-truncate` styles.

### User-avatar dropdown — new menu item

**File**: `src/components/ui/Navbar.tsx`

Inside the existing user-avatar dropdown (already used for "Sign out"), add a new vendor-only entry:

```tsx
{role === 'vendor' && (
  <DropdownMenuItem asChild>
    <Link href="/dashboard/profile/setup?next=true">Add another business</Link>
  </DropdownMenuItem>
)}
```

Visible to all vendor users regardless of business count (this is the primary discovery path for the multi-business feature).

### `POST /api/users/me/active-business` route

**File**: `src/app/api/users/me/active-business/route.ts`

```
Body: { vendorProfileId: string }
Auth: user must own the target vendor_profile (verify via vendor_profiles.user_id = caller.user.id)
Rate limit: Upstash 30/min per user (rapid switching during dev is fine; this just prevents abuse)
Returns: 200 { ok: true } | 401 (no auth) | 403 (not owner) | 404 (vendor_profile not found) | 429
```

Updates `users.active_vendor_profile_id = vendorProfileId` for the caller. Called by `<BusinessSwitcher>` on click.

## 4. Data model — migration 00035

One migration file: `supabase/migrations/00035_sub_project_i_multi_business.sql`. Two changes — flip the Stripe FK + add active-business pointer. Idempotent throughout.

### Change 1 — Flip the Stripe FK

```sql
-- Add new column on vendor_profiles (nullable)
ALTER TABLE vendor_profiles
  ADD COLUMN IF NOT EXISTS stripe_account_id uuid REFERENCES stripe_accounts(id);

-- Backfill: each vendor_profile that has a corresponding stripe_account row
-- (current direction) gets its new FK populated.
UPDATE vendor_profiles vp
  SET stripe_account_id = sa.id
  FROM stripe_accounts sa
  WHERE sa.vendor_profile_id = vp.id
    AND vp.stripe_account_id IS NULL;

-- Index for joins
CREATE INDEX IF NOT EXISTS vendor_profiles_stripe_account_idx
  ON vendor_profiles(stripe_account_id);

-- Rewrite the stripe_accounts RLS SELECT policy to use the new direction.
-- The old policy referenced stripe_accounts.vendor_profile_id which is about
-- to be dropped.
DROP POLICY IF EXISTS "Vendors read own stripe_accounts" ON stripe_accounts;
CREATE POLICY "Vendors read own stripe_accounts"
  ON stripe_accounts FOR SELECT
  USING (
    id IN (
      SELECT stripe_account_id FROM vendor_profiles
      WHERE user_id = auth.uid() AND stripe_account_id IS NOT NULL
    )
  );

-- Drop the old FK column on stripe_accounts after backfill
ALTER TABLE stripe_accounts
  DROP COLUMN IF EXISTS vendor_profile_id;
```

**Why drop, not keep both:** the relationship is now N:1 (many businesses → one Stripe account). Keeping the old 1:1 FK would make the two views inconsistent the moment a vendor adds a second business sharing the first's account.

**Note for implementation:** verify the exact existing `stripe_accounts` RLS policy name during the dev-apply iteration. The `DROP POLICY IF EXISTS` makes the migration safe regardless of the actual name. If the existing policy has a different name, leave its `DROP POLICY IF EXISTS` in place and add a second `DROP POLICY IF EXISTS "<actual-name>" ON stripe_accounts;` line above the rewrite.

### Change 2 — Active vendor profile pointer

```sql
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS active_vendor_profile_id uuid
    REFERENCES vendor_profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS users_active_vendor_profile_idx
  ON users(active_vendor_profile_id);
```

- Nullable. NULL = "let the app fall back to the user's only vendor_profile" (single-business default).
- `ON DELETE SET NULL`: if a vendor_profile is deleted, the user's active pointer clears gracefully.
- No backfill needed. Existing single-business users have NULL; the app falls back to their only profile.

### `database.types.ts` updates

Per the codebase convention (manual maintenance — see file header comment), apply these edits manually:

- Add `stripe_account_id: string | null` to `vendor_profiles` Row/Insert/Update
- Add `active_vendor_profile_id: string | null` to `users` Row/Insert/Update
- Remove `vendor_profile_id` from `stripe_accounts` Row/Insert/Update
- Update Relationships arrays to reflect the FK direction flip
- Append a header-comment line about migration 00035

### Migration application

Per [[migration_apply_policy]]:
1. I apply to **dev** Supabase (`lquvhjedlzubqusnfaak`) via `psql` during E1 (the implementation phase, not brainstorming)
2. **User applies to prod** (`obpdgihdskbxzgyctaib`) via SQL editor after PR merges

## 5. Active vendor profile helper

**New file**: `src/lib/vendor/active.ts`

```typescript
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';

type VendorProfileRow = Database['public']['Tables']['vendor_profiles']['Row'];

export interface ActiveVendorResult {
  profile: VendorProfileRow | null;
  totalCount: number;
}

/**
 * Resolve the user's active vendor profile.
 *
 * Resolution order:
 * 1. users.active_vendor_profile_id is set AND points to a profile owned by
 *    this user → return that profile.
 * 2. Else the user has exactly one vendor_profile → return it (single-business
 *    fallback; covers 97% of vendors with zero behavior change).
 * 3. Else the user has multiple vendor_profiles but no active set → return
 *    the first by created_at ASC AND persist it as active_vendor_profile_id
 *    so subsequent calls are cheap.
 * 4. Else (zero vendor_profiles) → return null. Caller redirects to onboarding.
 */
export async function getActiveVendorProfile(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<ActiveVendorResult>;

/**
 * Light variant when the caller only needs the ID.
 */
export async function getActiveVendorProfileId(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<string | null>;
```

**Call-site refactor pattern:**

```typescript
// Before
const { data: vendorProfile } = await supabase
  .from('vendor_profiles')
  .select('*')
  .eq('user_id', user.id)
  .single();

// After
const { profile: vendorProfile, totalCount } = await getActiveVendorProfile(supabase, user.id);
if (!vendorProfile) redirect('/dashboard/profile/setup');
```

`totalCount` is returned alongside so the Navbar can decide whether to show the switcher without an additional query.

**Sites to refactor:**

| File | Notes |
|---|---|
| `src/app/dashboard/page.tsx` | Vendor branch — uses `totalCount` for switcher |
| `src/app/dashboard/bookings/page.tsx` | Archive page — uses `totalCount` for switcher |
| `src/app/dashboard/profile/page.tsx` | Profile editor |
| `src/app/dashboard/profile/calendar/page.tsx` | Calendar |
| `src/app/dashboard/profile/setup/{layout,page,basics,location,online,portfolio,review,payment-mode}/*.tsx` | Wizard steps — special handling per §6 |
| `src/app/dashboard/profile/packages/{page,new}/*.tsx` | Package CRUD |
| `src/app/dashboard/money/page.tsx` | Money page |
| `src/app/api/vendor-profile/*.ts` (various) | API routes |
| `src/components/ui/Navbar.tsx` | Reads `totalCount` for switcher visibility |

**Grep audit post-refactor:** `grep -rn "from('vendor_profiles')" src/ \| grep "user_id"` should return zero matches in app code (allowed in the helper itself + tests). Any match needs `getActiveVendorProfile` or an explicit `// intentionally per-user` comment.

## 6. Add-another-business wizard flow

**Entry point:** "Add another business" link routes to `/dashboard/profile/setup?next=true`.

### Wizard mode detection

**Modified file**: `src/lib/onboarding/resume.ts`

```typescript
export async function getOrCreateWizardProfile(
  supabase: SupabaseClient<Database>,
  userId: string,
  mode: 'first' | 'next'
): Promise<{ profileId: string; isNew: boolean }> {
  if (mode === 'first') {
    // Existing behavior, refactored: find or create the user's primary vendor_profile.
    // (Use the same SELECT-or-INSERT pattern that resume.ts already implements,
    // matching on user_id without onboarding_complete filter.)
  }

  // 'next' mode: prefer to resume an abandoned partial second-business attempt;
  // otherwise create a fresh row.
  const { data: partials } = await supabase
    .from('vendor_profiles')
    .select('id, created_at')
    .eq('user_id', userId)
    .eq('onboarding_complete', false)
    .order('created_at', { ascending: false });

  // If there's exactly one partial and the user already has a complete profile,
  // resume that partial (treat as the in-progress second business).
  const { data: completes } = await supabase
    .from('vendor_profiles')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('onboarding_complete', true);

  if (partials && partials.length === 1 && (completes ?? []).length > 0) {
    return { profileId: partials[0].id, isNew: false };
  }

  // Otherwise create a fresh row.
  const { data } = await supabase
    .from('vendor_profiles')
    .insert({
      user_id: userId,
      business_name: '',
      slug: '',
      category: '',
      service_area: [],
      portfolio_images: [],
      onboarding_complete: false,
      is_active: false,
    })
    .select('id')
    .single();

  return { profileId: data!.id, isNew: true };
}
```

### Layout + step pages

**Modified file**: `src/app/dashboard/profile/setup/layout.tsx`

Reads `?next=true` from `searchParams`. Calls `getOrCreateWizardProfile(supabase, user.id, mode)`. The resolved `profileId` is passed down to all 8 step pages via either React context or as a server-rendered hidden form field in each step.

**Modified files**: `src/app/dashboard/profile/setup/{basics,location,online,portfolio,payment-mode,review}/page.tsx`

Each step page currently calls `.from('vendor_profiles').eq('user_id', user.id).maybeSingle()`. The refactor swaps that to read the explicit `profileId` from layout context, then `.from('vendor_profiles').eq('id', profileId).single()`. Same shape, different lookup key.

### Stripe step (payment-mode) — second-business toggle

The existing payment-mode step has a stripe/cash radio (sub-project C). For second-business mode, add a sub-question that appears only when `mode === 'next'`:

```
○ Stripe (couple pays card)
  ◉ Use my existing Stripe account ← default
  ○ Set up a new Stripe account for this business

○ Cash (you collect at the event)
```

If "use existing" → on wizard finish, set `new_vendor_profile.stripe_account_id = caller_user's_primary_stripe_account.id`.

If "set up new" → on wizard finish, redirect to the existing Stripe Connect onboarding flow which creates a new `stripe_accounts` row and links the new vendor_profile to it via `stripe_account_id`.

The "primary Stripe account" for a user is the `stripe_accounts.id` of the user's first vendor_profile (created_at ASC) that has a stripe_account.

### Wizard completion (review step's publish action)

1. Mark `new_vendor_profile.onboarding_complete = true`, `is_active = true`
2. Set `users.active_vendor_profile_id = new_vendor_profile.id` (land them inside the new business)
3. Redirect to `/dashboard`

## 7. E surfaces adaptation

The five work surfaces shipped in E + the older Calendar/Profile/Packages pages currently call `.eq('user_id', user.id).single()` → get one vendor_profile → filter downstream by `vendor_profile_id = that.id`. After §5's refactor, each call becomes `getActiveVendorProfile(supabase, user.id)` — same downstream filter logic.

### Per-surface notes

**Home — vendor branch** (`src/app/dashboard/page.tsx`): already passes `vendorProfile.id` to `<InboxBlock>`, `<OperationsBlock>`, `<AnalyticsTeaser>`. After the helper swap, no component changes needed.

**Bookings archive** (`src/app/dashboard/bookings/page.tsx`): same pattern. Switcher click → page re-renders → tab counts + rows update.

**Money** (`src/app/dashboard/money/page.tsx`): `getPayoutHistory` and `getCashToCollect` already scope by `vendor_profile_id`. No service changes.

**Subtle UX (worth implementing as a small addition):** if two businesses share one Stripe account (the hybrid default), the Money page's 3-card summary shows the same earnings on both businesses — because the underlying `stripe_account` is the same. Add a small footnote at the bottom of the 3-card row when this is the case:

```tsx
{isSharedStripeAccount && (
  <p className="text-xs text-muted-foreground mt-2">
    Shared Stripe account with your other businesses — these numbers include all of them.
  </p>
)}
```

`isSharedStripeAccount` is `true` when there's more than one `vendor_profile` for this user pointing at the same `stripe_account_id`. Compute it in the Money page server component before render.

**Calendar** (`src/app/dashboard/profile/calendar/page.tsx`): each business has its own `concurrent_capacity` + `vendor_calendar_holds` rows. Active-profile swap = per-business calendar. No service changes.

**Profile + Packages**: same pattern. Active business's row is the one being edited.

**Analytics teaser**: `vendor_profile_views` (E §6.3) has `vendor_profile_id` FK — views are tracked per business. `recordVendorProfileView` already scopes correctly. No change.

**Notifications**: `notifications.user_id` is the FK; no change needed. Cross-business behavior covered in §8.

### Change-impact summary

| Surface | Service change? | Component change? | Behavior delta for single-biz vendor |
|---|---|---|---|
| Inbox | No | No | None |
| Operations | No | No | None |
| Analytics teaser | No | No | None |
| Bookings archive | No | No | None |
| Money | No | Shared-account footnote (conditional) | None unless they add a 2nd business |
| Calendar | No | No | None |
| Profile editor | No | No | None |
| Packages | No | No | None |
| Notifications | No | No | None |

## 8. Cross-business notification flow

Per the locked decision: clicking a notification about a booking that belongs to a non-active business **opens the booking detail without changing active context**. Plus business-name chip + post-action toast for clarity.

### Behavior

- Notifications carry `booking_id` and link to `/dashboard/bookings/[id]` (existing F behavior — unchanged)
- Route resolution from `/dashboard/*` route → intercept fires → `<PanelShell>` opens with `<BookingDetail mode="panel">`
- Direct URL / refresh → standalone `/dashboard/bookings/[id]/page.tsx` renders `<BookingDetail mode="page">`
- **Booking detail is context-neutral.** All actions key off `booking.vendor_profile_id`, not active context. Modifying the right business's data falls out of the FK.

### Business-name chip in panel header

**Modified file**: `src/components/dashboard/BookingDetail.tsx`

After fetching `booking`, fetch the caller's `active_vendor_profile_id` (one extra `users` select; memoizable via the same data the layout uses for the switcher). If `booking.vendor_profile_id !== activeId`, render a small chip next to the existing status badge:

```tsx
{isCrossBusiness && (
  <Badge variant="outline" className="ml-2 text-xs">
    {bookingBusinessName}
  </Badge>
)}
```

Where `bookingBusinessName` comes from the booking's `vendor_profiles.business_name` (already joined in `getBookingById`).

Renders in both `mode='panel'` and `mode='page'` (useful for direct-URL arrivals from email).

### Post-action toast with one-click switch

The existing action handlers in `<VendorBookingActions>` and `<BookingActions>` already trigger `router.refresh()` after success. We extend each to additionally call `toast()` from sonner (already wired) when the booking was cross-business at action time.

The toast text is action-aware:

| Action | Toast text |
|---|---|
| Accept | "Accepted. Switch to {business name} to see this in your Operations view." |
| Adjust quote | "Quote sent. Switch to {business name} to follow up." |
| Cancel | "Cancelled. Switch to {business name} to see this in your bookings." |
| Mark complete | "Marked complete. Switch to {business name} to confirm." |

The `[Switch]` button calls `POST /api/users/me/active-business { vendorProfileId: booking.vendor_profile_id }` and then `router.refresh()`. Auto-dismiss after 8 seconds.

Implementation: a small client helper `<CrossBusinessActionToast>` reads the booking's `vendor_profile_id` + the caller's active business from a client context populated by `<Navbar>`. The action handlers call it on success.

## 9. Marketplace listing per business

Each `vendor_profile` is an independent marketplace listing at `/vendors/[slug]`. Schema already supports this — every `vendor_profiles` row has its own `slug`, `category`, `business_name`, `portfolio_images`, `bio`, `service_area`. Two listings for the same user have no implicit relationship in the marketplace.

**No marketplace-facing code changes needed.** The booking flow links via `vendor_profile_id`, reviews link via `vendor_profile_id`, packages link via `vendor_profile_id` — all unchanged.

**Slug uniqueness**: enforced by an existing `UNIQUE` constraint on `vendor_profiles.slug`. The wizard's slug generator (used in the B basics step) already appends a numeric suffix on conflict — same behavior for intra-vendor collisions.

**View-tracking self-skip** (`recordVendorProfileView` from E): currently passes `vendor.user_id` as the "owner skip" identity. That's exactly the right behavior for multi-business — a vendor visiting any of their own listings is skipped across all of them. No change needed.

## 10. Testing

### Service / unit tests (vitest, no DB)

| File | Coverage |
|---|---|
| `src/__tests__/lib/vendor/active.test.ts` | `getActiveVendorProfile`: NULL fallback for single-biz user; explicit pointer when set; fallback to first-by-created-at when count>1 and pointer null (verify it persists the pointer); null when zero profiles; ownership re-check (refuses to return a profile owned by a different user even if pointer drifts) |
| `src/__tests__/lib/onboarding/resume.test.ts` (extend) | `getOrCreateWizardProfile` 'first' mode (find existing) + 'next' mode (creates new) + 'next' mode with abandoned partial (resumes that one, doesn't create a third) |
| `src/__tests__/api/active-business.test.ts` | `POST /api/users/me/active-business`: happy path, 403 on profile not owned by caller, 404 on missing profile, 429 on rate limit |

### RLS / integration tests (skip without `SUPABASE_SERVICE_ROLE_KEY`)

`src/__tests__/integration/rls/`:

| File | Coverage |
|---|---|
| `multi-business-isolation.test.ts` | Seed user with 2 vendor_profiles + 1 booking against each. Set `active_vendor_profile_id` to biz A; verify `getBookingRequests` returns only biz A's booking. Switch active → biz B, verify swap. |
| `stripe-account-shared.test.ts` | Verify two `vendor_profiles` for the same user can share one `stripe_account_id`. RLS policy via the rewritten SELECT returns the shared row for both businesses. |
| `users-active-vendor-rls.test.ts` | User B cannot read user A's `active_vendor_profile_id` (regression guard for the new column). |

### E2E specs (Playwright, run locally with `.env.local`)

`tests/e2e/`:

| File | Coverage |
|---|---|
| `multi-business-switcher.spec.ts` | Seed vendor → add second business via the user-menu link → complete second wizard (shared Stripe path) → assert switcher pill appears → click to swap → assert Home Inbox rerenders with the other business's data |
| `multi-business-cross-notification.spec.ts` | Two businesses for one vendor; seed a pending booking against biz A; vendor logs in active=biz B; opens `/dashboard/notifications`; clicks the new-booking notification; assert the booking detail opens, shows the business-name chip, accepting shows the toast with [Switch], `active_vendor_profile_id` did NOT change without explicit [Switch] click |
| `multi-business-isolated-stripe.spec.ts` | Vendor with 2 businesses, each with its own `stripe_account` (override path). Assert `/dashboard/money` shows different earnings depending on active business |
| `multi-business-shared-stripe.spec.ts` | Vendor with 2 businesses sharing one `stripe_account`. Assert `/dashboard/money` shows the same earnings on both + the shared-account footnote |

### Regression coverage

The 7 existing E2E specs (vendor-inbox, vendor-money-stripe, vendor-money-cash, vendor-notes-privacy, vendor-bookings-archive, vendor-inbox-mobile, vendor-analytics-teaser) all keep passing without modification. That's the proof of success criterion #1 ("zero behavior change for single-business").

### Coverage target

Every new exported function in `active.ts` and `resume.ts` gets at least one happy-path + one edge-case test. RLS integration tests cover the cross-business isolation surface. E2E covers the four user-visible multi-business scenarios.

## 11. Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| A query somewhere still does `.eq('user_id', user.id).single()` after the refactor and silently returns the wrong vendor_profile for a multi-business user | Medium-high | Grep audit post-refactor; every match must use `getActiveVendorProfile` or have a `// intentionally per-user` comment. `multi-business-isolation.test.ts` catches the most common leak paths. |
| Stripe FK flip breaks the webhook handler | Medium | `handleAccountUpdated` and `handlePayoutEvent` need to read `vendor_profile_id` via the reverse join (`vendor_profiles WHERE stripe_account_id = sa.id`). Webhook tests must be updated and passing before merge. |
| A multi-business vendor accepts a booking under the wrong business | Low | Booking actions key off `booking.vendor_profile_id`, not active context. Chip + toast surface the cross-business state visibly. |
| Slug collisions when a vendor names two businesses similarly | Low | Existing slug-generation appends a numeric suffix on conflict; same treatment for intra-vendor. |
| `users.active_vendor_profile_id` points to a profile the user no longer owns | Low | `ON DELETE SET NULL` + `getActiveVendorProfile` ownership re-check handle this. |
| Money page confusion with shared Stripe account ("$1,260 shown on both businesses — do I have $2,520?") | Medium | Shared-account footnote in §7 (Money). |
| Abandoned partial second-business rows accumulating | Low | `getOrCreateWizardProfile` matches on `(user_id, onboarding_complete=false)` and resumes. |
| CI E2E job still fails on missing secrets | Known | Pre-existing limitation; new multi-business specs inherit the same gate; pass locally. |

## 12. Implementation checklist

A high-level outline. The detailed phased plan goes in `docs/superpowers/plans/2026-05-21-sub-project-i-multi-business.md`.

### Schema (single migration)
- [ ] Write `00035_sub_project_i_multi_business.sql` (FK flip + active_vendor_profile_id)
- [ ] Apply to dev Supabase via psql (Claude does this per [[migration_apply_policy]])
- [ ] Verify with sanity-check queries (column exists, indexes exist, RLS policy rewritten, old column dropped)
- [ ] Update `src/types/database.types.ts` manually

### Active-vendor helper + refactor
- [ ] Build `src/lib/vendor/active.ts` with `getActiveVendorProfile` + `getActiveVendorProfileId`
- [ ] Refactor ~15 call sites mechanically
- [ ] Grep audit: zero remaining `.eq('user_id', user.id).single()` on vendor_profiles in app code

### Switcher + user-menu
- [ ] Build `<BusinessSwitcher>` client component
- [ ] Wire into `<Navbar>` (server-render conditionally on `totalCount > 1`)
- [ ] Add "Add another business" to user-avatar dropdown
- [ ] Build `POST /api/users/me/active-business` route with auth + ownership + rate limit

### Add-business wizard
- [ ] Extend `getOrCreateWizardProfile` with 'first' / 'next' modes + resume logic
- [ ] Layout reads `?next=true` and provides `profileId` to step pages
- [ ] Refactor 8 step pages to read from explicit `profileId` (not user_id)
- [ ] Add Stripe override toggle in payment-mode step
- [ ] Completion sets `users.active_vendor_profile_id`

### E-surface adaptation
- [ ] Already covered by helper refactor (no per-surface service changes)
- [ ] Add shared-Stripe-account footnote to Money page

### Cross-business polish
- [ ] Business-name chip in `<BookingDetail>` panel + page header
- [ ] Post-action toast with [Switch] button in `<VendorBookingActions>` and `<BookingActions>`
- [ ] Client context provides active business ID to action handlers

### Webhook + Stripe handlers
- [ ] Update `handleAccountUpdated` / `handlePayoutEvent` for the FK flip
- [ ] Update webhook tests for new join direction

### Tests
- [ ] Service unit tests (active.ts, resume.ts extension, active-business route)
- [ ] RLS integration tests (3 specs)
- [ ] Playwright E2E specs (4 multi-business scenarios)
- [ ] Verify all 7 existing E E2E specs still pass

### Rollout
- [ ] PR into main, review, merge
- [ ] User applies migration 00035 to prod via SQL editor
- [ ] Smoke test on www.baazar.io with a 2-business test vendor
- [ ] Update `MEMORY.md` ship record + queue I in sequencing memory

## 13. What unblocks next

I shipping unblocks the **UI polish** phase per [[sub_project_sequencing]]: **J (homepage polish + animations)** and **H (advanced search filters)**. After J/H: **K (Playwright vendor scraper)** intentionally last.
