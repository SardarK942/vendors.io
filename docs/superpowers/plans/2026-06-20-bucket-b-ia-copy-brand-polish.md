# Bucket B — IA / Copy / Brand Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pre-launch IA/copy/brand sweep — couple→customer rename, event types expanded to 20 categories with dual cultural labels, Spanish added, guest count derived from package event count, vendor own-profile owner banner + view-as-customer toggle, hot-pink hover system across all interactive primitives, OnboardingGate relocated from `/dashboard` to signup-success with mark-on-show + existing-user backfill.

**Architecture:** Seven independent threads in one PR. Three rely on a single migration (`00059`): event_type CHECK expansion + onboarding_completed_at backfill. Three are pure-frontend sweeps (copy rename, hover system, guest-count UI). One is component-level (vendor own-profile banner). Tasks fan out from a shared T1 audit; T2 lands the migration + canonical `EVENT_TYPES`; threads after T2 are mostly parallel-safe.

**Tech Stack:** Next.js 14 App Router · Supabase (Postgres + RLS, TEXT+CHECK constraints) · Tailwind + shadcn · React 18 client/server components · Vitest (unit) · Playwright (E2E, `workers=1`, `fullyParallel=false`).

## Global Constraints

- **Spec source of truth:** `docs/superpowers/specs/2026-06-20-bucket-b-ia-copy-brand-polish-design.md` — every task's requirements implicitly include the spec's locked rules.
- **Git workflow:** branch off `main` → `feat/bucket-b-ia-copy-brand` → squash-merge via `gh pr create`. NEVER commit directly to `main`.
- **Migration apply policy:** Claude writes migration SQL but does NOT apply. User applies to dev via Supabase web SQL editor before PR opens, then to prod after squash-merge.
- **Migration shape lesson (from D.1):** all migration SQL must be single-line statements. The Supabase web SQL editor mangles multi-line `ALTER TABLE`.
- **EVENT_TYPES canonical list (20 entries, exact ids + labels):**
  ```
  cultural: engagement, roka, tilak, mehndi (label "Mehndi / Henna"),
            sangeet, nikah, baraat, wedding (label "Wedding / Shaadi"),
            reception, walima (label "Walima / Wedding Feast"),
            aqiqah (label "Aqiqah / Baby Naming"), multiple (label "Multi-event booking")
  general:  birthday_party, anniversary, corporate_event, baby_shower,
            bridal_shower, graduation, quinceanera, sweet_16
  ```
- **All 20 event types appear in every picker** — no per-surface subsetting, no vendor-type filtering.
- **Cultural group renders above General group**, separated by an "Other celebrations" divider label.
- **Copy rename excludes:** DB columns, TS type discriminators (`role: 'couple' | 'vendor'`), internal variable names, `roles.couple` DB enum.
- **Locked verbatim banner copy:** `● This is how customers see your profile. [View as customer] [Edit profile]`
- **Locked verbatim toast copy:** `Preview mode — bookings disabled.`
- **Locked verbatim exit-preview pill:** `← Exit preview`
- **Locked verbatim divider label:** `Other celebrations`
- **Hover system:** every interactive primitive transitions to hot-pink on hover in 180ms. Primary buttons lift `-translate-y-0.5` + pink shadow; cards lift `-translate-y-1` + stronger pink shadow. Respects `prefers-reduced-motion`.
- **Brand tokens (from `docs/DESIGN.md`):** ink `#1B1414`, cream `#FBF6EC`, hot-pink `#D1006C`.
- **OnboardingGate semantics:** mark-on-show (fire `POST /api/users/onboarding-complete` when modal opens, not when it dismisses). Trigger lives only on signup-success page, NOT on `/dashboard`.

---

## File Structure

**New files:**

- `supabase/migrations/00059_bucket_b_event_types_and_onboarding_backfill.sql`
- `src/components/marketplace/OwnerBanner.tsx`
- `src/components/marketplace/ExitPreviewPill.tsx`
- `tests/e2e/bucket-b-event-types-everywhere.spec.ts`
- `tests/e2e/bucket-b-vendor-own-profile.spec.ts`

**Modified files (rough — T1 audit refines):**

- `src/types/index.ts` — `EVENT_TYPES` + `SPOKEN_LANGUAGES` canonical constants
- `src/types/database.types.ts` — possibly widen `BookingEvent.event_type` enum union
- `tailwind.config.ts` — new utility shortcuts + `shadow-pink` token
- `docs/DESIGN.md` — new Hover System section
- `src/app/dashboard/layout.tsx` — remove `<OnboardingGate>` JSX
- `src/app/(auth)/signup/success/page.tsx` — (or wherever signup completes) render the gate
- `src/app/(marketplace)/vendors/[slug]/page.tsx` — fetch `isOwner`, pass to client component
- `src/components/marketplace/VendorProfile.tsx` — banner/preview-mode wiring (file may not exist; T1 audit decides)
- `src/components/onboarding/StepDetails.tsx` — read from `SPOKEN_LANGUAGES`
- `src/components/onboarding/StepLocation.tsx` (if it has event-type pickers) — read from `EVENT_TYPES`
- `src/components/booking/BookingForm.tsx` — guest count derived from package event count
- `src/components/booking/EventRow.tsx` — drop optional-override affordance
- `src/components/booking/CustomRequestForm.tsx` — dynamic events list
- `src/components/booking/BookingDetail.tsx` — per-event guest display
- `src/components/booking/BookingCard.tsx` — per-event guest badge
- `src/components/ui/Button.tsx`, `Card.tsx`, etc. — hover-pink utilities applied
- `src/components/marketplace/VendorCard.tsx`, `FilterChip.tsx`, `NavItem.tsx` — hover-pink utilities
- `src/lib/email/resend.ts` — "couple" → "customer" in any user-visible strings
- Various JSX surfaces — couple→customer copy sweep (T1 audit produces full list)

---

## Task List

- **T1.** Audit: enumerate all surfaces touched
- **T2.** `EVENT_TYPES` constant + migration `00059`
- **T3.** Event-picker sweep — wire all surfaces to `EVENT_TYPES`
- **T4.** `SPOKEN_LANGUAGES` constant + Spanish addition
- **T5.** Copy rename — `couple` → `customer` sweep
- **T6.** Guest count: `BookingForm` derives shape from package
- **T7.** Guest count: `CustomRequestForm` dynamic events
- **T8.** Guest count: display in booking views
- **T9.** Tailwind hover utilities + `shadow-pink` token
- **T10.** Hover sweep on `shadcn` primitives
- **T11.** Hover sweep on bespoke marketplace components
- **T12.** Document Hover System in `DESIGN.md`
- **T13.** Vendor own-profile detection + `OwnerBanner`
- **T14.** View-as-customer toggle + `ExitPreviewPill` + inert mode
- **T15.** Relocate `OnboardingGate` to signup-success + mark-on-show
- **T16.** E2E specs (event types everywhere + vendor own profile)
- **T17.** PR + manual smoke

---

### Task 1: Audit — enumerate all surfaces touched

**Files:** none modified. Produces an audit report consumed by T2-T15.

**Interfaces:**

- Consumes: nothing.
- Produces: `.git/sdd/bucket-b-audit.md` with three sections:
  - **Event-picker surfaces** — every file that renders a `<select>` / `<Combobox>` / `<MultiSelect>` of event types, OR reads/writes `event_type` from `booking_events` / `packages`
  - **Language-list surfaces** — every file that hard-codes `['English', 'Hindi', 'Urdu', ...]` or similar
  - **`couple` user-visible strings** — every JSX string containing "couple" that's rendered to a user (excludes type discriminators, DB column names, internal variables)
  - **OnboardingGate consumers** — files that import or render `<OnboardingGate>` and the API endpoint(s) it calls

- [ ] **Step 1: Find event-picker surfaces**

```bash
grep -rln "EventType\|event_type\|EVENT_TYPES\|engagement.*mehndi\|wedding.*reception" src/ 2>/dev/null | head -30
```

Append a section to the audit report listing each file + a one-line description of what the file does with event types.

- [ ] **Step 2: Find language-list surfaces**

```bash
grep -rn "'English'\|'Hindi'\|'Urdu'\|'Punjabi'\|'Gujarati'\|'Arabic'\|SPOKEN_LANGUAGES\|spokenLanguages" src/ 2>/dev/null | head -30
```

Append. Note whether each surface uses a shared constant or a local array literal.

- [ ] **Step 3: Find user-visible `couple` strings**

```bash
grep -rn "'.*[Cc]ouple.*'\|\"[Cc]ouple\|>.*[Cc]ouple\|the couple\|couple's\|couples\|Couple" src/ 2>/dev/null | grep -v "couple_user_id\|couple_full_name\|coupleId\|coupleProfile\|coupleUserId\|coupleCancellation\|cancellerRole.*couple\|role.*'couple'\|'couple' |" | head -60
```

The grep is rough — filter out type-system + DB-column matches. Hand-review each match: is it rendered to a user? Add to audit only if yes.

Hint: `src/components/booking/*.tsx`, `src/components/dashboard/*.tsx`, `src/lib/email/resend.ts` are the high-value surfaces. The wizard (`StepBasics.tsx`, etc.) is likely clean of `couple` strings since it's vendor-facing.

- [ ] **Step 4: Find OnboardingGate consumers**

```bash
grep -rn "OnboardingGate\|CoupleOnboarding\|VendorOnboarding\|onboarding-complete\|onboarding_completed_at" src/ 2>/dev/null | head -20
```

Append. Identify:

- Which layout(s) render `<OnboardingGate>` — likely just `src/app/dashboard/layout.tsx`
- The signup flow's success page or post-signup redirect target
- The `/api/users/onboarding-complete` endpoint

