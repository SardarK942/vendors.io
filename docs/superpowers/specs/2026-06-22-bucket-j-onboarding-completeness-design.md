# Bucket J — Onboarding Completeness Design

**Status:** Approved (brainstorm) · awaiting implementation plan
**Date:** 2026-06-22
**Author:** Claude (with Sardar)
**Sequencing:** Bucket J ships after Bucket B and the recent hotfix sequence (#54-#58). Pre-launch sweep #2 — closes the onboarding loop on both sides.

---

## 1. Why this exists

The product launches in weeks. No customers exist in prod yet, so this is the right window to complete the onboarding experience before real users land. Today's audits surfaced more gaps than expected:

- **Customer onboarding had three CRITICAL bugs** (deposit math mismatch, OnboardingGate mark-on-show silent fail, sendQuoteEmail stale copy). All fixed in PR #57.
- **Vendor onboarding had two CRITICAL bugs** (address-skip resume loop, StepOnline routing skipping Step 4). All fixed in PR #58.
- **6 customer + 7 vendor IMPORTANT findings remain** — none ship-blocking, all combine to make onboarding feel half-finished.
- **Email branding gap** — Supabase auth emails (signup verification, magic link, reset) ship from a Supabase-controlled domain, not `baazar.io`. First impression looks unprofessional.
- **22 zero-coverage E2E paths** — onboarding flows have no automated regression protection. Recent audits caught 5 real bugs in zero-coverage paths today alone.
- **Bucket F leftovers** — 6 more sites still reference deleted dual-mode payment concepts. Each is dead code / stale copy.

Bucket J closes all of this in one pre-launch pass. After Bucket J, both sides have a launch-quality onboarding experience: branded emails, working welcome modals, persistent shortlist, mobile-friendly dashboard, celebration moments at firsts, and E2E coverage of the launch-critical paths.

User framing: _"need to ensure onboarding is amazing and professional for both sides... we need to seem like a legit brand that is bound to go viral."_

---

## 2. Scope (in / out)

### In scope

**Email infrastructure:**

- Resend domain verification for `baazar.io` (SPF + DKIM + DMARC DNS records, user-provisioned)
- Supabase Auth SMTP relay through Resend so every Baazar email — auth and transactional — comes from `noreply@baazar.io`

**Email templates — 5 new branded React Email templates:**

- Customer welcome (fires on first successful login post-signup-success)
- Customer 48h follow-up (fires if `users.onboarding_completed_at + 48h < now AND no bookings`)
- Vendor welcome (fires on `vendor_profiles.onboarding_complete` transition to true)
- Vendor 48h follow-up (fires if `vendor_profiles.published_at + 48h < now AND zero bookings received`)
- Vendor first-booking-received (fires on `vendor_profiles.first_booking_at` transition from null, replaces standard booking-request email for first booking only)

All four use a shared `<BaazarEmailLayout>` component: cream background, Spectral display font for headings, Schibsted Grotesk for body, ink CTAs, footer with physical address + unsubscribe + reply prompt (CAN-SPAM compliance).

48h delivery scheduling uses the existing Vercel Cron (D.1 infrastructure) — checks every 6 hours, fires emails for users matching the timing window.

**Welcome modal redesign — working welcome on both sides:**

Customer modal restructured to branching 3-step flow:

- **Step 0** — "Are you planning an event?" Two tappable options: "Yes, I have an event coming up" → Step 1, "Just browsing for now" → Step 2 (skips personalization)
- **Step 1** (conditional, only for "Yes" path) — "Tell us about your event" — event date picker + cultural/general multi-select max 3, locked to `EVENT_TYPES` from Bucket B
- **Step 2** — "Here's what we found" — 3 real `<VendorCard>` previews. Personalized to selected categories if from Step 1, generic newest-active if from Step 0 "Just browsing." Heart buttons wired to shortlist API. CTA "Start exploring →" goes to `/vendors`.

Vendor modal restructured to 2 steps:

- **Step 1** — "What types of events do you serve?" — multi-select 1-5 event types from the 20-entry list. Auto-fills wizard Step 4 Details when vendor reaches it later.
- **Step 2** — "Here are real requests you'd see" — 3 sample customer-request cards (event type, date, guest count, budget range) shown as if inbox items. CTA "Set up your profile →" goes to wizard at `/dashboard/profile/setup/basics`.

Both replace the existing "Feature preview" placeholder boxes. Mark-on-show semantics from PR #57 preserved (user marked complete on modal open).

**Shortlist persistence (replaces non-persisted local state):**

- New table `saved_vendors (user_id, vendor_profile_id, saved_at)` with RLS
- API routes: `POST /api/users/me/saved`, `DELETE /api/users/me/saved/[vendor_id]`, `GET /api/users/me/saved`
- `VendorCard` heart toggle wired to API (was local `useState`, becomes optimistic + persisted)
- New page `/dashboard/saved` with the saved vendor grid + empty state copy
- Customer dashboard sidebar adds "Saved" nav entry between "Bookings" and "Notifications"
- Service helper: `getSavedVendors(supabase, userId)` in `src/services/vendor.service.ts`

**Mobile sidebar — hamburger drawer:**

- Couple + vendor dashboard layouts add a hamburger button on mobile (top-right of navbar)
- Opens a `<Sheet>` (shadcn drawer) containing the same `SidebarNav` items
- Desktop unchanged

**DepositDialog polish:**

- ToS label gets real anchors: "I agree to the [Terms](/terms) and [Cancellation Policy](/terms#cancellations)"
- Cancellation policy out of `<details>` — 3-line visible summary above the agreement checkbox, with "Full policy →" anchor
- Graceful error: if API returns 200 with no `checkoutUrl`, show toast "Could not redirect to checkout. Please try again." and reset loading state

**Celebration moments (symmetric firsts):**

Vendor receives first-ever booking:

- Big sonner toast: "🎉 Your first booking request! Open it →" (8 seconds, click → booking detail page)
- Dedicated `sendFirstBookingEmail` template (celebratory subject, customer name, event date, package, total, deposit, "Respond now" CTA)
- Subsequent bookings → standard `notifyBookingRequestReceived` notification

Customer hearts first-ever vendor:

- ❤️ confetti toast: "First save! Find [vendor name] in your [Saved →](/dashboard/saved)" (6 seconds, 1-second SVG burst at heart icon position)
- Subsequent saves → silent "Saved" toast

Customer submits first-ever booking:

- API redirects to `/dashboard/bookings/[id]?welcome=true`
- That URL renders a celebration overlay modal on top of the booking detail page:
  - 🎉 "Your first booking request is in!"
  - Vendor name + event date + total + 5% deposit amount
  - 3-step explainer ("Vendor reviews and responds within [SLA] hours" / "You'll get an email when they accept or counter" / "Pay your 5% deposit to unlock their contact info")
  - Confetti burst on modal mount
  - "Got it →" dismisses, removes query param
- Subsequent bookings → standard redirect, no modal

All detection via new nullable timestamp columns set atomically when the action first occurs.

**Customer dashboard first-visit state:**

- Replace generic empty state with personalized banner using `users.onboarding_data`:
  - If `event_date` was set: "Your event is on [date] — that's [N] days away"
  - If `categories` were set: shows shortcut chips to filter `/vendors` by each category
  - If "just browsing": no banner (existing "Browse vendors" CTA suffices)
- Banner dismissible, sets `users.dashboard_welcome_dismissed_at`

**Heart-icon styling rule:**

- Filled-heart state = plain red (`text-red-500` or equivalent)
- Hot-pink remains reserved for hover treatments only (per Bucket B hover system)
- Rule documented in `docs/DESIGN.md` Hover System section

**Bucket F leftovers sweep — 6 sites:**

1. Marketplace `cashFriendly` filter chip hidden from `/vendors` filter sheet
2. `paymentModeSchema` deleted from `src/lib/onboarding/validation.ts`
3. `getCashToCollect` + `CashToCollectRow` deleted from `src/services/payment.service.ts`
4. `getPlatformCutRate`, `calculatePlatformCut`, `calculateVendorPending`, `PaymentMode` type deleted from `src/lib/utils.ts` (only `DEPOSIT_RATE` + `calculateDepositAmount` remain)
5. `calculatePlatformFee` (deprecated) deleted from `src/lib/utils.ts`
6. Audit `src/services/payment.service.ts` for any remaining `stripe_account_id` reads — remove or simplify

**Strategic E2E coverage — 7 specs (launch-critical paths only):**

1. `customer-signup-email-password.spec.ts` — email/password signup → confirmation → callback → welcome modal "Yes" branch → Step 1 → Step 2 → `/vendors`
2. `customer-just-browsing.spec.ts` — Step 0 "Just browsing" → skips Step 1 → Step 2 generic vendors
3. `customer-first-save-celebration.spec.ts` — first heart → ❤️ confetti toast + first_save_at written, second heart → silent
4. `customer-first-booking-celebration.spec.ts` — first booking → `?welcome=true` modal → 3-step explainer → dismiss removes param
5. `vendor-first-booking-received.spec.ts` — vendor receives first booking → 🎉 toast + celebratory email, second booking → standard email
6. `shortlist-persistence.spec.ts` — heart vendor → log out → log in → still hearted → `/dashboard/saved` → unheart removes
7. `customer-welcome-email-delivers.spec.ts` — signup → assert welcome email sent with correct subject + first name

### Out of scope (deferred)

- Lifecycle email nurture flows (weekly digests, re-engagement series, vendor analytics emails)
- Coachmark / interactive tour overlay UI as a welcome modal alternative
- Designer-quality custom illustrations or motion graphics
- 15 lower-priority E2E paths (mobile rendering, magic link signup, auth error states, etc.)
- "Save & compare" cross-customer notifications (e.g. "a vendor in your shortlist responded")
- The unskipped `walkthrough.spec.ts` revival from PR #54 — orchestration debt, separate fix
- Per-vendor-type package templates (Task #86 — pending; predates Bucket J)

---

## 3. Architecture details

### 3.1 Email infrastructure setup

**Resend domain verification (user-provisioned):**

- User adds `baazar.io` as verified sender in Resend dashboard
- Resend issues 4 DNS records:
  - **SPF** (`TXT @`): `v=spf1 include:amazonses.com include:_spf.resend.com ~all`
  - **DKIM** (`CNAME × 3`): Resend's three signing-key records
  - **DMARC** (`TXT _dmarc`): `v=DMARC1; p=none; rua=mailto:postmaster@baazar.io` — start permissive, escalate to `p=quarantine` after 30 days of clean delivery
- User adds to DNS provider, waits for propagation (5-60 min typical), confirms verified in Resend
- Spec calls out: I will surface the records at execution time; user adds them; I verify post-propagation

**Supabase SMTP relay (user-configured):**

- User generates a Resend SMTP credential (separate from API key)
- In Supabase project settings → Auth → SMTP Settings:
  - Host: `smtp.resend.com`, Port `587`
  - Username: `resend`, Password: `<Resend SMTP key>`
  - Sender Name: `Baazar`, Sender Email: `noreply@baazar.io`
- After enabling, every Supabase Auth email (signup verification, magic link, password reset) routes through Resend SMTP and arrives from `noreply@baazar.io`

### 3.2 React Email templates

Shared layout component at `src/lib/email/templates/layout.tsx`:

```tsx
import { Body, Container, Head, Html, Img, Link, Section, Text } from '@react-email/components';

export function BaazarEmailLayout({
  preview,
  children,
}: {
  preview: string;
  children: React.ReactNode;
}) {
  return (
    <Html>
      <Head>
        <title>{preview}</title>
        <style>{/* font preloads, base color tokens */}</style>
      </Head>
      <Body style={{ backgroundColor: '#FBF6EC', fontFamily: 'Schibsted Grotesk, sans-serif' }}>
        <Container style={{ maxWidth: 600, margin: '0 auto', padding: '32px 24px' }}>
          <Section style={{ textAlign: 'center', marginBottom: 32 }}>
            <Img src="https://www.baazar.io/wordmark.png" alt="Baazar" width={140} />
          </Section>
          {children}
          <Section
            style={{
              marginTop: 48,
              fontSize: 12,
              color: '#1B1414',
              opacity: 0.6,
              textAlign: 'center',
            }}
          >
            <Text>Reply to this email — we read every one.</Text>
            <Text>Baazar.io · Chicago, IL</Text>
            <Link href={`https://www.baazar.io/unsubscribe?token=${unsubscribeToken}`}>
              Unsubscribe
            </Link>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
```

Each of the 4 email templates lives in `src/lib/email/templates/`:

- `customer-welcome.tsx`
- `customer-followup-48h.tsx`
- `vendor-welcome.tsx`
- `vendor-followup-48h.tsx`

All consumed by `src/lib/email/resend.ts` via new exported send functions:

- `sendCustomerWelcomeEmail(coupleEmail, firstName)`
- `sendCustomer48hFollowupEmail(coupleEmail, firstName, suggestedVendors)`
- `sendVendorWelcomeEmail(vendorEmail, businessName, profileSlug)`
- `sendVendor48hFollowupEmail(vendorEmail, businessName)`

**48h follow-up cron:**

- Existing Vercel Cron at `src/app/api/cron/notifications/route.ts` adds a new section that runs every 6 hours
- Query: users with `onboarding_completed_at BETWEEN now() - interval '50 hours' AND now() - interval '46 hours'`, no bookings, no `followup_48h_sent_at`
- Same logic for vendors against `vendor_profiles.published_at`
- Send + mark `followup_48h_sent_at` to prevent duplicate sends
- New column on both `users` + `vendor_profiles`: `followup_48h_sent_at timestamptz NULL`

### 3.3 Welcome modal redesign

**Customer modal (3 steps with branching):**

State machine:

```
{ step: 0 } →
  user picks "Yes"  → { step: 1, hasEvent: true }  → fills date+cats → { step: 2 }
  user picks "Just browsing" → { step: 2, hasEvent: false }
```

`CoupleOnboarding.tsx` rewritten:

- Step 0: two large tappable card buttons, vertical stack
- Step 1: existing date picker + category multi-select (kept as-is), with "Back" to Step 0
- Step 2: fetches `getVendorsByCategory(categories, limit=3)` if `hasEvent`, else `getRecentActiveVendors(limit=3)`. Renders 3 `<VendorCard>` previews (passed `compact` prop, see below). Below grid: "Start exploring →" CTA.

`VendorCard` gains optional `compact` prop:

- When `compact=true`: smaller height (180px), single column of metadata, no description text. Heart button still works.

If `hasEvent === false`, also auto-write `users.onboarding_data = { event_date: null, categories: [], just_browsing: true }` — explicit signal for follow-up email cron to use the generic template.

**Vendor modal (2 steps):**

`VendorOnboarding.tsx` rewritten:

- Step 1: event-type multi-select (1-5, from `EVENT_TYPES`). On submit, write `vendor_profiles.served_event_types = string[]` (existing column, or add if missing).
- Step 2: 3 hardcoded sample request cards — JSON in `src/lib/onboarding/sample-vendor-requests.ts`. Below: "Set up your profile →" CTA → `/dashboard/profile/setup/basics`.

### 3.4 Shortlist persistence

**Migration `00062_saved_vendors.sql`:**

```sql
CREATE TABLE saved_vendors (user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, vendor_profile_id uuid NOT NULL REFERENCES vendor_profiles(id) ON DELETE CASCADE, saved_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (user_id, vendor_profile_id));
CREATE INDEX idx_saved_vendors_user ON saved_vendors (user_id, saved_at DESC);
ALTER TABLE saved_vendors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own saves" ON saved_vendors FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users insert own saves" ON saved_vendors FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users delete own saves" ON saved_vendors FOR DELETE USING (user_id = auth.uid());
```

All single-line per project pattern.

**API endpoints:**

```
POST   /api/users/me/saved      body: { vendor_profile_id }   → 200 (insert) or 204 (already saved)
DELETE /api/users/me/saved/[vendor_id]                        → 200 (deleted) or 404
GET    /api/users/me/saved                                    → 200 [{ vendor_profile_id, saved_at }, ...]
```

**Service helper:**

```ts
// src/services/vendor.service.ts (add)
export async function getSavedVendorsForUser(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<VendorProfileRow[]> {
  const { data } = await supabase
    .from('saved_vendors')
    .select('saved_at, vendor_profiles!inner(*)')
    .eq('user_id', userId)
    .order('saved_at', { ascending: false });
  return (data ?? []).map((r) => r.vendor_profiles);
}
```

**VendorCard heart wiring:**

`VendorCard` already has a heart button with `useState`. Rewrite to use a context-provided saved-set + optimistic mutations:

- `SavedVendorsProvider` wraps `/vendors` + `/dashboard/saved` pages, hydrates from `GET /api/users/me/saved` on mount
- `useSavedVendors()` hook exposes `{ savedIds, toggle(vendorId) }` — toggle does optimistic state update + API POST/DELETE + revert on error
- First-save detection (§3.7) checks server-side response: API returns `{ first_save: true }` when this insert triggered the `first_save_at` set; client renders the confetti toast accordingly

**Dashboard /saved page:**

```tsx
// src/app/dashboard/saved/page.tsx
import { getSavedVendorsForUser } from '@/services/vendor.service';

export default async function SavedPage() {
  const vendors = await getSavedVendorsForUser(supabase, userId);
  if (vendors.length === 0) {
    return (
      <EmptyState
        title="No saved vendors yet"
        body="Heart vendors to remember them. Your shortlist lives here."
        cta={{ label: 'Browse vendors', href: '/vendors' }}
      />
    );
  }
  return <VendorGrid vendors={vendors} />;
}
```

`SidebarNav` couple-role section adds `{ label: 'Saved', href: '/dashboard/saved', icon: Heart }` between Bookings and Notifications.

### 3.5 Mobile sidebar — hamburger drawer

`src/app/dashboard/layout.tsx`:

```tsx
<header className="md:hidden">
  <Sheet>
    <SheetTrigger asChild>
      <Button variant="ghost" size="icon" className="absolute right-4 top-4">
        <Menu className="h-5 w-5" />
      </Button>
    </SheetTrigger>
    <SheetContent side="right" className="w-64">
      <SidebarNav role={role} />
    </SheetContent>
  </Sheet>
</header>
<aside className="hidden w-56 shrink-0 md:block">
  <SidebarNav role={role} />
</aside>
```

Existing `SidebarNav` reused as-is — no changes to its internals. Same items render in both desktop sidebar and mobile drawer.

### 3.6 DepositDialog polish

Three changes in `src/components/dashboard/DepositDialog.tsx`:

1. **ToS link:** existing plaintext "I agree to the Terms" becomes:

```tsx
<Label className="text-xs">
  I agree to the{' '}
  <Link href="/terms" className="underline hover-pink-text">
    Terms
  </Link>{' '}
  and{' '}
  <Link href="/terms#cancellations" className="underline hover-pink-text">
    Cancellation Policy
  </Link>
  .
</Label>
```

2. **Cancellation policy visible:** remove `<details>` wrapper. Replace with:

```tsx
<div className="my-3 rounded-md border border-ink/10 bg-cream/50 p-3 text-xs">
  <p className="font-semibold text-ink">Cancellation policy</p>
  <p className="mt-1 text-ink/80">
    Your 5% deposit is fully refundable within 24 hours of booking. After that, it's non-refundable.
    If the vendor cancels, you get a full refund.
  </p>
  <Link
    href="/terms#cancellations"
    className="mt-2 inline-block text-ink underline hover-pink-text"
  >
    Full policy →
  </Link>
</div>
```

3. **Graceful checkout-URL-missing error:**

```tsx
if (data.data?.checkoutUrl) {
  window.location.href = data.data.checkoutUrl;
} else {
  toast.error('Could not redirect to checkout. Please try again.');
  setLoading(false);
}
```

### 3.7 Celebration moments

**Vendor first-booking-received:**

Migration column: `vendor_profiles.first_booking_at timestamptz NULL`.

In `src/services/booking.service.ts` `createBookingRequest`:

- After successful insert, check `vendor_profiles.first_booking_at` for the recipient vendor
- If null:
  - `UPDATE vendor_profiles SET first_booking_at = now() WHERE id = X AND first_booking_at IS NULL`
  - Call `sendFirstBookingEmail(...)` instead of standard `sendBookingRequestEmail(...)`
  - Notification service flags the in-app notification as `is_first: true`
- `notifyBookingRequestReceived` notification consumer reads the `is_first` flag → renders the special 8-second 🎉 toast variant in the bell dropdown

`sendFirstBookingEmail` template (new in `src/lib/email/templates/vendor-first-booking.tsx`):

- Subject: `Your first Baazar booking is here 🎉`
- Body: celebratory header, customer first name, event date, package name, total amount, 5% deposit, "Respond now" CTA → booking detail page

**Customer first-save:**

Migration column: `users.first_save_at timestamptz NULL`.

`POST /api/users/me/saved`:

- After insert, atomic `UPDATE users SET first_save_at = now() WHERE id = X AND first_save_at IS NULL RETURNING first_save_at`
- Response `{ first_save: <previous value was null> }` — client reads this to decide which toast to render

`VendorCard` heart click handler:

- On 200 response with `first_save: true`, render confetti toast: `❤️ First save! Find <vendor name> in your <Saved →>(/dashboard/saved)`
- 6-second duration, 1-second confetti SVG burst at heart-icon screen position

Confetti SVG: small inline asset, ~10-15 pink+red dots animating outward from origin. New file: `src/components/celebration/HeartConfetti.tsx`.

**Customer first-booking:**

Migration column: `users.first_booking_at timestamptz NULL`.

`POST /api/bookings` after successful booking insert:

- Atomic `UPDATE users SET first_booking_at = now() WHERE id = X AND first_booking_at IS NULL RETURNING first_booking_at`
- Response includes `{ is_first_booking: <was null> }` → client redirects:
  - First booking: `router.push('/dashboard/bookings/${id}?welcome=true')`
  - Subsequent: `router.push('/dashboard/bookings/${id}')`

`/dashboard/bookings/[id]` page reads `searchParams.welcome === 'true'`:

- Renders `<FirstBookingCelebration>` overlay modal on top of booking detail
- Modal mount triggers confetti burst (full-screen variant, 1-2 seconds)
- "Got it →" button dismisses modal AND removes `?welcome` from URL via `router.replace`

New component: `src/components/celebration/FirstBookingCelebration.tsx`. Content:

- 🎉 heading "Your first booking request is in!"
- Vendor name + event date + total + 5% deposit amount (computed from booking row)
- 3-step explainer (locked copy below)
- "Got it →" ink CTA

### 3.8 Customer dashboard first-visit banner

`src/app/dashboard/page.tsx` couple-role branch adds:

```tsx
const { data: profile } = await supabase
  .from('users')
  .select('onboarding_data, dashboard_welcome_dismissed_at')
  .eq('id', user.id)
  .single();

const showBanner =
  !profile?.dashboard_welcome_dismissed_at &&
  profile?.onboarding_data &&
  !profile.onboarding_data.just_browsing;

if (showBanner) {
  const data = profile.onboarding_data as { event_date: string | null; categories: string[] };
  return (
    <>
      <CustomerWelcomeBanner data={data} />
      {/* existing dashboard content */}
    </>
  );
}
```

`<CustomerWelcomeBanner>` renders:

- If `data.event_date`: "Your event is on [formatted date] — that's [N] days away."
- If `data.categories.length > 0`: a row of clickable chips — each chip filters `/vendors?category=<cat>`
- Dismiss button (X icon) writes `users.dashboard_welcome_dismissed_at = now()` via `PATCH /api/users/me/dismiss-welcome`

### 3.9 Bucket F leftovers sweep — file-by-file

1. **`src/components/marketplace/filters/sections/?` (cashFriendly chip):** identify the filter component rendering the cashFriendly chip. Remove the chip entirely. `vendor-filters.ts` already neutralized (see PR #55).
2. **`src/lib/onboarding/validation.ts`:** remove `paymentModeSchema`. Audit consumers (likely zero after Bucket F T7).
3. **`src/services/payment.service.ts`:** delete `getCashToCollect`, `CashToCollectRow` type, and any related cash-mode helpers.
4. **`src/lib/utils.ts`:** delete `getPlatformCutRate`, `calculatePlatformCut`, `calculateVendorPending`, `PaymentMode` type, and `calculatePlatformFee`. Keep `DEPOSIT_RATE`, `calculateDepositAmount`, and other unrelated utility functions.
5. Audit `payment.service.ts` for stale `stripe_account_id` reads — remove or simplify dead-code paths.
6. Final grep verification: `grep -rn "payment_mode\|PaymentMode\|cash_friendly\|getCashToCollect\|getPlatformCut\|calculatePlatformCut\|calculateVendorPending\|calculatePlatformFee" src/ | grep -v test/spec/migration/types` returns empty.

---

## 4. Database changes

### 4.1 Migration `00062_saved_vendors.sql`

```sql
CREATE TABLE saved_vendors (user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, vendor_profile_id uuid NOT NULL REFERENCES vendor_profiles(id) ON DELETE CASCADE, saved_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (user_id, vendor_profile_id));
CREATE INDEX idx_saved_vendors_user ON saved_vendors (user_id, saved_at DESC);
ALTER TABLE saved_vendors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own saves" ON saved_vendors FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users insert own saves" ON saved_vendors FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users delete own saves" ON saved_vendors FOR DELETE USING (user_id = auth.uid());
```

### 4.2 Migration `00063_first_action_tracking.sql`

```sql
ALTER TABLE vendor_profiles ADD COLUMN IF NOT EXISTS first_booking_at timestamptz NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS first_save_at timestamptz NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS first_booking_at timestamptz NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS dashboard_welcome_dismissed_at timestamptz NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS followup_48h_sent_at timestamptz NULL;
ALTER TABLE vendor_profiles ADD COLUMN IF NOT EXISTS followup_48h_sent_at timestamptz NULL;
ALTER TABLE vendor_profiles ADD COLUMN IF NOT EXISTS published_at timestamptz NULL;
ALTER TABLE vendor_profiles ADD COLUMN IF NOT EXISTS served_event_types text[] NOT NULL DEFAULT '{}';
UPDATE vendor_profiles SET published_at = updated_at WHERE onboarding_complete = true AND published_at IS NULL;
```

All single-line per project pattern. The `published_at` column tracks when a vendor first went live, used by the 48h follow-up cron. Backfill on existing complete profiles uses `updated_at` as a reasonable proxy.

### 4.3 Pre-deploy state check

Before applying to prod, verify:

- `SELECT COUNT(*) FROM vendor_profiles WHERE onboarding_complete = true` — should match prod-known vendor count (~3,300 + 4 photobooth claims)
- `SELECT COUNT(*) FROM users WHERE role = 'couple'` — sanity-check the backfill blast radius (likely small)
- The `served_event_types` column (mentioned in §3.3 for vendor modal) — verify exists. If not, add as `ADD COLUMN IF NOT EXISTS served_event_types text[] DEFAULT '{}'` in migration 00063.

---

## 5. Locked verbatim copy

### 5.1 Customer welcome email

Subject: `Welcome to Baazar, [first name]`

Body sections (heading + paragraph each):

- `Find your vendors` — `Browse 3,000+ culturally-focused wedding and event vendors across photography, mehndi, DJs, and more. Heart your favorites to compare side-by-side.`
- `Request, don't commit` — `Send a booking request with your event details. Vendors respond with quotes you can accept, counter, or pass on — no charge until you confirm.`
- `5% to lock it in` — `Once you're ready, a 5% deposit secures your date. Pay the remaining 95% directly to the vendor per their terms.`

CTA button: `Start browsing →` → `/vendors`

### 5.2 Customer 48h follow-up email

Subject (if has event): `[N] days until your event — here are vendors to consider`
Subject (just browsing): `Looking for wedding inspiration?`

Body:

- Has event: `Your [event type] is coming up on [date]. We've pulled 3 vendors in your area to get you started.`
- Just browsing: `Take another look — we've added new vendors this week. Here are 3 trending now.`

Then 3 vendor cards rendered inline. CTA `See more vendors →` → `/vendors?category=...`

### 5.3 Vendor welcome email

Subject: `Your Baazar profile is live`

Body:

- Heading: `Welcome to Baazar, [business name].`
- `Your public profile is live at <a href="...">baazar.io/vendors/[slug]</a>. Couples can find you and send booking requests starting now.`
- `Here's how it works:`
  - `1. Couples discover your profile through search`
  - `2. They request a booking with their event details`
  - `3. You accept, they pay a 5% deposit, you handle the 95% balance directly`
- CTA: `Add your first package →` → `/dashboard/profile/packages`

### 5.4 Vendor 48h follow-up email

Subject: `Tips for getting your first Baazar booking`

Body:

- `Your profile has been live for 2 days. Here are 3 quick wins to attract your first booking:`
- 3 tips (one-line each):
  - `Add 5+ portfolio photos — vendors with full galleries get 4× more requests`
  - `Set your response time to 4 hours or less — fast responders convert higher`
  - `Complete your bio with specifics (style, experience, what makes you different)`
- CTA: `Edit your profile →` → `/dashboard/profile/setup/basics`

### 5.5 Customer first-save toast

`❤️ First save! Find [vendor name] in your Saved →`

(The "Saved →" links to `/dashboard/saved`. Heart icon is the standard ❤️ emoji, plain red.)

### 5.6 Customer first-booking celebration modal

Heading: `🎉 Your first booking request is in!`

Subheading: `[Vendor name] · [Event date] · [Total]`

What happens next (3-step list):

1. `[Vendor name] reviews and responds within [response_sla_hours] hours.`
2. `You'll get an email when they accept or counter.`
3. `Pay your 5% deposit ([deposit amount]) to confirm and unlock their contact info.`

CTA: `Got it →`

### 5.7 Vendor first-booking-received toast

`🎉 Your first booking request! Open it →`

(8-second duration, click → `/dashboard/bookings/[id]`. Toast variant in sonner.)

### 5.8 Vendor first-booking email

Subject: `Your first Baazar booking is here 🎉`

Body:

- Heading: `Congratulations — you've got your first request.`
- `[Customer first name] wants to book you for their [event type] on [date].`
- Booking summary box: total, deposit, package name
- `Respond within [response_sla_hours] hours to keep your placement on the marketplace.`
- CTA: `Respond now →` → booking detail page

### 5.9 Sample vendor request cards (vendor modal Step 2)

Hardcoded JSON, 3 example shapes (one per common event type):

```json
[
  {
    "event_type": "wedding",
    "date": "in 4 months",
    "guest_count": 300,
    "budget_range": "$2,000 - $4,000"
  },
  {
    "event_type": "mehndi",
    "date": "in 6 weeks",
    "guest_count": 80,
    "budget_range": "$800 - $1,500"
  },
  {
    "event_type": "birthday party",
    "date": "in 3 weeks",
    "guest_count": 50,
    "budget_range": "$500 - $1,000"
  }
]
```

Heading on Step 2: `Here's what customer requests look like:`

---

## 6. Testing approach

### 6.1 Unit tests

- `saved_vendors` API routes: POST/DELETE/GET with auth, dedup, ownership
- `getSavedVendorsForUser` service helper
- First-action detection: atomic update returning previous null status
- 48h follow-up cron: timing window query, no duplicate sends
- Email templates: snapshot test ensuring layout component renders + subject is correct

### 6.2 E2E specs (7 strategic)

Already enumerated in §2 In Scope. Files:

- `tests/e2e/bucket-j-customer-signup-email-password.spec.ts`
- `tests/e2e/bucket-j-customer-just-browsing.spec.ts`
- `tests/e2e/bucket-j-customer-first-save-celebration.spec.ts`
- `tests/e2e/bucket-j-customer-first-booking-celebration.spec.ts`
- `tests/e2e/bucket-j-vendor-first-booking-received.spec.ts`
- `tests/e2e/bucket-j-shortlist-persistence.spec.ts`
- `tests/e2e/bucket-j-customer-welcome-email-delivers.spec.ts`

### 6.3 Manual smoke before merge

- Customer journey: sign up (email/password) → email confirmation lands from `noreply@baazar.io` → click link → `/signup/success` → welcome modal Step 0 → "Yes" → Step 1 (event date + categories) → Step 2 (3 personalized vendors) → heart first vendor → ❤️ confetti toast appears → `/vendors` → submit booking → `?welcome=true` modal renders → dismiss → booking detail
- Vendor journey: claim flow → wizard → publish → `noreply@baazar.io` welcome email arrives → customer requests first booking → 🎉 toast + celebratory email
- 48h follow-up: manually trigger cron, verify emails fire only for users matching window with no bookings + no prior send
- Mobile: dashboard nav drawer opens, items navigate correctly

---

## 7. Deploy sequencing

1. **Resend domain verification** — user does this first; without it, no emails work
2. **Supabase SMTP relay** — user enables after Resend verified
3. **Apply migrations 00062 + 00063 to dev** — Claude (or user) via Supabase SQL editor
4. **PR opens with all 4 layers** — single squash-merge target
5. **Pre-merge: smoke each thread on Vercel preview** — confirm emails arrive from baazar.io, modals work, shortlist persists, celebrations fire
6. **After merge: apply migrations to prod** — user does via Supabase SQL editor (manual policy)
7. **Vercel auto-deploys merged code** within 2-3 minutes
8. **Post-deploy: spot-check each customer + vendor journey on prod**

Zero-downtime: all new code reads/writes only new columns; existing flows unaffected.

---

## 8. Effort estimate

- Email infra (Resend DNS + Supabase SMTP): ~2 hours (user-side config + verification waiting)
- 4 React Email templates + shared layout: ~1 day
- Welcome modal redesign (both sides + customer branching): ~1 day
- Shortlist persistence (migration + API + page + heart wiring + Provider): ~1 day
- Mobile sidebar + DepositDialog polish + dashboard banner: ~0.5 day
- Celebration moments (3 firsts) + confetti component: ~0.5 day
- Bucket F leftovers sweep: ~0.5 day
- 7 E2E specs: ~1 day
- Buffer for review loops + scope creep: ~0.5 day

**Total: ~5 working days.** Single PR.

---

## 9. Success criteria

When Bucket J ships:

- Every Baazar email (auth + transactional) comes from `noreply@baazar.io`
- Customer + vendor both receive a branded React Email welcome at signup; 48h follow-up fires for disengaged users only
- Welcome modal collects useful info (or skips cleanly) and shows real personalized content with working heart buttons
- `saved_vendors` table populated; heart persists across sessions; `/dashboard/saved` lists them
- First customer save → ❤️ confetti toast; first customer booking → celebration modal with 3-step explainer; first vendor booking → 🎉 toast + celebratory email
- Mobile users can navigate dashboard sections via hamburger drawer
- DepositDialog shows cancellation policy visibly with real Terms anchor
- Bucket F leftovers ripped: zero remaining `payment_mode`, `PaymentMode`, `getCashToCollect`, `getPlatformCutRate`, `calculatePlatformCut`, `calculateVendorPending`, `calculatePlatformFee`, `cash_friendly` references
- 7 E2E specs pass in CI
- Heart-icon rule documented in DESIGN.md

---

## 10. Open questions

- **Unsubscribe token implementation:** spec mentions `?token=` for CAN-SPAM compliance. Open: dedicated `email_unsubscribe_tokens` table OR signed JWT? Recommend JWT (no DB write per send). Decide at implementation time.
- **Sample request cards (vendor modal Step 2) — i18n:** copy is currently English-only. Out of scope for Bucket J (i18n is its own bucket later).
- **48h cron timing precision:** "between 46 and 50 hours" window gives 4 hours of slack. Tight enough to not feel late, loose enough that a missed cron run doesn't skip the email.
