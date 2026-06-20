# Bucket B — IA / Copy / Brand Polish Design

**Status:** Approved (brainstorm) · awaiting implementation plan
**Date:** 2026-06-20
**Author:** Claude (with Sardar)
**Sequencing:** Bucket B runs after Bucket F (just merged) and before Bucket E (CRM polish) + Bucket C (cleanup). Sequence: D → A → F → **B** → E → C.

---

## 1. Why this exists

Buckets D.1, A, and F shipped foundational infrastructure (notifications, onboarding wizard polish, payment-model simplification). The product is functionally ready for soft launch, but several information-architecture, copy, and visual-polish gaps surface on every page:

- **The word "couple" is everywhere** — in the UI, in emails, in vendor-facing copy. The marketplace is broadening beyond weddings (photobooth vendors do birthdays, anniversaries, corporate events; the user's stated direction is "we'll have birthday parties and everything"). "Couple" feels wrong on a quinceañera booking.
- **Event types are too narrow.** Current canonical list is six wedding-adjacent categories (`engagement, mehndi, sangeet, wedding, reception, multiple`). A photobooth vendor signing up gets boxed into wedding-only positioning even though their actual book of business is mixed.
- **Languages list is missing Spanish.** Cultural specificity is a brand pillar but the languages multi-select skews entirely South-Asian / Arab; ignores a major US event-services language.
- **Guest count is asked too many times.** Customer fills it on the booking form, then again per-event row, then again on custom-request form. Same number, three inputs.
- **Vendor's own profile is broken UX.** Logged-in vendor visits `/vendors/[their-slug]` → sees the customer view with a "Book this vendor" button that does nothing useful. No clear signal "this is how customers see you," no path to edit.
- **The site feels visually flat.** Brand palette (cream + ink + hot-pink + haldi + indigo) is locked but the implementation has rendered as ~95% ink + cream. Hot-pink shows up rarely. No consistent hover treatment across primitives — some elements lift, some don't, some change color, some don't.
- **OnboardingGate modal pops up at weird times.** It intercepts every couple-role visitor to `/dashboard` until they explicitly dismiss it. A couple who pays a deposit, navigates back to the dashboard, gets hit by a "welcome to Baazar" modal mid-flow.

These are individually small but collectively they make the product feel unpolished. Bucket B is the pre-launch sweep that closes them as a single coherent pass.

---

## 2. Scope (in / out)

### In scope

#### 2.1 Copy rename — `couple` → `customer`

- All user-visible JSX strings where "couple," "couples," "couple's," "the couple" appears as English copy → `customer`, `customers`, `customer's`, `the customer`
- All email template strings in `src/lib/email/resend.ts` and any other template file
- Vendor dashboard Operations view: "couple's name" header label → "customer's name"
- "Couple cancellation" wording in cancellation copy stays as-is — that block was locked verbatim in Bucket F and uses "Customer cancellation" already (not "couple")
- Excluded from rename:
  - Database columns (`couple_user_id`, `couple_full_name`, `couple_contact_phone`, etc.) stay
  - TypeScript type discriminators (`role: 'couple' | 'vendor'`) stay
  - Internal variable names (`coupleId`, `coupleProfile`) stay (developer-facing)
  - The `roles.couple` enum value in the DB stays

The rename is a copy sweep, not a refactor.

#### 2.2 Event types expansion — option (c) broad

Canonical list grows from 6 to **20 categories** in two groups:

**Cultural / wedding-adjacent (existing + additions):**

1. engagement (existing)
2. roka
3. tilak
4. mehndi / henna (existing — relabeled)
5. sangeet (existing)
6. nikah
7. baraat
8. wedding / shaadi (existing — relabeled)
9. reception (existing)
10. walima / wedding feast
11. aqiqah / baby naming
12. multiple (existing — "multi-event booking")

**General celebration (new):** 13. birthday party 14. anniversary 15. corporate event 16. baby shower 17. bridal shower 18. graduation 19. quinceañera 20. sweet 16

The canonical list is a single shared constant (`EVENT_TYPES`). Every picker / search / filter on the site reads from it directly — no per-surface subsetting, no vendor-type-gated filtering. A photographer browses every event type; a couple/customer filters by every event type. The full list appears everywhere.

The list renders in pickers with the Cultural group above the General group, separated by a small `divider` label "Other celebrations" — preserves discoverability for our core cultural-vendor cohort without hiding the broader offering.

#### 2.3 Languages — add Spanish

`src/components/onboarding/StepDetails.tsx` (and any vendor-facing language multi-select / read-only display) gets `Spanish` added to the existing list. Position: alphabetical wherever the existing order is alphabetical; otherwise appended at end of the current list.

If the languages list is currently hard-coded scattered across multiple files, audit and consolidate to a single constant (`SPOKEN_LANGUAGES` in `src/types/index.ts`) as part of this thread. Bucket A's audit suggested 4-5 surfaces touch this; consolidate before adding Spanish so no surface ships without it.

#### 2.4 Guest count consolidation

- `BookingForm.tsx`: instead of one fixed `guestCount` state, derive the form shape from the selected package:
  - **Single-event package** → one `guestCount` input ("How many guests?")
  - **Multi-event package** → one input per event row ("Guests at [event_name]?")
- `EventRow.tsx`: drops the "optional override" affordance — the per-event guest count is now first-class for multi-event packages, not an override
- `CustomRequestForm.tsx`: dynamic events list — "+ Add another event" button adds an event row with date / time / guest count / event-type picker. Total guest count is a derived display, not an input.
- Booking row / detail displays read the per-event guest counts and either:
  - Show one number (single-event)
  - Show the per-event breakdown (multi-event), e.g. "Sangeet · 200 guests / Reception · 350 guests"
- Adjustment logic continues to support "Guest count over package limit" reasons — that doesn't change

The data shape stays the same — `booking_events.guest_count` already exists. The change is UI behavior driven by package event count.

#### 2.5 Vendor's own profile — owner banner + view-as-customer toggle

- `/vendors/[slug]` page detects "viewer is profile owner" via `user.id === vendor.user_id`
- If owner, render a sticky top banner above the profile:
  > ● This is how customers see your profile. [View as customer] [Edit profile]
- Banner uses cream background, ink text, hot-pink dot indicator, single-row layout. Sticky (`position: sticky; top: 0`) within the page scroll context.
- **"Edit profile"** button (ink fill, primary) → navigates to `/dashboard/profile/setup/basics`
- **"View as customer"** button (outline) → toggles client-side state that hides the banner AND disables the booking interactive elements (button shows but is inert — opens a small toast: "Preview mode — bookings disabled.")
- In view-as-customer mode, a small floating "Exit preview" pill appears bottom-right of viewport (hot-pink fill, cream text) → toggles back to owner mode
- Non-owner viewers (couples/customers, logged-out, other vendors) see ZERO banner, ZERO toggle — pure customer view as today
- State management: client-side `useState`. No persistence, no URL param — resets on page reload to owner mode.

#### 2.6 Hover system — hot-pink everywhere

The locked rule (from brainstorm):

> Every interactive element transitions to a hot-pink treatment on hover (border, text, or fill — whichever fits the element's resting state). Transitions are 180ms ease. Primary buttons additionally lift 1px with a hot-pink shadow; cards lift 2px with a stronger shadow.

Concrete element-by-element mapping (locked):

| Element                   | Idle                   | Hover                                                   |
| ------------------------- | ---------------------- | ------------------------------------------------------- |
| Primary button (ink fill) | bg-ink text-cream      | bg-hot-pink text-cream + translateY(-1px) + pink shadow |
| Outline button            | border-ink text-ink    | border-hot-pink text-hot-pink bg-pink/4                 |
| Text link                 | text-ink               | text-hot-pink underline-hot-pink                        |
| Vendor card               | border-ink/12          | border-hot-pink + translateY(-2px) + pink shadow        |
| Filter chip               | border-ink/20 bg-cream | border-hot-pink text-hot-pink bg-white                  |
| Nav item                  | text-ink               | text-hot-pink + underline (scaleX 0→1 transform)        |
| Icon button (circular)    | border-ink/20 text-ink | border-hot-pink text-hot-pink bg-pink/5                 |

Transition: `transition-all duration-[180ms] ease-out` for color/border, plus `duration-[180ms]` on transform for the lifts.

Implementation approach:

1. Define new Tailwind utility class shortcuts in `tailwind.config.ts`: `hover-pink-text`, `hover-pink-border`, `hover-pink-fill`, `hover-lift-card`. These compose existing tokens; no new colors.
2. Apply to all `shadcn` primitives in `src/components/ui/` — Button, Card, Input, Select, etc.
3. Apply to bespoke components: `VendorCard`, `FilterChip`, `NavItem` in `src/components/marketplace/`, `src/components/nav/`
4. Document the rule in `docs/DESIGN.md` under a new "Hover System" section so future components inherit it

Accessibility: respect `prefers-reduced-motion` — disable the translateY transforms when set, keep the color transition.

#### 2.7 OnboardingGate fix

**Trigger relocates from `/dashboard` to signup-success.**

- `src/app/dashboard/layout.tsx` removes the `<OnboardingGate>` render entirely
- New: signup-success page (or modal sequence after `/signup` POST returns) renders `<OnboardingGate role={...} onboardingCompleted={false} />`
- The gate's `onOpenChange` callback fires `POST /api/users/onboarding-complete` immediately when modal OPENS (not when it dismisses) — server-side this updates `users.onboarding_completed_at = now()` even if the user closes the browser
- Backfill via migration `00059`: `UPDATE users SET onboarding_completed_at = COALESCE(onboarding_completed_at, created_at) WHERE onboarding_completed_at IS NULL;` — every existing user gets marked complete using their creation date as the timestamp. No welcome modal pops for existing users.
- Vendor claim flow stays unchanged: claim-token redemption routes vendors directly into the wizard at `/dashboard/profile/setup/basics`, which is its own onboarding path — the modal never fires in that flow because claim-flow vendors are pre-marked `onboarding_completed_at = now()` at claim-redemption time
- Direct-signup vendors (no claim token, rare) see the `VendorOnboarding` modal once on signup-success → mark-on-show → wizard available from dashboard

Implementation note: the "mark-on-show" semantics decouple modal display from form completion. Even if the modal renders, the user clicks Esc immediately, and never opens it again — they're still recorded as "onboarded" because their first dashboard visit isn't interrupted. The modal is informational, not a gate to product features.

### Out of scope (deferred)

- Vendor-side notification preferences (which event types they want leads for) — Bucket E
- Customer-side saved searches / preferences — post-launch
- Multi-language UI (i18n for the wizard / dashboard) — far future; Spanish addition here is data only, not UI translation
- Photo-thumbnail selection UX (locked as required but addressed in Bucket E's vendor CRM polish) — see memory `baazar_vendor_thumbnail_selection_requirement`
- Brand-palette injection at rest (more color in resting states beyond the hover system) — separate bucket if needed
- Email template visual rebrand — Bucket E or post-launch
- VendorOnboarding modal content rewrite — leave as-is, just relocate trigger
- CoupleOnboarding modal content rewrite — leave as-is, just relocate trigger

---

## 3. Architecture details

### 3.1 Canonical lists consolidation

Three constants get moved/created in `src/types/index.ts`:

```ts
export const EVENT_TYPES = [
  // Cultural / wedding-adjacent
  { id: 'engagement', label: 'Engagement', group: 'cultural' },
  { id: 'roka', label: 'Roka', group: 'cultural' },
  { id: 'tilak', label: 'Tilak', group: 'cultural' },
  { id: 'mehndi', label: 'Mehndi / Henna', group: 'cultural' },
  { id: 'sangeet', label: 'Sangeet', group: 'cultural' },
  { id: 'nikah', label: 'Nikah', group: 'cultural' },
  { id: 'baraat', label: 'Baraat', group: 'cultural' },
  { id: 'wedding', label: 'Wedding / Shaadi', group: 'cultural' },
  { id: 'reception', label: 'Reception', group: 'cultural' },
  { id: 'walima', label: 'Walima / Wedding Feast', group: 'cultural' },
  { id: 'aqiqah', label: 'Aqiqah / Baby Naming', group: 'cultural' },
  { id: 'multiple', label: 'Multi-event booking', group: 'cultural' },
  // General celebration
  { id: 'birthday_party', label: 'Birthday party', group: 'general' },
  { id: 'anniversary', label: 'Anniversary', group: 'general' },
  { id: 'corporate_event', label: 'Corporate event', group: 'general' },
  { id: 'baby_shower', label: 'Baby shower', group: 'general' },
  { id: 'bridal_shower', label: 'Bridal shower', group: 'general' },
  { id: 'graduation', label: 'Graduation', group: 'general' },
  { id: 'quinceanera', label: 'Quinceañera', group: 'general' },
  { id: 'sweet_16', label: 'Sweet 16', group: 'general' },
] as const;

export type EventType = (typeof EVENT_TYPES)[number]['id'];
```

The DB enum / TEXT+CHECK constraint on `booking_events.event_type` (or whatever the column is called) grows to accept the 14 new ids. Migration `00059_expand_event_types.sql` adds them.

```ts
export const SPOKEN_LANGUAGES = [
  'English',
  'Hindi',
  'Urdu',
  'Punjabi',
  'Gujarati',
  'Arabic',
  'Spanish', // ← new
  // any other existing entries preserved in their existing order
] as const;
export type SpokenLanguage = (typeof SPOKEN_LANGUAGES)[number];
```

Audit during T-2 to confirm the exact existing language list; the spec above is best-effort from memory.

### 3.2 Guest count derivation

Pseudocode for `BookingForm`:

```tsx
const events = selectedPackage.events; // array of { event_type, name }
const eventCount = events.length;

const [guestCounts, setGuestCounts] = useState<Record<string, number>>(
  () => Object.fromEntries(events.map((e, i) => [e.id ?? String(i), 50]))
);

return (
  <Section>
    {eventCount === 1 ? (
      <Field label="How many guests?">
        <Input
          type="number"
          value={guestCounts[events[0].id]}
          onChange={...}
        />
      </Field>
    ) : (
      events.map((event) => (
        <Field
          key={event.id}
          label={`Guests at ${event.name}?`}
        >
          <Input ... />
        </Field>
      ))
    )}
  </Section>
);
```

On submit, the booking-creation API receives a `guest_counts_by_event: { [event_id]: number }` payload and creates `booking_events` rows with the per-event headcount. Single-event packages submit one count.

### 3.3 Vendor's own profile detection

`src/app/(marketplace)/vendors/[slug]/page.tsx`:

```tsx
const { vendor } = await fetchVendorBySlug(params.slug);
const supabase = createServerComponentClient();
const {
  data: { user },
} = await supabase.auth.getUser();
const isOwner = user?.id === vendor.user_id;

return <VendorProfile vendor={vendor} isOwner={isOwner} />;
```

`VendorProfile` component manages the local owner-mode state:

```tsx
'use client';

export function VendorProfile({ vendor, isOwner }: Props) {
  const [previewMode, setPreviewMode] = useState(false);
  const showBanner = isOwner && !previewMode;

  return (
    <>
      {showBanner && <OwnerBanner vendor={vendor} onPreview={() => setPreviewMode(true)} />}
      <ProfileBody vendor={vendor} interactive={!isOwner || previewMode} />
      {isOwner && previewMode && <ExitPreviewPill onExit={() => setPreviewMode(false)} />}
    </>
  );
}
```

`interactive` prop disables Book button + form submissions when false. Toast appears on inert-button click.

### 3.4 Hover system Tailwind utilities

Add to `tailwind.config.ts` plugin layer:

```ts
plugins: [
  plugin(function ({ addUtilities }) {
    addUtilities({
      '.hover-pink-text': {
        '@apply transition-colors duration-[180ms] ease-out hover:text-hot-pink': {},
      },
      '.hover-pink-border': {
        '@apply transition-colors duration-[180ms] ease-out hover:border-hot-pink': {},
      },
      '.hover-pink-fill': {
        '@apply transition-colors duration-[180ms] ease-out hover:bg-hot-pink': {},
      },
      '.hover-lift': {
        '@apply transition-transform duration-[180ms] ease-out hover:-translate-y-0.5 motion-reduce:hover:translate-y-0': {},
      },
      '.hover-lift-card': {
        '@apply transition-all duration-[180ms] ease-out hover:-translate-y-1 hover:shadow-pink motion-reduce:hover:translate-y-0': {},
      },
    });
  }),
],
```

Then sweep components to apply. The `shadow-pink` token uses `0 8px 20px rgba(209, 0, 108, 0.15)` defined in the theme extension.

### 3.5 OnboardingGate relocation

- **Delete** the `<OnboardingGate>` JSX from `src/app/dashboard/layout.tsx` (line ~36 per audit)
- **New file**: `src/app/(auth)/signup/success/page.tsx` — renders the gate. This page is the post-signup redirect target.
- **OR** modify the existing signup confirmation flow to inject the gate inline — depends on current signup architecture (T1 audit decides which)
- The gate's `onOpenChange(open)` handler fires `POST /api/users/onboarding-complete` exactly once on the `open=true` transition (use `useEffect` with a ref to ensure it fires only once even on re-renders)
- API endpoint `/api/users/onboarding-complete` (already exists per Bucket A audit) accepts the existing call shape — no change needed
- Migration `00059_expand_event_types_and_backfill_onboarding.sql` runs the backfill UPDATE

---

## 4. Database changes

### 4.1 Migration `00059_bucket_b_event_types_and_onboarding_backfill.sql`

Single migration covering all DB changes (per D.1's lesson — single file, single-line statements):

```sql
-- Bucket B: expand event_type CHECK constraint + backfill onboarding_completed_at for existing users.

-- 1) Expand event_type allowed values on booking_events
ALTER TABLE booking_events DROP CONSTRAINT IF EXISTS booking_events_event_type_check;
ALTER TABLE booking_events ADD CONSTRAINT booking_events_event_type_check CHECK (event_type IN ('engagement', 'roka', 'tilak', 'mehndi', 'sangeet', 'nikah', 'baraat', 'wedding', 'reception', 'walima', 'aqiqah', 'multiple', 'birthday_party', 'anniversary', 'corporate_event', 'baby_shower', 'bridal_shower', 'graduation', 'quinceanera', 'sweet_16'));

-- 2) Expand event_type allowed values on packages (if column exists with CHECK)
ALTER TABLE packages DROP CONSTRAINT IF EXISTS packages_event_type_check;
ALTER TABLE packages ADD CONSTRAINT packages_event_type_check CHECK (event_type IS NULL OR event_type IN ('engagement', 'roka', 'tilak', 'mehndi', 'sangeet', 'nikah', 'baraat', 'wedding', 'reception', 'walima', 'aqiqah', 'multiple', 'birthday_party', 'anniversary', 'corporate_event', 'baby_shower', 'bridal_shower', 'graduation', 'quinceanera', 'sweet_16'));

-- 3) Backfill onboarding_completed_at for existing users
UPDATE users SET onboarding_completed_at = COALESCE(onboarding_completed_at, created_at) WHERE onboarding_completed_at IS NULL;
```

Single-line per statement (Supabase web SQL editor compatibility). The `DROP CONSTRAINT IF EXISTS` + `ADD CONSTRAINT` pattern is the idempotent way to mutate a CHECK constraint in Postgres.

If the `packages.event_type` constraint doesn't exist (audit confirms), drop statement #2.

### 4.2 Pre-deploy state check

Before merge:

1. Confirm exact existing event_type CHECK values on prod (`information_schema.check_constraints`)
2. Count `users` rows where `onboarding_completed_at IS NULL` (sanity for backfill blast radius)
3. Spot-check whether any orphan booking_events have event_types that wouldn't fit the new CHECK (shouldn't — we're only adding values)

---

## 5. Locked verbatim copy

### 5.1 Vendor own-profile banner

> ● This is how customers see your profile. **[View as customer]** **[Edit profile]**

(Hot-pink dot · ink text · cream background · 12px vertical padding · 24px horizontal · sticky top.)

### 5.2 Preview mode pill

> ← Exit preview

(Hot-pink fill · cream text · circular · bottom-right · 24px from each edge · fixed.)

### 5.3 Preview-mode book-button toast

> Preview mode — bookings disabled.

(Toast appears for 2 seconds when an owner in preview mode clicks an inert button. Cream background · ink text · top of viewport.)

### 5.4 Event-picker group divider label

> Other celebrations

(Small uppercase 11px label · ink/50 opacity · letter-spacing 0.5px · appears between the cultural group and general group.)

---

## 6. Testing approach

### 6.1 Unit tests

- `EVENT_TYPES` constant: snapshot test asserting all 20 ids + their group assignments
- `SPOKEN_LANGUAGES` constant: snapshot test asserting Spanish is present and the existing entries are preserved
- `BookingForm` guest-count derivation: tests with a single-event package (renders one input) and a multi-event package (renders N inputs)
- `OnboardingGate` mark-on-show: tests that `onOpenChange(true)` fires the API call exactly once (use a mocked fetch + render-twice scenario)
- Tailwind utility classes: not unit-tested (they're class string transforms)

### 6.2 E2E specs (Playwright)

Two new specs:

- `bucket-b-event-types-everywhere.spec.ts`: signs in as a couple, opens the search filter on `/vendors`, asserts all 20 categories are visible in the dropdown. Signs in as a vendor, opens the same picker on the wizard's StepLocation event-types multi-select, asserts the same 20.
- `bucket-b-vendor-own-profile.spec.ts`: signs in as a vendor, navigates to `/vendors/[their-slug]`, asserts the owner banner is visible. Clicks "View as customer," asserts the banner disappears and the Book button is inert (clicking it shows the toast, not a checkout). Clicks "Exit preview" pill, asserts banner returns.
- Update `bucket-a-form-errors.spec.ts` if it relied on the OnboardingGate-on-dashboard behavior — most likely it didn't, but check.

### 6.3 Manual smoke before merge

- Couple journey: sign up → see welcome modal → close it → navigate to dashboard → no modal interruption → search /vendors → see all 20 event types in the filter
- Vendor journey: claim → wizard → publish profile → visit own /vendors/[slug] → see banner → click view-as-customer → see customer view → exit preview
- Hover sweep: hover-test 10 components across the marketplace homepage, /vendors index, vendor profile, dashboard — every interactive element shows the hot-pink hover treatment
- Email smoke: trigger a deposit-confirmation email → verify the body says "customer" not "couple"

---

## 7. Deploy sequencing

1. **PR opens with all 7 threads** as one squash-merge target
2. Migration `00059` ships in the PR but is NOT applied to prod until after merge
3. Pre-merge: apply migration to dev, verify backfill count + new CHECK constraint, smoke each thread
4. After merge: apply migration to prod via Supabase SQL editor (manual, per migration apply policy)
5. Vercel auto-deploy picks up the merged code within 2-3 minutes
6. Post-deploy: spot-check the welcome-modal doesn't fire on `/dashboard`, the hot-pink hover treatment renders, the new event types appear in pickers

Zero-downtime: code first reads from `EVENT_TYPES` constant, which is purely client-side. The DB CHECK only matters when inserting NEW rows with new event types — existing rows are unaffected because the new CHECK is a superset of the old.

---

## 8. Effort estimate

- T1 (copy rename audit + sweep): 4 hours
- T2 (event types constant + DB CHECK migration + picker audit): 4 hours
- T3 (Spanish + languages consolidation): 1 hour
- T4 (guest count form rework): 4 hours
- T5 (vendor own-profile banner + view-as-customer): 4 hours
- T6 (hover system Tailwind utilities + component sweep): 6 hours
- T7 (OnboardingGate relocation + backfill): 3 hours
- T8 (E2E specs + manual smoke): 3 hours
- Buffer for review loops + scope creep: 4 hours

**Total: ~32 hours / 4 working days.** Realistic 5-day calendar window with PR review + prod migration apply.

---

## 9. Success criteria

When Bucket B ships:

- Zero "couple" strings in user-facing JSX or emails (excluding the deliberate Bucket F locked "Customer cancellation" / "Vendor cancellation" headers which already use the right word)
- All 20 event types selectable from every event-picker surface (vendor wizard, search filter, custom request, etc.)
- Spanish appears in every languages list, in alphabetical position
- A multi-event package booking shows per-event guest count inputs at booking time and per-event headcount badges on the vendor's booking view
- A vendor visiting their own profile sees the banner; clicking view-as-customer flips them to the customer view; clicking exit-preview returns them to owner mode
- Every interactive primitive (button, link, card, chip, nav, icon-button) transitions to a hot-pink hover state in 180ms
- Couples no longer see a welcome modal on `/dashboard` — it fires once at signup-success and never re-appears
- `users.onboarding_completed_at IS NULL` returns 0 rows on prod after migration apply

---

## 10. Open questions

None blocking. The brainstorm resolved all 7 threads through user lock-in.

Potential follow-ups (post-Bucket B):

- Do we want event-type filtering by vendor category (e.g. mehndi artists shouldn't see "Sweet 16" in their lead feed)? Currently spec is "everyone sees everything." Revisit if vendors complain of irrelevant leads.
- Should the OnboardingGate become a multi-step / progress-tracked flow (rather than a single modal)? Out of scope; could be a separate UX initiative.
- Hover system on touch devices — `:hover` doesn't fire reliably. Currently spec relies on Tailwind defaults which gate `:hover` behind `@media (hover: hover)`. Acceptable; touch users see the resting state which is fine.