- [ ] **Step 5: Find guest-count surfaces**

```bash
grep -rn "guestCount\|guest_count\|guests\|Guests" src/components/booking/ src/components/marketplace/ 2>/dev/null | head -30
```

Append a section listing every place that reads or writes guest count.

- [ ] **Step 6: Find shadcn primitive paths**

```bash
ls src/components/ui/ 2>/dev/null | head -20
```

Append. T10 will sweep these for hover utilities.

- [ ] **Step 7: Write `.git/sdd/bucket-b-audit.md`**

Consolidate all findings into one report file. Each section starts with the count of surfaces touched + a numbered list. Used by T2-T15 to scope their work.

- [ ] **Step 8: Operational task — no commit.** Proceed to T2.

---

### Task 2: `EVENT_TYPES` canonical constant + migration `00059`

**Files:**

- Modify: `src/types/index.ts` (add `EVENT_TYPES` constant)
- Create: `supabase/migrations/00059_bucket_b_event_types_and_onboarding_backfill.sql`
- Test: `src/__tests__/types/event-types.test.ts`

**Interfaces:**

- Consumes: nothing.
- Produces:

  ```ts
  export const EVENT_TYPES = [...] as const;
  export type EventTypeId = typeof EVENT_TYPES[number]['id'];
  export const CULTURAL_EVENT_TYPES = EVENT_TYPES.filter(e => e.group === 'cultural');
  export const GENERAL_EVENT_TYPES = EVENT_TYPES.filter(e => e.group === 'general');
  ```

  Migration applies idempotent CHECK constraint expansion + onboarding backfill.

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/types/event-types.test.ts
import { describe, it, expect } from 'vitest';
import { EVENT_TYPES, CULTURAL_EVENT_TYPES, GENERAL_EVENT_TYPES } from '@/types';

describe('EVENT_TYPES', () => {
  it('has exactly 20 entries', () => {
    expect(EVENT_TYPES).toHaveLength(20);
  });

  it('has 12 cultural + 8 general', () => {
    expect(CULTURAL_EVENT_TYPES).toHaveLength(12);
    expect(GENERAL_EVENT_TYPES).toHaveLength(8);
  });

  it('has expected cultural ids in order', () => {
    expect(CULTURAL_EVENT_TYPES.map((e) => e.id)).toEqual([
      'engagement',
      'roka',
      'tilak',
      'mehndi',
      'sangeet',
      'nikah',
      'baraat',
      'wedding',
      'reception',
      'walima',
      'aqiqah',
      'multiple',
    ]);
  });

  it('has expected general ids in order', () => {
    expect(GENERAL_EVENT_TYPES.map((e) => e.id)).toEqual([
      'birthday_party',
      'anniversary',
      'corporate_event',
      'baby_shower',
      'bridal_shower',
      'graduation',
      'quinceanera',
      'sweet_16',
    ]);
  });

  it('uses locked dual labels for wedding/mehndi/walima/aqiqah', () => {
    const byId = Object.fromEntries(EVENT_TYPES.map((e) => [e.id, e.label]));
    expect(byId.wedding).toBe('Wedding / Shaadi');
    expect(byId.mehndi).toBe('Mehndi / Henna');
    expect(byId.walima).toBe('Walima / Wedding Feast');
    expect(byId.aqiqah).toBe('Aqiqah / Baby Naming');
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

```bash
npx vitest run src/__tests__/types/event-types.test.ts
```

- [ ] **Step 3: Add the constant to `src/types/index.ts`**

```ts
export const EVENT_TYPES = [
  // Cultural / wedding-adjacent
  { id: 'engagement', label: 'Engagement', group: 'cultural' as const },
  { id: 'roka', label: 'Roka', group: 'cultural' as const },
  { id: 'tilak', label: 'Tilak', group: 'cultural' as const },
  { id: 'mehndi', label: 'Mehndi / Henna', group: 'cultural' as const },
  { id: 'sangeet', label: 'Sangeet', group: 'cultural' as const },
  { id: 'nikah', label: 'Nikah', group: 'cultural' as const },
  { id: 'baraat', label: 'Baraat', group: 'cultural' as const },
  { id: 'wedding', label: 'Wedding / Shaadi', group: 'cultural' as const },
  { id: 'reception', label: 'Reception', group: 'cultural' as const },
  { id: 'walima', label: 'Walima / Wedding Feast', group: 'cultural' as const },
  { id: 'aqiqah', label: 'Aqiqah / Baby Naming', group: 'cultural' as const },
  { id: 'multiple', label: 'Multi-event booking', group: 'cultural' as const },
  // General celebration
  { id: 'birthday_party', label: 'Birthday party', group: 'general' as const },
  { id: 'anniversary', label: 'Anniversary', group: 'general' as const },
  { id: 'corporate_event', label: 'Corporate event', group: 'general' as const },
  { id: 'baby_shower', label: 'Baby shower', group: 'general' as const },
  { id: 'bridal_shower', label: 'Bridal shower', group: 'general' as const },
  { id: 'graduation', label: 'Graduation', group: 'general' as const },
  { id: 'quinceanera', label: 'Quinceañera', group: 'general' as const },
  { id: 'sweet_16', label: 'Sweet 16', group: 'general' as const },
] as const;

export type EventTypeId = (typeof EVENT_TYPES)[number]['id'];

export const CULTURAL_EVENT_TYPES = EVENT_TYPES.filter((e) => e.group === 'cultural');
export const GENERAL_EVENT_TYPES = EVENT_TYPES.filter((e) => e.group === 'general');
```

If `src/types/index.ts` already exports a narrower `EventType` (the original 6-id union), KEEP it for now under a different name like `LegacyEventType` (deprecated) — T3 will migrate consumers. Don't break existing types this task.

Actually simpler: rename the legacy export to `EVENT_TYPES_LEGACY` with a `@deprecated` JSDoc, leave it in place, and let T3 migrate consumers off it. Final cleanup happens in T17.

- [ ] **Step 4: Run, expect PASS**

```bash
npx vitest run src/__tests__/types/event-types.test.ts
```

Expected: 5/5 passing.

- [ ] **Step 5: Find the existing event_type CHECK constraint on prod**

If you have prod DB access:

```bash
PGPASSWORD="$PROD_DB_PASSWORD" psql -h db.obpdgihdskbxzgyctaib.supabase.co -p 5432 -U postgres -d postgres -c "SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid IN ('booking_events'::regclass, 'packages'::regclass) AND contype = 'c' AND conname LIKE '%event_type%';"
```

Otherwise have the user paste the query result. Record the exact existing CHECK definition for both tables (booking_events + packages, if both have it) so the migration's DROP CONSTRAINT references the correct constraint name.

Likely names: `booking_events_event_type_check`, `packages_event_type_check`. Verify.

- [ ] **Step 6: Count NULL-onboarding users on prod**

```bash
PGPASSWORD="$PROD_DB_PASSWORD" psql -h db.obpdgihdskbxzgyctaib.supabase.co -p 5432 -U postgres -d postgres -c "SELECT COUNT(*) FROM users WHERE onboarding_completed_at IS NULL;"
```

Record. Should be a small number (most users will have been backfilled or completed). If > 50, sanity-check with the user before applying the backfill.

- [ ] **Step 7: Write the migration**

```sql
-- supabase/migrations/00059_bucket_b_event_types_and_onboarding_backfill.sql
-- Bucket B: expand event_type CHECK constraint + backfill onboarding_completed_at.
-- All single-line statements (Supabase web SQL editor compatibility).

ALTER TABLE booking_events DROP CONSTRAINT IF EXISTS booking_events_event_type_check;
ALTER TABLE booking_events ADD CONSTRAINT booking_events_event_type_check CHECK (event_type IN ('engagement', 'roka', 'tilak', 'mehndi', 'sangeet', 'nikah', 'baraat', 'wedding', 'reception', 'walima', 'aqiqah', 'multiple', 'birthday_party', 'anniversary', 'corporate_event', 'baby_shower', 'bridal_shower', 'graduation', 'quinceanera', 'sweet_16'));
ALTER TABLE packages DROP CONSTRAINT IF EXISTS packages_event_type_check;
ALTER TABLE packages ADD CONSTRAINT packages_event_type_check CHECK (event_type IS NULL OR event_type IN ('engagement', 'roka', 'tilak', 'mehndi', 'sangeet', 'nikah', 'baraat', 'wedding', 'reception', 'walima', 'aqiqah', 'multiple', 'birthday_party', 'anniversary', 'corporate_event', 'baby_shower', 'bridal_shower', 'graduation', 'quinceanera', 'sweet_16'));
UPDATE users SET onboarding_completed_at = COALESCE(onboarding_completed_at, created_at) WHERE onboarding_completed_at IS NULL;
```

If T2 step 5 found that `packages.event_type` has no CHECK constraint (e.g. the column is plain TEXT with no enum gate), DROP that statement from the migration — no point dropping a constraint that doesn't exist (though `IF EXISTS` makes it a safe no-op).

If the existing constraint name differs from `booking_events_event_type_check` (e.g. `chk_booking_events_event_type`), update the migration to use the actual name discovered in Step 5.

- [ ] **Step 8: Do NOT apply the migration yet**

The user applies via Supabase SQL editor pre-merge:

- Dev: https://supabase.com/dashboard/project/lquvhjedlzubqusnfaak/sql/new

T17 surfaces the SQL to the user for dev application before opening the PR.

- [ ] **Step 9: Run typecheck**

```bash
npm run typecheck
```

Expected: 0 errors. New constant + types don't break anything because consumers haven't switched yet.

- [ ] **Step 10: Commit**

```bash
git add src/types/index.ts src/__tests__/types/event-types.test.ts supabase/migrations/00059_bucket_b_event_types_and_onboarding_backfill.sql
git commit -m "feat(types): add EVENT_TYPES canonical 20-entry constant + migration 00059 (Bucket B T2)"
```

---

### Task 3: Event-picker sweep — wire all surfaces to `EVENT_TYPES`

**Files:**

- Modify: every file from T1 step 1's audit that renders an event-type picker or hard-codes the legacy 6-entry list
- Likely include: `src/components/onboarding/StepLocation.tsx`, `src/components/onboarding/StepDetails.tsx`, `src/components/booking/EventRow.tsx`, `src/components/marketplace/VendorFilters.tsx` (or similar), `src/components/booking/CustomRequestForm.tsx`

**Interfaces:**

- Consumes: `EVENT_TYPES`, `CULTURAL_EVENT_TYPES`, `GENERAL_EVENT_TYPES` from T2.
- Produces: every event-picker reads from the canonical list; renders cultural group above general group with "Other celebrations" divider; legacy `EVENT_TYPES_LEGACY` no longer imported anywhere.

- [ ] **Step 1: Build the picker pattern (small helper)**

Add a shared rendering helper in `src/components/ui/EventTypePicker.tsx`:

```tsx
'use client';

import { CULTURAL_EVENT_TYPES, GENERAL_EVENT_TYPES, type EventTypeId } from '@/types';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectGroup,
  SelectLabel,
  SelectItem,
} from '@/components/ui/select';

interface EventTypePickerProps {
  value?: EventTypeId;
  onValueChange: (id: EventTypeId) => void;
  placeholder?: string;
}

export function EventTypePicker({
  value,
  onValueChange,
  placeholder = 'Select event type',
}: EventTypePickerProps) {
  return (
    <Select value={value} onValueChange={(v) => onValueChange(v as EventTypeId)}>
      <SelectTrigger className="hover-pink-border">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {CULTURAL_EVENT_TYPES.map((e) => (
            <SelectItem key={e.id} value={e.id}>
              {e.label}
            </SelectItem>
          ))}
        </SelectGroup>
        <SelectGroup>
          <SelectLabel>Other celebrations</SelectLabel>
          {GENERAL_EVENT_TYPES.map((e) => (
            <SelectItem key={e.id} value={e.id}>
              {e.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
```

The `hover-pink-border` className may not exist yet (T9 adds it). Add the class anyway — it'll resolve once T9 ships. If you want to avoid the lint warning, add `className=""` for now and T10 will sweep this file.

If the codebase uses a different Select component import (e.g. `Combobox` from a different library), match that. Confirm by running:

```bash
grep -rn "from '@/components/ui/select'\|<Select " src/components/onboarding/ 2>/dev/null | head -5
```

For multi-select cases (e.g. vendor wizard "which events can you serve?"), build a parallel helper:

```tsx
// EventTypeMultiSelect.tsx — same grouping pattern, but with checkbox-based selection
```

Use whatever multi-select primitive the wizard already uses (the Bucket A audit suggested checkbox lists).

- [ ] **Step 2: Migrate each picker surface**

For each file in the T1 audit's event-picker section:

1. Drop the local `EVENT_TYPES` array literal (or `EVENT_TYPES_LEGACY` import)
2. Import `EventTypePicker` (or `EventTypeMultiSelect`) from `@/components/ui/`
3. Replace the existing `<Select>` JSX with `<EventTypePicker value={...} onValueChange={...} />`
4. Preserve the existing form-state binding (whatever `value` / `onChange` was wired to)

If a surface uses bespoke styling (e.g. an inline `<select className="my-custom-...">` in `BookingForm.tsx`), wrap the picker in a layout `<div>` to preserve spacing rather than restyling the picker.

- [ ] **Step 3: Verify all surfaces show the full list**

Manual smoke (or write a quick visual test):

```bash
npm run dev
```

Visit:

- `/dashboard/profile/setup/details` — wizard's event-types multi-select
- `/vendors` — search filter event-type picker (if any)
- Any `/dashboard/bookings/[id]` route that surfaces event-type
- Any custom-request form

Each should show all 20 entries with the "Other celebrations" divider before #13.

- [ ] **Step 4: Run typecheck**

```bash
npm run typecheck
```

Expected: 0 errors.

- [ ] **Step 5: Run unit tests**

```bash
npx vitest run
```

Expected: 0 failures (existing tests that asserted on the 6-entry list need updating — fix or delete per case).

- [ ] **Step 6: Delete `EVENT_TYPES_LEGACY` if zero remaining consumers**

```bash
grep -rn "EVENT_TYPES_LEGACY" src/ 2>/dev/null
```

If zero hits, remove the deprecated export from `src/types/index.ts`. Otherwise leave it and surface the remaining consumers in the report.

- [ ] **Step 7: Commit**

```bash
git add src/components/ui/EventTypePicker.tsx src/components/onboarding/ src/components/booking/ src/components/marketplace/ src/types/index.ts
git commit -m "feat(events): wire all pickers to canonical EVENT_TYPES with cultural+general grouping (Bucket B T3)"
```

---

### Task 4: `SPOKEN_LANGUAGES` constant + Spanish addition

**Files:**

- Modify: `src/types/index.ts` (add constant)
- Modify: files from T1 step 2's audit that hard-code language lists
- Test: `src/__tests__/types/spoken-languages.test.ts`

**Interfaces:**

- Consumes: T1 step 2's audit list.
- Produces:

  ```ts
  export const SPOKEN_LANGUAGES: readonly string[];
  export type SpokenLanguage = (typeof SPOKEN_LANGUAGES)[number];
  ```

- [ ] **Step 1: Confirm the existing language list from a primary consumer**

Read whichever file the audit identified as the canonical / most-detailed list. Likely `src/components/onboarding/StepDetails.tsx`:

```bash
grep -n "language\|English\|Hindi\|Urdu" src/components/onboarding/StepDetails.tsx 2>/dev/null
```

Record the exact existing list.

- [ ] **Step 2: Write the failing test**

```ts
// src/__tests__/types/spoken-languages.test.ts
import { describe, it, expect } from 'vitest';
import { SPOKEN_LANGUAGES } from '@/types';

describe('SPOKEN_LANGUAGES', () => {
  it('includes Spanish', () => {
    expect(SPOKEN_LANGUAGES).toContain('Spanish');
  });

  it('includes the previously locked languages', () => {
    // Existing entries (adjust based on audit findings — at minimum these)
    expect(SPOKEN_LANGUAGES).toContain('English');
    expect(SPOKEN_LANGUAGES).toContain('Hindi');
    expect(SPOKEN_LANGUAGES).toContain('Urdu');
    expect(SPOKEN_LANGUAGES).toContain('Arabic');
  });

  it('has no duplicates', () => {
    const set = new Set(SPOKEN_LANGUAGES);
    expect(set.size).toBe(SPOKEN_LANGUAGES.length);
  });
});
```

Adjust the asserted existing entries to match what T2 step 1 found.

- [ ] **Step 3: Run, expect FAIL (constant not exported)**

```bash
npx vitest run src/__tests__/types/spoken-languages.test.ts
```

- [ ] **Step 4: Add the constant to `src/types/index.ts`**

Use the exact existing list found in T2 step 1, inserting `Spanish` alphabetically:

```ts
export const SPOKEN_LANGUAGES = [
  'Arabic',
  'English',
  'Gujarati',
  'Hindi',
  'Punjabi',
  'Spanish', // ← new
  'Urdu',
  // any other existing entries
] as const;

export type SpokenLanguage = (typeof SPOKEN_LANGUAGES)[number];
```

Adjust ordering to match your codebase's existing pattern. If existing list is alphabetical, keep alphabetical (Spanish lands between Punjabi and Urdu). If it's source-grouped (English first, then cultural), keep that pattern with Spanish at the appropriate spot.

- [ ] **Step 5: Run, expect PASS**

```bash
npx vitest run src/__tests__/types/spoken-languages.test.ts
```

Expected: 3/3 passing.

- [ ] **Step 6: Migrate each consumer**

For every file in T1 step 2's audit:

1. Drop the local `['English', 'Hindi', ...]` literal
2. Import `SPOKEN_LANGUAGES` from `@/types`
3. Replace the literal with the constant — the rendering should already iterate over an array

```tsx
// BEFORE
const LANGUAGES = ['English', 'Hindi', 'Urdu', 'Arabic'];
// ...
{LANGUAGES.map(lang => <Checkbox key={lang} label={lang} ... />)}

// AFTER
import { SPOKEN_LANGUAGES } from '@/types';
// ...
{SPOKEN_LANGUAGES.map(lang => <Checkbox key={lang} label={lang} ... />)}
```

- [ ] **Step 7: Verify no local language literals remain**

```bash
grep -rn "\\['English'\\|'Hindi'\\|'Urdu'\\|'Punjabi'\\|'Gujarati'\\|'Arabic'\\]" src/ 2>/dev/null
```

Expected: zero remaining hits (or only matches inside the `SPOKEN_LANGUAGES` constant in `types/index.ts`).

- [ ] **Step 8: Typecheck + tests**

```bash
npm run typecheck && npx vitest run
```

- [ ] **Step 9: Commit**

```bash
git add src/types/index.ts src/components/onboarding/ src/__tests__/types/spoken-languages.test.ts
git commit -m "feat(languages): consolidate to SPOKEN_LANGUAGES constant + add Spanish (Bucket B T4)"
```

---

### Task 5: Copy rename — `couple` → `customer` sweep

**Files:**

- Modify: every file in T1 step 3's audit
- Likely include: `src/components/booking/*.tsx`, `src/components/dashboard/*.tsx`, `src/lib/email/resend.ts`, possibly `src/app/(marketplace)/**` pages

**Interfaces:**

- Consumes: T1 step 3's audit list.
- Produces: zero user-visible "couple" strings remaining (excluding the deliberate Bucket-F-locked verbatim cancellation copy which already uses "Customer cancellation").

- [ ] **Step 1: Build the substitution table**

| From          | To              |
| ------------- | --------------- |
| `couple`      | `customer`      |
| `Couple`      | `Customer`      |
| `couples`     | `customers`     |
| `Couples`     | `Customers`     |
| `couple's`    | `customer's`    |
| `Couple's`    | `Customer's`    |
| `the couple`  | `the customer`  |
| `The couple`  | `The customer`  |
| `the couples` | `the customers` |

`couple_user_id`, `coupleId`, `roleCouple`, etc. — KEEP. Discriminator strings (`role: 'couple'`) — KEEP.

- [ ] **Step 2: For each audit file, hand-edit each occurrence**

Use the Edit tool per file. Do NOT use `sed -i` — too risky for selective edits.

For each occurrence:

- Is it inside JSX text content? → replace
- Is it inside a string passed to `.toast()`, `.alert()`, or an email template? → replace
- Is it inside a TypeScript type or string-literal discriminator? → KEEP
- Is it a code comment? → KEEP (developer-facing)

Hint files (from prior audits):

- `src/components/booking/BookingDetail.tsx` — likely "the couple is..."
- `src/components/booking/BookingCard.tsx` — likely "Couple:" label
- `src/components/dashboard/Operations*.tsx` — likely "couple's name" label
- `src/lib/email/resend.ts` — likely "the couple," "couple has..." in template bodies
- `src/app/(marketplace)/*.tsx` — homepage copy may say "for the couple"

- [ ] **Step 3: Verify zero user-visible `couple` strings remain**

```bash
grep -rn "[Cc]ouple" src/ 2>/dev/null | grep -v "couple_user_id\|coupleId\|coupleProfile\|coupleUserId\|'couple'\|\"couple\"\|cancellerRole.*couple\|roleCouple\|coupleCancellation" | head -30
```

Hand-review every remaining match. Each should be either:

- A discriminator string (`role: 'couple' | 'vendor'`) → KEEP
- A TypeScript type / variable name → KEEP
- A code comment → KEEP
- A `Customer cancellation` header from Bucket F → KEEP (locked verbatim)

If you find a user-visible string you missed, edit it.

- [ ] **Step 4: Smoke email templates**

```bash
grep -n "couple" src/lib/email/resend.ts 2>/dev/null
```

Expected: zero matches. Email bodies should now say "customer."

- [ ] **Step 5: Typecheck + tests**

```bash
npm run typecheck && npx vitest run
```

Expected: 0 typecheck errors. Some tests may fail if they assert on the old copy — update those tests.

- [ ] **Step 6: Commit**

```bash
git add src/
git commit -m "feat(copy): rename user-visible couple → customer across UI + emails (Bucket B T5)"
```

---

### Task 6: Guest count — `BookingForm` derives shape from package

**Files:**

- Modify: `src/components/booking/BookingForm.tsx`
- Modify: `src/components/booking/EventRow.tsx` (drop optional-override affordance)
- Test: `src/__tests__/components/booking-form-guest-count.test.tsx`

**Interfaces:**

- Consumes: existing `Package` type with `events: PackageEvent[]` (or however packages encode their event list).
- Produces: `BookingForm` renders one guest-count input for single-event packages, N inputs for multi-event packages. Submit payload uses `guest_counts_by_event: { [event_id]: number }`.

- [ ] **Step 1: Read the current `BookingForm.tsx`**

```bash
grep -n "guestCount\|guests" src/components/booking/BookingForm.tsx | head -20
```

Identify the existing state shape (likely a single `guestCount` number) and the submit handler.

- [ ] **Step 2: Read the `Package` type and how its events are encoded**

```bash
grep -n "package.*events\|events.*Package\|packageEvents" src/types/database.types.ts src/types/index.ts 2>/dev/null | head -10
```

Likely: `packages` row has multiple `package_events` (or a join table). Confirm.

- [ ] **Step 3: Write the failing test**

```tsx
// src/__tests__/components/booking-form-guest-count.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BookingForm } from '@/components/booking/BookingForm';

const SINGLE_EVENT_PACKAGE = {
  id: 'pkg-1',
  base_price_cents: 100_000,
  events: [{ id: 'evt-1', event_type: 'wedding', name: 'Wedding' }],
};

const MULTI_EVENT_PACKAGE = {
  id: 'pkg-2',
  base_price_cents: 200_000,
  events: [
    { id: 'evt-a', event_type: 'sangeet', name: 'Sangeet' },
    { id: 'evt-b', event_type: 'reception', name: 'Reception' },
  ],
};

describe('BookingForm guest count', () => {
  it('renders one input for single-event package', () => {
    render(<BookingForm package={SINGLE_EVENT_PACKAGE} vendorId="v-1" />);
    expect(screen.getAllByLabelText(/how many guests/i)).toHaveLength(1);
  });

  it('renders one input per event for multi-event package', () => {
    render(<BookingForm package={MULTI_EVENT_PACKAGE} vendorId="v-1" />);
    expect(screen.getByLabelText(/guests at Sangeet/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/guests at Reception/i)).toBeInTheDocument();
  });
});
```

Adjust the package shape to match what the codebase actually uses.

- [ ] **Step 4: Run, expect FAIL**

```bash
npx vitest run src/__tests__/components/booking-form-guest-count.test.tsx
```

- [ ] **Step 5: Update `BookingForm.tsx`**

Replace the single `guestCount` state with a record:

```tsx
const [guestCounts, setGuestCounts] = useState<Record<string, number>>(() =>
  Object.fromEntries(pkg.events.map((e) => [e.id, 50]))
);
```

Replace the existing guest-count input with conditional rendering:

```tsx
const isSingleEvent = pkg.events.length === 1;

return (
  // ...
  <section>
    {isSingleEvent ? (
      <Field label="How many guests?">
        <Input
          type="number"
          min={1}
          value={guestCounts[pkg.events[0].id]}
          onChange={(e) =>
            setGuestCounts({ ...guestCounts, [pkg.events[0].id]: Number(e.target.value) })
          }
        />
      </Field>
    ) : (
      pkg.events.map((event) => (
        <Field key={event.id} label={`Guests at ${event.name}?`}>
          <Input
            type="number"
            min={1}
            value={guestCounts[event.id]}
            onChange={(e) => setGuestCounts({ ...guestCounts, [event.id]: Number(e.target.value) })}
          />
        </Field>
      ))
    )}
  </section>
);
```

Update the submit handler to send `guest_counts_by_event` in the payload:

```tsx
const handleSubmit = async () => {
  await createBooking({
    package_id: pkg.id,
    vendor_id: vendorId,
    guest_counts_by_event: guestCounts,
    // ... other fields
  });
};
```

The API endpoint (`POST /api/bookings`) needs to accept this new payload shape — record this in your report for T7 (custom-request form, which submits to the same or sibling endpoint) and for T17's PR notes (the API needs an update).

- [ ] **Step 6: Update the create-booking server action / API to accept the new shape**

Find the endpoint:

```bash
grep -rn "guest_count\|createBooking" src/app/api/bookings/ src/services/booking.service.ts 2>/dev/null | head -10
```

Modify to:

- Accept `guest_counts_by_event` in the request body
- For each event_id, create a `booking_events` row with the per-event `guest_count`

If the API currently accepts a single `guestCount` field and writes the same value to every booking_event, update it to use the per-event map.

- [ ] **Step 7: Drop the optional-override affordance from `EventRow.tsx`**

```bash
grep -n "override\|optional" src/components/booking/EventRow.tsx 2>/dev/null
```

The Bucket B spec §2.4 says: "EventRow.tsx: drops the 'optional override' affordance — the per-event guest count is now first-class for multi-event packages, not an override."

If `EventRow` currently has a "Override guests for this event" checkbox / button, remove it. The guest count is always per-event (controlled by the parent `BookingForm` now).

- [ ] **Step 8: Run, expect PASS**

```bash
npx vitest run src/__tests__/components/booking-form-guest-count.test.tsx
```

Expected: 2/2 passing.

- [ ] **Step 9: Run full unit suite**

```bash
npx vitest run
```

Expected: 0 regressions.

- [ ] **Step 10: Commit**

```bash
git add src/components/booking/ src/__tests__/components/ src/app/api/bookings/ src/services/booking.service.ts
git commit -m "feat(booking): BookingForm guest count derived from package event count (Bucket B T6)"
```

---

### Task 7: Guest count — `CustomRequestForm` dynamic events

**Files:**

- Modify: `src/components/booking/CustomRequestForm.tsx`

**Interfaces:**

- Consumes: `EVENT_TYPES` from T2, `EventTypePicker` from T3.
- Produces: `CustomRequestForm` renders a dynamic list of event rows (date + time + guest count + event-type picker). "+ Add another event" button adds a row; trash icon removes a row.

- [ ] **Step 1: Read the current `CustomRequestForm.tsx`**

```bash
grep -n "guestCount\|events\|eventType\|date" src/components/booking/CustomRequestForm.tsx | head -20
```

- [ ] **Step 2: Refactor state to support an array of events**

```tsx
type CustomEvent = {
  id: string; // local id (UUID v4 or counter)
  date: string;
  startTime: string;
  endTime?: string;
  guestCount: number;
  eventTypeId: EventTypeId;
};

const [events, setEvents] = useState<CustomEvent[]>([
  { id: crypto.randomUUID(), date: '', startTime: '', guestCount: 50, eventTypeId: 'wedding' },
]);
```

- [ ] **Step 3: Render the dynamic events list**

```tsx
return (
  <form>
    {/* description textarea, other meta fields ... */}

    <section>
      <label className="text-sm font-medium text-ink">Events</label>
      {events.map((event, idx) => (
        <div key={event.id} className="mb-3 rounded-md border border-ink/15 p-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date">
              <Input
                type="date"
                value={event.date}
                onChange={(e) => updateEvent(event.id, { date: e.target.value })}
              />
            </Field>
            <Field label="Time">
              <Input
                type="time"
                value={event.startTime}
                onChange={(e) => updateEvent(event.id, { startTime: e.target.value })}
              />
            </Field>
            <Field label="Guests">
              <Input
                type="number"
                min={1}
                value={event.guestCount}
                onChange={(e) => updateEvent(event.id, { guestCount: Number(e.target.value) })}
              />
            </Field>
            <Field label="Event type">
              <EventTypePicker
                value={event.eventTypeId}
                onValueChange={(v) => updateEvent(event.id, { eventTypeId: v })}
              />
            </Field>
          </div>
          {events.length > 1 && (
            <button
              type="button"
              onClick={() => removeEvent(event.id)}
              className="mt-2 text-xs text-hot-pink hover:underline"
            >
              Remove this event
            </button>
          )}
        </div>
      ))}

      <button
        type="button"
        onClick={addEvent}
        className="hover-pink-text text-sm font-medium text-ink"
      >
        + Add another event
      </button>
    </section>

    {/* submit button ... */}
  </form>
);

function updateEvent(id: string, patch: Partial<CustomEvent>) {
  setEvents(events.map((e) => (e.id === id ? { ...e, ...patch } : e)));
}

function addEvent() {
  setEvents([
    ...events,
    { id: crypto.randomUUID(), date: '', startTime: '', guestCount: 50, eventTypeId: 'wedding' },
  ]);
}

function removeEvent(id: string) {
  setEvents(events.filter((e) => e.id !== id));
}
```

- [ ] **Step 4: Update the submit payload**

Send `events: [{ date, startTime, guestCount, eventTypeId }, ...]` to whatever endpoint the form posts to. The endpoint creates one `booking_events` row per event in the array.

If the endpoint already exists and only accepts a single event, update it to accept the array shape. Track in the report for T17.

- [ ] **Step 5: Verify no compile errors**

```bash
npm run typecheck
```

Expected: 0 errors.

- [ ] **Step 6: Manual smoke (optional but recommended)**

```bash
npm run dev
```

Visit a custom-request page. Confirm:

- Default state shows one event row
- "+ Add another event" adds another row
- "Remove this event" link removes it
- Can't remove the last remaining row

- [ ] **Step 7: Commit**

```bash
git add src/components/booking/CustomRequestForm.tsx src/app/api/
git commit -m "feat(booking): CustomRequestForm dynamic events list (Bucket B T7)"
```

---

### Task 8: Guest count — display in booking views

**Files:**

- Modify: `src/components/booking/BookingDetail.tsx`
- Modify: `src/components/booking/BookingCard.tsx`
- Modify: `src/components/dashboard/Operations*.tsx` (vendor-side booking display)

**Interfaces:**

- Consumes: `booking.events[]` with per-event `guest_count`.
- Produces: single-number display when single-event booking, breakdown display when multi-event.

- [ ] **Step 1: Read the current displays**

```bash
grep -n "guestCount\|guest_count\|guests" src/components/booking/BookingDetail.tsx src/components/booking/BookingCard.tsx 2>/dev/null | head -10
```

- [ ] **Step 2: Update `BookingCard.tsx` (single line display)**

```tsx
function GuestCountBadge({
  events,
}: {
  events: { event_type: string; guest_count: number; name?: string }[];
}) {
  if (events.length === 1) {
    return <span className="text-xs text-ink/70">{events[0].guest_count} guests</span>;
  }
  const total = events.reduce((sum, e) => sum + e.guest_count, 0);
  return (
    <span className="text-xs text-ink/70">
      {total} guests across {events.length} events
    </span>
  );
}
```

Use this in `BookingCard` wherever the guest count badge appears.

- [ ] **Step 3: Update `BookingDetail.tsx` (full breakdown)**

```tsx
function GuestCountSection({
  events,
}: {
  events: { name: string; event_type: string; guest_count: number }[];
}) {
  if (events.length === 1) {
    return (
      <div>
        <div className="text-xs uppercase text-ink/50">Guests</div>
        <div className="text-base text-ink">{events[0].guest_count}</div>
      </div>
    );
  }
  return (
    <div>
      <div className="text-xs uppercase text-ink/50">Guests by event</div>
      <ul className="mt-2 space-y-1">
        {events.map((e, i) => (
          <li key={i} className="text-sm text-ink">
            <span className="font-medium">{e.name ?? e.event_type}</span>
            <span className="text-ink/60"> · {e.guest_count} guests</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 4: Update vendor Operations view**

Find the Operations component:

```bash
grep -rn "Operations\|OperationsCard\|OperationsList" src/components/dashboard/ 2>/dev/null | head -5
```

Apply the same breakdown rendering wherever guest count surfaces.

- [ ] **Step 5: Run typecheck + tests**

```bash
npm run typecheck && npx vitest run
```

- [ ] **Step 6: Commit**

```bash
git add src/components/booking/ src/components/dashboard/
git commit -m "feat(booking): per-event guest count display in booking views (Bucket B T8)"
```

---

### Task 9: Tailwind hover utilities + `shadow-pink` token

**Files:**

- Modify: `tailwind.config.ts`

**Interfaces:**

- Consumes: existing brand tokens (`ink`, `cream`, `hot-pink`).
- Produces:
  - Utilities: `hover-pink-text`, `hover-pink-border`, `hover-pink-fill`, `hover-lift`, `hover-lift-card`
  - New shadow: `shadow-pink: 0 4px 10px rgba(209, 0, 108, 0.25)`
  - New shadow: `shadow-pink-card: 0 8px 20px rgba(209, 0, 108, 0.15)`

- [ ] **Step 1: Read the current `tailwind.config.ts`**

```bash
cat tailwind.config.ts | head -80
```

Identify the `theme.extend` block and the existing color tokens.

- [ ] **Step 2: Add the shadow tokens**

In `theme.extend.boxShadow`:

```ts
boxShadow: {
  // ... existing shadows
  'pink': '0 4px 10px rgba(209, 0, 108, 0.25)',
  'pink-card': '0 8px 20px rgba(209, 0, 108, 0.15)',
},
```

- [ ] **Step 3: Add the utility shortcuts via plugin**

```ts
import plugin from 'tailwindcss/plugin';

// ...
plugins: [
  // ... existing plugins
  plugin(function ({ addUtilities }) {
    addUtilities({
      '.hover-pink-text': {
        'transition': 'color 180ms ease-out',
        '&:hover': {
          'color': '#D1006C',
        },
      },
      '.hover-pink-border': {
        'transition': 'border-color 180ms ease-out, color 180ms ease-out',
        '&:hover': {
          'border-color': '#D1006C',
          'color': '#D1006C',
        },
      },
      '.hover-pink-fill': {
        'transition': 'background-color 180ms ease-out',
        '&:hover': {
          'background-color': '#D1006C',
        },
      },
      '.hover-lift': {
        'transition': 'transform 180ms ease-out, box-shadow 180ms ease-out',
        '&:hover': {
          'transform': 'translateY(-1px)',
          'box-shadow': '0 4px 10px rgba(209, 0, 108, 0.25)',
        },
        '@media (prefers-reduced-motion: reduce)': {
          '&:hover': {
            'transform': 'none',
          },
        },
      },
      '.hover-lift-card': {
        'transition': 'transform 180ms ease-out, box-shadow 180ms ease-out, border-color 180ms ease-out',
        '&:hover': {
          'transform': 'translateY(-2px)',
          'box-shadow': '0 8px 20px rgba(209, 0, 108, 0.15)',
          'border-color': '#D1006C',
        },
        '@media (prefers-reduced-motion: reduce)': {
          '&:hover': {
            'transform': 'none',
          },
        },
      },
    });
  }),
],
```

If the existing config doesn't import `plugin` from `tailwindcss/plugin`, add the import.

- [ ] **Step 4: Verify Tailwind builds**

```bash
npm run dev
```

Visit any page. No build errors. Open DevTools and confirm `.hover-pink-text` resolves to the expected CSS.

(Skip if no dev server.)

- [ ] **Step 5: Run typecheck**

```bash
npm run typecheck
```

Expected: 0 errors (`tailwind.config.ts` is type-checked under most TS configs).

- [ ] **Step 6: Commit**

```bash
git add tailwind.config.ts
git commit -m "feat(design): add hover-pink utilities + shadow-pink tokens to Tailwind (Bucket B T9)"
```

---

### Task 10: Hover sweep on `shadcn` primitives

**Files:**

- Modify: `src/components/ui/button.tsx` (or `Button.tsx`)
- Modify: `src/components/ui/card.tsx`
- Modify: `src/components/ui/input.tsx`
- Modify: `src/components/ui/select.tsx`
- Modify: `src/components/ui/badge.tsx`

**Interfaces:**

- Consumes: utilities from T9.
- Produces: every shadcn primitive renders with the hot-pink hover treatment by default. No new variants — modify existing ones.

- [ ] **Step 1: Update `Button.tsx` — primary variant**

Find the primary button variant. Example:

```tsx
// BEFORE
const buttonVariants = cva('inline-flex ...', {
  variants: {
    variant: {
      default: 'bg-ink text-cream hover:bg-ink/90',
      outline: 'border border-ink text-ink hover:bg-ink/5',
      // ...
    },
  },
});

// AFTER
const buttonVariants = cva('inline-flex ... transition-all duration-[180ms] ease-out', {
  variants: {
    variant: {
      default:
        'bg-ink text-cream hover:bg-hot-pink hover:-translate-y-px hover:shadow-pink motion-reduce:hover:translate-y-0',
      outline:
        'border border-ink text-ink hover:border-hot-pink hover:text-hot-pink hover:bg-hot-pink/[0.04]',
      // ...
    },
  },
});
```

If the file uses class-variance-authority (`cva`), apply hover changes inline. Don't switch to the `hover-pink-*` utilities here — Button is the highest-volume primitive and inline class clarity beats the helper.

- [ ] **Step 2: Update `Card.tsx`**

```tsx
// Add the lift+pink treatment ONLY when the card is interactive (has onClick or wrapped in a Link).
// Default Card stays static. Add a new "interactive" variant or apply via className from consumers.
```

Decision: Card stays static by default. Consumers add `hover-lift-card` when they want the treatment (e.g. VendorCard in T11 will).

If you want all cards to be interactive (changes UX globally), apply `hover-lift-card` directly to the Card root. Recommend: don't — most cards aren't clickable.

- [ ] **Step 3: Update `Input.tsx` and `Select.tsx`**

For inputs: hover state should NOT add color (inputs use focus state for that). Skip — don't add hover-pink to text inputs.

For Select trigger: add hover-pink-border so the picker shows the affordance.

- [ ] **Step 4: Update other small primitives**

- `Badge.tsx`: skip (badges are static)
- `Avatar.tsx`: skip
- `Checkbox.tsx`: hover state already exists — leave unless audit shows it's missing

The point is: apply only where it adds UX value. Don't sweep every primitive blindly.

- [ ] **Step 5: Run typecheck + visual smoke**

```bash
npm run typecheck
```

```bash
npm run dev
```

Visit the homepage. Hover primary buttons → see pink + lift. Hover outline buttons → see pink border/text. Hover Select dropdowns → see pink border.

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/
git commit -m "feat(design): apply hover-pink hover treatment to shadcn primitives (Bucket B T10)"
```

---

### Task 11: Hover sweep on bespoke marketplace components

**Files:**

- Modify: `src/components/marketplace/VendorCard.tsx`
- Modify: `src/components/marketplace/FilterChip.tsx` (if exists)
- Modify: `src/components/nav/NavItem.tsx` (if exists)
- Modify: any other bespoke interactive component identified by T1 audit

**Interfaces:**

- Consumes: utilities from T9.

- [ ] **Step 1: Find bespoke interactive components**

```bash
grep -rln "onClick\|<Link\|cursor-pointer" src/components/marketplace/ src/components/nav/ 2>/dev/null | head -10
```

Build a list. Each component should get the hover treatment if it's interactive.

- [ ] **Step 2: Apply to `VendorCard.tsx`**

Add `hover-lift-card` to the outermost interactive div:

```tsx
<Link
  href={`/vendors/${vendor.slug}`}
  className="hover-lift-card border-ink/12 block overflow-hidden rounded-lg border"
>
  {/* card contents */}
</Link>
```

- [ ] **Step 3: Apply to `FilterChip.tsx`**

```tsx
<button className="hover-pink-border inline-flex items-center rounded-full border border-ink/20 bg-cream px-3 py-1 text-ink">
  {label}
</button>
```

- [ ] **Step 4: Apply to `NavItem.tsx`**

```tsx
<Link href={href} className="hover-pink-text relative inline-block py-2 text-ink">
  {label}
  {/* Underline animation */}
  <span className="duration-[180ms] absolute bottom-0 left-0 right-0 h-0.5 origin-center scale-x-0 bg-hot-pink transition-transform group-hover:scale-x-100" />
</Link>
```

If existing NavItem doesn't have a wrapping group, add `className="group"` to the parent.

- [ ] **Step 5: Smoke**

```bash
npm run dev
```

Visit `/vendors`. Hover a vendor card → see lift + pink shadow. Hover a filter chip → see pink border + text. Hover nav item → see pink underline animate in.

- [ ] **Step 6: Commit**

```bash
git add src/components/marketplace/ src/components/nav/
git commit -m "feat(design): apply hover-pink hover treatment to marketplace components (Bucket B T11)"
```

---

### Task 12: Document Hover System in `DESIGN.md`

**Files:**

- Modify: `docs/DESIGN.md`

**Interfaces:** none beyond documentation.

- [ ] **Step 1: Read the current `DESIGN.md`**

```bash
ls docs/DESIGN.md 2>/dev/null && cat docs/DESIGN.md | head -20
```

Identify the section structure (likely sections for Palette, Typography, Spacing). The Hover System slots after these as a behavioral system.

- [ ] **Step 2: Add the Hover System section**

Append (or insert after Typography):

```markdown
## Hover System

Every interactive element transitions to a hot-pink treatment on hover. Transition: 180ms ease-out. Pink color: `#D1006C` (hot-pink token).

### Element mapping

| Element                   | Idle                     | Hover treatment                                                      |
| ------------------------- | ------------------------ | -------------------------------------------------------------------- |
| Primary button (ink fill) | `bg-ink text-cream`      | `hover:bg-hot-pink hover:-translate-y-px hover:shadow-pink`          |
| Outline button            | `border-ink text-ink`    | `hover:border-hot-pink hover:text-hot-pink hover:bg-hot-pink/[0.04]` |
| Text link                 | `text-ink`               | `hover-pink-text` + underline                                        |
| Vendor card (interactive) | `border-ink/12`          | `hover-lift-card`                                                    |
| Filter chip               | `border-ink/20 bg-cream` | `hover-pink-border`                                                  |
| Nav item                  | `text-ink`               | `hover-pink-text` + underline animation                              |
| Icon button (circular)    | `border-ink/20 text-ink` | `hover-pink-border`                                                  |

### Utility classes

Defined in `tailwind.config.ts`:

- `hover-pink-text` — color shifts to hot-pink in 180ms
- `hover-pink-border` — border + text shift to hot-pink in 180ms
- `hover-pink-fill` — background shifts to hot-pink in 180ms
- `hover-lift` — translateY(-1px) + shadow-pink; respects prefers-reduced-motion
- `hover-lift-card` — translateY(-2px) + shadow-pink-card + border-hot-pink; respects prefers-reduced-motion

### Rules

- Inputs and badges stay static — they use focus or count states, not hover
- Static cards (non-clickable) stay static
- Touch devices: Tailwind gates `:hover` behind `@media (hover: hover)` so touch users see resting states
- prefers-reduced-motion: transforms disabled; color transitions remain
```

- [ ] **Step 3: Commit**

```bash
git add docs/DESIGN.md
git commit -m "docs(design): document hover system + utility classes (Bucket B T12)"
```

---

### Task 13: Vendor own-profile detection + `OwnerBanner`

**Files:**

- Create: `src/components/marketplace/OwnerBanner.tsx`
- Modify: `src/app/(marketplace)/vendors/[slug]/page.tsx`
- Modify: whichever client component renders the profile body (likely `src/components/marketplace/VendorProfile.tsx` or inline in the page)

**Interfaces:**

- Consumes: existing vendor profile fetch.
- Produces:

  ```tsx
  <OwnerBanner onPreview={() => void} editHref="/dashboard/profile/setup/basics" />
  ```

  Renders only when `viewer.id === vendor.user_id`.

- [ ] **Step 1: Detect owner in the page component**

```tsx
// src/app/(marketplace)/vendors/[slug]/page.tsx
import { createServerComponentClient } from '@/lib/supabase/server';

export default async function VendorProfilePage({ params }: { params: { slug: string } }) {
  const supabase = createServerComponentClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const vendor = await fetchVendorBySlug(params.slug); // existing helper
  const isOwner = !!user && user.id === vendor.user_id;

  return <VendorProfile vendor={vendor} isOwner={isOwner} />;
}
```

If the page already passes data to a client component, just add `isOwner` to the prop.

- [ ] **Step 2: Create `OwnerBanner.tsx`**

```tsx
'use client';

import Link from 'next/link';

interface OwnerBannerProps {
  onPreview: () => void;
  editHref: string;
}

export function OwnerBanner({ onPreview, editHref }: OwnerBannerProps) {
  return (
    <div className="sticky top-0 z-30 flex items-center justify-between border-b border-ink/15 bg-cream px-6 py-3">
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-hot-pink" aria-hidden />
        <p className="text-sm text-ink">This is how customers see your profile.</p>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onPreview}
          className="hover-pink-border rounded-md border border-ink px-3 py-1.5 text-sm font-medium text-ink"
        >
          View as customer
        </button>
        <Link
          href={editHref}
          className="duration-[180ms] hover:shadow-pink rounded-md bg-ink px-3 py-1.5 text-sm font-medium text-cream transition-all ease-out hover:-translate-y-px hover:bg-hot-pink motion-reduce:hover:translate-y-0"
        >
          Edit profile
        </Link>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Render the banner in the client profile component**

If `VendorProfile.tsx` doesn't exist as a client component, extract it:

```tsx
// src/components/marketplace/VendorProfile.tsx
'use client';

import { useState } from 'react';
import { OwnerBanner } from './OwnerBanner';
// ... other imports

interface VendorProfileProps {
  vendor: VendorRow;
  isOwner: boolean;
}

export function VendorProfile({ vendor, isOwner }: VendorProfileProps) {
  const [previewMode, setPreviewMode] = useState(false);
  const showBanner = isOwner && !previewMode;

  return (
    <>
      {showBanner && (
        <OwnerBanner
          onPreview={() => setPreviewMode(true)}
          editHref="/dashboard/profile/setup/basics"
        />
      )}
      <ProfileBody vendor={vendor} interactive={!isOwner || previewMode} />
      {/* ExitPreviewPill added in T14 */}
    </>
  );
}
```

`interactive` prop is consumed in T14; for now, just thread it through. Default the Book button's `disabled={!interactive}` if you can find the JSX easily.

- [ ] **Step 4: Run typecheck**

```bash
npm run typecheck
```

Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/marketplace/OwnerBanner.tsx src/components/marketplace/VendorProfile.tsx src/app/\(marketplace\)/vendors/
git commit -m "feat(profile): OwnerBanner + isOwner detection on /vendors/[slug] (Bucket B T13)"
```

---

### Task 14: View-as-customer toggle + `ExitPreviewPill` + inert mode

**Files:**

- Create: `src/components/marketplace/ExitPreviewPill.tsx`
- Modify: `src/components/marketplace/VendorProfile.tsx`
- Modify: wherever the Book button or contact form lives within the profile body

**Interfaces:**

- Consumes: `previewMode` state from VendorProfile (T13).
- Produces:
  - `ExitPreviewPill` renders fixed bottom-right when `previewMode` is true; clicking it sets `previewMode` back to false
  - Book button + contact form disabled when `interactive === false`
  - Click on disabled book button shows a toast "Preview mode — bookings disabled."

- [ ] **Step 1: Create `ExitPreviewPill.tsx`**

```tsx
'use client';

interface ExitPreviewPillProps {
  onExit: () => void;
}

export function ExitPreviewPill({ onExit }: ExitPreviewPillProps) {
  return (
    <button
      type="button"
      onClick={onExit}
      className="duration-[180ms] fixed bottom-6 right-6 z-40 rounded-full bg-hot-pink px-4 py-2 text-sm font-medium text-cream shadow-lg transition-all ease-out hover:bg-hot-pink/90 hover:shadow-xl"
    >
      ← Exit preview
    </button>
  );
}
```

- [ ] **Step 2: Render the pill in `VendorProfile.tsx`**

```tsx
{
  isOwner && previewMode && <ExitPreviewPill onExit={() => setPreviewMode(false)} />;
}
```

- [ ] **Step 3: Apply inert mode**

Find the Book button + any contact-form trigger in the profile body. The component is likely `ProfileBody` or inline in `VendorProfile`.

When `interactive === false`:

```tsx
import { toast } from 'sonner'; // or whatever toast lib the project uses

const handleBookClick = () => {
  if (!interactive) {
    toast('Preview mode — bookings disabled.');
    return;
  }
  // existing book flow
};
```

Apply the same pattern to any other CTA in the profile (request quote, message vendor, etc.).

If the project doesn't have a toast lib, find what existing user-action confirmations use. The Bucket A audit identified `sonner` as the toast library.

- [ ] **Step 4: Manual smoke**

```bash
npm run dev
```

Sign in as a vendor → visit own `/vendors/[slug]`:

- See banner
- Click "View as customer" → banner disappears, pill appears bottom-right
- Click Book button → toast appears, no checkout
- Click "Exit preview" pill → banner returns

- [ ] **Step 5: Typecheck + tests**

```bash
npm run typecheck && npx vitest run
```

- [ ] **Step 6: Commit**

```bash
git add src/components/marketplace/ExitPreviewPill.tsx src/components/marketplace/VendorProfile.tsx
git commit -m "feat(profile): view-as-customer toggle + ExitPreviewPill + inert mode (Bucket B T14)"
```

---

### Task 15: Relocate `OnboardingGate` to signup-success + mark-on-show

**Files:**

- Modify: `src/app/dashboard/layout.tsx` (remove `<OnboardingGate>` JSX)
- Modify: `src/components/onboarding/OnboardingGate.tsx` (fire mark-on-show effect)
- Create OR modify: `src/app/(auth)/signup/success/page.tsx` (or wherever signup success lives)

**Interfaces:**

- Consumes: existing `<OnboardingGate role onboardingCompleted>` interface.
- Produces:
  - `OnboardingGate` fires `POST /api/users/onboarding-complete` exactly once on the open=true transition (via `useEffect` + ref guard)
  - `/dashboard` no longer intercepts users with `onboarding_completed_at = null`
  - Signup-success page renders the gate

- [ ] **Step 1: Read the current OnboardingGate**

```bash
cat src/components/onboarding/OnboardingGate.tsx
```

Confirm shape: it takes `role` + `onboardingCompleted`, renders CoupleOnboarding or VendorOnboarding.

- [ ] **Step 2: Add mark-on-show effect**

```tsx
'use client';

import * as React from 'react';
import { CoupleOnboarding } from './CoupleOnboarding';
import { VendorOnboarding } from './VendorOnboarding';

export interface OnboardingGateProps {
  role: 'couple' | 'vendor';
  onboardingCompleted: boolean;
}

export function OnboardingGate({ role, onboardingCompleted }: OnboardingGateProps) {
  const [open, setOpen] = React.useState(!onboardingCompleted);
  const markedRef = React.useRef(false);

  React.useEffect(() => {
    if (open && !markedRef.current) {
      markedRef.current = true;
      fetch('/api/users/onboarding-complete', { method: 'POST' }).catch((err) => {
        console.error('Failed to mark onboarding complete:', err);
      });
    }
  }, [open]);

  if (onboardingCompleted) return null;

  if (role === 'couple') {
    return <CoupleOnboarding open={open} onOpenChange={setOpen} />;
  }
  if (role === 'vendor') {
    return <VendorOnboarding open={open} onOpenChange={setOpen} />;
  }

  return null;
}
```

Mark-on-show fires once via the `markedRef` guard. The user can dismiss the modal immediately; their `onboarding_completed_at` is already set server-side, so they won't see it again.

- [ ] **Step 3: Remove `<OnboardingGate>` from `/dashboard` layout**

```bash
grep -n "OnboardingGate" src/app/dashboard/layout.tsx
```

Find the JSX and remove it. Also remove the import. Also remove any data fetching that was specifically for the gate (e.g. `onboardingCompleted` lookup).

- [ ] **Step 4: Render the gate on signup-success**

Find the signup-success page or route:

```bash
grep -rln "signup\|sign-up\|after-signup\|onboarding" src/app/ 2>/dev/null | head -10
```

If a dedicated success page exists (e.g. `src/app/(auth)/signup/success/page.tsx`), add the gate there:

```tsx
import { OnboardingGate } from '@/components/onboarding/OnboardingGate';
import { createServerComponentClient } from '@/lib/supabase/server';

export default async function SignupSuccessPage() {
  const supabase = createServerComponentClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('users')
    .select('role, onboarding_completed_at')
    .eq('id', user.id)
    .single();

  const onboardingCompleted = !!profile?.onboarding_completed_at;

  return (
    <>
      {/* welcome page content — heading, "Account created", etc. */}
      <OnboardingGate role={profile?.role ?? 'couple'} onboardingCompleted={onboardingCompleted} />
    </>
  );
}
```

If no dedicated success page exists, the signup flow likely redirects to `/dashboard` directly. In that case:

- Create `src/app/(auth)/signup/success/page.tsx` with the gate
- Update the signup POST handler to redirect to `/signup/success` instead of `/dashboard`

- [ ] **Step 5: Vendor claim-flow check**

Verify that claim-flow vendors don't accidentally see the modal. The flow likely sets `onboarding_completed_at` at claim-redemption time. Verify:

```bash
grep -rn "claim\|onboarding_completed_at = " src/app/api/vendor-claim/ 2>/dev/null | head -5
```

If the claim endpoint doesn't already mark `onboarding_completed_at`, add it:

```ts
await supabase
  .from('users')
  .update({ onboarding_completed_at: new Date().toISOString() })
  .eq('id', user.id);
```

This way claim-flow vendors skip the modal entirely (they go to wizard, which is their onboarding).

- [ ] **Step 6: Typecheck + tests**

```bash
npm run typecheck && npx vitest run
```

- [ ] **Step 7: Manual smoke**

```bash
npm run dev
```

- Visit `/dashboard` as an existing couple → NO modal (because backfill marks all existing users complete)
- Sign up as a new couple via `/signup` → land on `/signup/success` → see modal once → dismiss → navigate to `/dashboard` → NO modal again

(The backfill SQL hasn't run yet; existing users will still get the modal. That's the migration's job. For now just confirm the gate fires on signup-success.)

- [ ] **Step 8: Commit**

```bash
git add src/components/onboarding/OnboardingGate.tsx src/app/dashboard/layout.tsx src/app/\(auth\)/signup/ src/app/api/vendor-claim/
git commit -m "feat(onboarding): relocate OnboardingGate to signup-success + mark-on-show (Bucket B T15)"
```

---

### Task 16: E2E specs

**Files:**

- Create: `tests/e2e/bucket-b-event-types-everywhere.spec.ts`
- Create: `tests/e2e/bucket-b-vendor-own-profile.spec.ts`

**Interfaces:**

- Consumes: E2E helpers (`seedVendor`, `cleanup`, `loginAs`, `getServiceClient`).

- [ ] **Step 1: Write the event-types spec**

```ts
// tests/e2e/bucket-b-event-types-everywhere.spec.ts
import { test, expect } from '@playwright/test';
import { seedVendor, cleanup, type TestVendor } from './helpers/seed';
import { loginAs } from './helpers/login';

test.describe('Bucket B — all 20 event types in every picker', () => {
  let vendor: TestVendor | null = null;

  test.afterEach(async () => {
    await cleanup(vendor);
    vendor = null;
  });

  test('wizard StepDetails event picker shows full list with divider', async ({ browser }) => {
    vendor = await seedVendor({ chargesEnabled: false });
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await loginAs(page, vendor);

    await page.goto('/dashboard/profile/setup/details');

    // Open the event-types picker — selector depends on actual wizard UI
    const picker = page.getByRole('combobox', { name: /event types/i });
    await picker.click();

    // All cultural entries
    await expect(page.getByRole('option', { name: /Wedding \/ Shaadi/i })).toBeVisible();
    await expect(page.getByRole('option', { name: /Mehndi \/ Henna/i })).toBeVisible();
    await expect(page.getByRole('option', { name: /Walima \/ Wedding Feast/i })).toBeVisible();
    await expect(page.getByRole('option', { name: /Aqiqah \/ Baby Naming/i })).toBeVisible();
    await expect(page.getByRole('option', { name: /Roka/i })).toBeVisible();
    await expect(page.getByRole('option', { name: /Tilak/i })).toBeVisible();

    // Divider
    await expect(page.getByText(/Other celebrations/i)).toBeVisible();

    // All general entries
    await expect(page.getByRole('option', { name: /Birthday party/i })).toBeVisible();
    await expect(page.getByRole('option', { name: /Quinceañera/i })).toBeVisible();
    await expect(page.getByRole('option', { name: /Sweet 16/i })).toBeVisible();

    await ctx.close();
  });

  test('marketplace search filter shows full list', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto('/vendors');

    const filter = page.getByRole('button', { name: /event type/i }).first();
    await filter.click();

    await expect(page.getByRole('option', { name: /Wedding \/ Shaadi/i })).toBeVisible();
    await expect(page.getByRole('option', { name: /Birthday party/i })).toBeVisible();
    await expect(page.getByText(/Other celebrations/i)).toBeVisible();

    await ctx.close();
  });
});
```

Adapt selectors to the actual UI. If the event picker uses a custom component without `role="combobox"`, scope by component testid or class.

- [ ] **Step 2: Write the vendor own-profile spec**

```ts
// tests/e2e/bucket-b-vendor-own-profile.spec.ts
import { test, expect } from '@playwright/test';
import { seedVendor, cleanup, type TestVendor } from './helpers/seed';
import { loginAs } from './helpers/login';

test.describe('Bucket B — vendor own profile banner + preview', () => {
  let vendor: TestVendor | null = null;

  test.afterEach(async () => {
    await cleanup(vendor);
    vendor = null;
  });

  test('owner sees banner; view-as-customer hides banner; exit-preview returns banner', async ({
    browser,
  }) => {
    vendor = await seedVendor({ chargesEnabled: false, publish: true });
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await loginAs(page, vendor);

    await page.goto(`/vendors/${vendor.slug}`);

    // Banner visible
    await expect(page.getByText(/This is how customers see your profile/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /View as customer/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Edit profile/i })).toBeVisible();

    // Toggle to preview
    await page.getByRole('button', { name: /View as customer/i }).click();
    await expect(page.getByText(/This is how customers see your profile/i)).not.toBeVisible();

    // Exit pill appears
    await expect(page.getByRole('button', { name: /Exit preview/i })).toBeVisible();

    // Book button visible in preview mode (couple's view) but inert
    const bookBtn = page.getByRole('button', { name: /Book this vendor/i });
    await bookBtn.click();
    await expect(page.getByText(/Preview mode — bookings disabled/i)).toBeVisible();

    // Exit preview
    await page.getByRole('button', { name: /Exit preview/i }).click();
    await expect(page.getByText(/This is how customers see your profile/i)).toBeVisible();

    await ctx.close();
  });

  test('non-owner sees NO banner', async ({ browser }) => {
    vendor = await seedVendor({ chargesEnabled: false, publish: true });
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    // No login — anonymous viewer

    await page.goto(`/vendors/${vendor.slug}`);

    await expect(page.getByText(/This is how customers see your profile/i)).not.toBeVisible();

    await ctx.close();
  });
});
```

`seedVendor` may not currently support a `publish: true` option — check the helper and add it if needed (publishes the vendor profile so the public route resolves).

- [ ] **Step 3: Run both specs locally**

```bash
npm run test:e2e -- bucket-b-
```

Expected: all pass. If selectors mismatch, inspect the rendered page and adjust.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/bucket-b-event-types-everywhere.spec.ts tests/e2e/bucket-b-vendor-own-profile.spec.ts
git commit -m "test(e2e): Bucket B event types everywhere + vendor own profile specs (T16)"
```

---

### Task 17: PR + manual smoke

**Files:** none.

**Interfaces:**

- Consumes: all commits from T2–T16.

- [ ] **Step 1: Run the full local suite**

```bash
npm run typecheck && npx vitest run && npm run test:e2e -- bucket-b-
```

Expected: green. Pre-existing K-era / bucket-a-form-errors failures are out of scope; flag them in the PR description but don't gate on them.

- [ ] **Step 2: Surface the migration SQL to the user**

Copy the contents of `supabase/migrations/00059_bucket_b_event_types_and_onboarding_backfill.sql`. Surface to the user with:

> https://supabase.com/dashboard/project/lquvhjedlzubqusnfaak/sql/new

User runs against dev. Wait for confirmation. If it errors on dependencies (constraint name mismatch, unexpected column), iterate on the migration.

- [ ] **Step 3: Push the branch**

```bash
git push -u origin feat/bucket-b-ia-copy-brand
```

- [ ] **Step 4: Open the PR**

````bash
gh pr create --title "feat: Bucket B — IA/copy/brand polish" --body "$(cat <<'EOF'
## Summary

Implements **Bucket B** per `docs/superpowers/specs/2026-06-20-bucket-b-ia-copy-brand-polish-design.md` (spec PR #51).

Seven independent threads in one PR — pre-launch polish sweep.

### What ships

- **Copy:** all user-visible `couple` → `customer` in JSX + email templates; DB columns and type discriminators preserved
- **Event types:** canonical list grows 6 → 20 categories with dual cultural labels (Wedding / Shaadi, Mehndi / Henna, Walima / Wedding Feast, Aqiqah / Baby Naming); all pickers render the full list with "Other celebrations" divider
- **Languages:** Spanish added; `SPOKEN_LANGUAGES` constant consolidated
- **Guest count:** `BookingForm` renders one input for single-event packages, N inputs for multi-event; `CustomRequestForm` supports dynamic event rows; vendor + customer views show per-event breakdowns
- **Hover system:** hot-pink on hover across all interactive primitives (buttons, links, cards, chips, nav, icon buttons); 180ms transitions; respects prefers-reduced-motion; documented in DESIGN.md
- **Vendor own profile:** owner banner with "View as customer" + "Edit profile" actions; view-as-customer toggle hides banner + shows floating "Exit preview" pill; book actions are inert in preview mode
- **OnboardingGate:** relocated from `/dashboard` to signup-success; fires once on signup, mark-on-show, never re-appears

### Migration

Applied to dev pre-PR. To apply to prod after merge: https://supabase.com/dashboard/project/obpdgihdskbxzgyctaib/sql/new

```sql
ALTER TABLE booking_events DROP CONSTRAINT IF EXISTS booking_events_event_type_check;
ALTER TABLE booking_events ADD CONSTRAINT booking_events_event_type_check CHECK (event_type IN (...));
ALTER TABLE packages DROP CONSTRAINT IF EXISTS packages_event_type_check;
ALTER TABLE packages ADD CONSTRAINT packages_event_type_check CHECK (event_type IS NULL OR event_type IN (...));
UPDATE users SET onboarding_completed_at = COALESCE(onboarding_completed_at, created_at) WHERE onboarding_completed_at IS NULL;
````

(Full SQL in `supabase/migrations/00059_...`.)

## Test plan

- [ ] CI green
- [ ] Migration applied to dev (pre-PR)
- [ ] Apply migration to prod after merge
- [ ] Manual smoke: existing couple visits `/dashboard` → NO welcome modal
- [ ] Manual smoke: new signup → welcome modal once → dismiss → never returns
- [ ] Manual smoke: vendor visits own profile → banner appears → view-as-customer toggle works
- [ ] Manual smoke: hover any button on homepage → see pink + lift in 180ms

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"

```

- [ ] **Step 5: Hand off for human review.**

Wait for the user to merge + apply prod migration.

---

## Self-Review

**Spec coverage:**

- §2.1 Copy rename → T1 audit + T5 sweep ✓
- §2.2 Event types expansion → T2 constant + T3 picker sweep ✓
- §2.3 Languages + Spanish → T4 ✓
- §2.4 Guest count → T6 (BookingForm) + T7 (CustomRequest) + T8 (display) ✓
- §2.5 Vendor own profile → T13 (banner) + T14 (preview mode) ✓
- §2.6 Hover system → T9 (utilities) + T10 (shadcn) + T11 (bespoke) + T12 (docs) ✓
- §2.7 OnboardingGate → T15 ✓
- §3 Architecture details → distributed across tasks ✓
- §4 Migration → T2 ✓ (with backfill folded in)
- §5 Locked verbatim copy → embedded in T13, T14, T3 ✓
- §6 Testing approach → embedded in T2/T4/T6 (unit) + T16 (E2E) ✓
- §7 Deploy sequencing → T17 ✓

**Placeholder scan:** no TBD/TODO/FIXME. T2 step 5/6 and T15 step 4 have "audit decides which" conditionals — that's deliberate (the operational audit informs the decision); not a placeholder.

**Type consistency:**
- `EVENT_TYPES`, `EventTypeId`, `CULTURAL_EVENT_TYPES`, `GENERAL_EVENT_TYPES` consistent T2 → T3 → T7 → T16
- `SPOKEN_LANGUAGES`, `SpokenLanguage` consistent T4 → consumers
- `OnboardingGateProps` shape consistent T15
- `OwnerBanner` props consistent T13 → T14
- `ExitPreviewPill` props consistent T14

No gaps found. Plan is ready for execution.
```
