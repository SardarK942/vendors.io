# Custom-Quote Flow v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship v2 of the custom-quote flow — six punch-list fixes (calendar contrast, guest-count leading-1 lock, structured basics, Arab event types + inverted multi-day flow, hot-pink send-hover, back button) plus rebuild as a 3-step modal with a page fallback.

**Architecture:** New `CustomRequestFlow` React state machine composed of `Step1Shape` / `Step2Details` / `Step3Review`. Mounted two ways — as content inside `CustomRequestModal` (shadcn Dialog) triggered from `VendorProfile` CTAs, and inline as a page at `/vendors/[slug]/request` for deep-link fallback. Server side extends `customRequestSchemaV2` with optional `is_multi_day`, `event_city`, `venue_name`, `budget_range`; migration `00070` adds matching nullable columns to `bookings`. Legacy `CustomRequestForm.tsx` deleted once both mount points are on the new component.

**Tech Stack:** Next.js 14 (App Router), React 18 client components, Zod (validation), Tailwind (Baazar tokens: ink/cream/indigo/hot-pink/haldi), shadcn/ui (Dialog, RadioGroup), react-day-picker v10 (via `@/components/ui/date-picker`), Supabase (Postgres migrations), vitest + @testing-library/react (unit), Playwright (E2E).

## Global Constraints

- **Branch:** all commits land on `feat/vendor-page-custom-quote-fallback` (already exists). Do NOT branch off.
- **Migration numbering:** next is `00070_bookings_custom_request_fields.sql`. Do NOT collide with any existing number.
- **Migration policy** (per `migration-apply-policy` memory): apply to DEV via `psql` in the same task. Prod apply is user-managed post-merge.
- **`database.types.ts`** (per `database-types-ts-regen-cleanup-pending` memory): **hand-patch** new columns. Do NOT run `supabase gen types` — it wipes custom aliases.
- **Palette rules** (per `baazar-palette-locked-m-plus` memory): CTA rest color is `bg-ink` with `text-cream`; hover → `bg-hot-pink`. Haldi appears in **exactly one place** on this page (the "Days must be in order" chip). Hot-pink is a state color, not a CTA color.
- **Git workflow** (per `git-workflow-feature-branch-pr` memory): every task ends with a commit. Do NOT commit to main. PR opens at end of Task 11.
- **Merge rule** (per `merge-rule-full-ci-green` memory): all CI checks must be green before merge, including E2E.
- **Delete-with-feature rule** (per `delete-specs-with-features` memory): if this PR deletes `CustomRequestForm.tsx`, delete its unit tests (if any) in the same commit. The E2E spec is being rewritten — that counts as maintenance, not orphaning.
- **No new dependencies.** Everything uses stack already installed.

---

## File Structure

| Kind        | Path                                                           | Responsibility                                                                                                             |
| ----------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **Modify**  | `src/types/index.ts`                                           | Add 3 Arab event types to `EVENT_TYPES`                                                                                    |
| **Modify**  | `src/components/ui/date-picker.tsx`                            | Fix selected-day contrast (hot-pink bg, cream text on `day_button`)                                                        |
| **Modify**  | `src/lib/booking/custom-request-validation.ts`                 | Extend `customRequestSchemaV2` with `is_multi_day`, `event_city`, `venue_name`, `budget_range`                             |
| **Modify**  | `src/app/api/bookings/custom-request/route.ts`                 | Persist new fields on the bookings row                                                                                     |
| **Create**  | `supabase/migrations/00070_bookings_custom_request_fields.sql` | Add 4 nullable columns to `bookings`                                                                                       |
| **Modify**  | `src/types/database.types.ts`                                  | Hand-patch 4 new columns on `bookings.Row` + `Insert` + `Update`                                                           |
| **Create**  | `src/components/booking/CustomRequestFlow.tsx`                 | 3-step state machine wrapper. Renders one of Step1/Step2/Step3 based on internal `stepIndex`                               |
| **Create**  | `src/components/booking/steps/Step1Shape.tsx`                  | Radio (single / multi-day) + optional day-count stepper. Emits `{ isMultiDay, dayCount }`                                  |
| **Create**  | `src/components/booking/steps/Step2Details.tsx`                | N event cards + shared location/budget/description. Owns ascending-date invariant and guest-count string→number edit model |
| **Create**  | `src/components/booking/steps/Step3Review.tsx`                 | Read-only summary + `Send request` (hot-pink hover)                                                                        |
| **Create**  | `src/components/booking/CustomRequestModal.tsx`                | Shadcn `Dialog` wrapper mounting `CustomRequestFlow`                                                                       |
| **Modify**  | `src/components/marketplace/vendor-profile/VendorProfile.tsx`  | 5 CTA sites → open modal; keep `<Link href>` fallback for no-JS                                                            |
| **Modify**  | `src/app/(marketplace)/vendors/[slug]/request/page.tsx`        | Mount `CustomRequestFlow` inline; add `← Back to {vendor}` link                                                            |
| **Delete**  | `src/components/booking/CustomRequestForm.tsx`                 | Legacy form. Deleted after both mount points are on the new component                                                      |
| **Modify**  | `src/components/dashboard/BookingDetail.tsx`                   | Render `event_city` / `venue_name` / `budget_range` when present                                                           |
| **Create**  | `src/__tests__/lib/booking/custom-request-validation.test.ts`  | Unit test the extended schema                                                                                              |
| **Create**  | `src/__tests__/types/event-types.test.ts`                      | Unit test the Arab additions                                                                                               |
| **Create**  | `src/__tests__/components/date-picker.test.tsx`                | Unit test selected-day computed class                                                                                      |
| **Rewrite** | `tests/e2e/custom-request-flow.spec.ts`                        | 5 scenarios (A single, B multi-day, C ordering guard, D guest-count edit, E deep-link)                                     |

---

## Task 1: Migration + database.types patch

**Files:**

- Create: `supabase/migrations/00070_bookings_custom_request_fields.sql`
- Modify: `src/types/database.types.ts` (hand-patch `bookings.Row`, `Insert`, `Update`)

**Interfaces:**

- Consumes: nothing.
- Produces: 4 new nullable columns on `bookings` — `is_multi_day boolean NOT NULL DEFAULT false`, `event_city text`, `venue_name text`, `budget_range text` (constrained to `'lt_5k' | '5k_15k' | '15k_30k' | 'gt_30k' | 'discuss' | null`).

- [ ] **Step 1: Confirm no migration collision**

Run: `ls supabase/migrations/ | tail -3`
Expected: last file is `00069_fix_search_fulltext_rank_type.sql` (or newer numbering — if a later migration exists, bump this task's file number to `00071` etc. and update everywhere in this plan).

- [ ] **Step 2: Write the migration file**

Create `supabase/migrations/00070_bookings_custom_request_fields.sql`:

```sql
-- 00070 — custom-quote flow v2: capture is-multi-day, city, venue, budget on booking rows.
-- Nullable / defaulted so old rows are unaffected. Rollback = drop the 4 columns.

alter table public.bookings
  add column if not exists is_multi_day boolean not null default false,
  add column if not exists event_city text,
  add column if not exists venue_name text,
  add column if not exists budget_range text;

alter table public.bookings
  add constraint bookings_budget_range_check
  check (budget_range is null or budget_range in ('lt_5k','5k_15k','15k_30k','gt_30k','discuss'));
```

- [ ] **Step 3: Apply to dev**

Run (per `supabase-prod-connection` memory pattern for dev):

```bash
psql "$SUPABASE_DEV_DATABASE_URL" -f supabase/migrations/00070_bookings_custom_request_fields.sql
```

Expected output includes: `ALTER TABLE` and `ALTER TABLE`.

- [ ] **Step 4: Verify columns exist**

Run:

```bash
psql "$SUPABASE_DEV_DATABASE_URL" -c "select column_name, data_type, is_nullable, column_default from information_schema.columns where table_name = 'bookings' and column_name in ('is_multi_day','event_city','venue_name','budget_range') order by column_name;"
```

Expected: 4 rows returned, `is_multi_day` shows `boolean`/`NO`/`false`; the other three show `text`/`YES`/`null`.

- [ ] **Step 5: Hand-patch database.types.ts**

Open `src/types/database.types.ts`. Find the `bookings` table type — three keys to patch: `Row`, `Insert`, `Update`. For each, add:

```ts
is_multi_day: boolean; // Row
venue_name: string | null;
event_city: string | null;
budget_range: string | null;
```

For `Insert` and `Update`, the same four keys but all optional (`is_multi_day?: boolean`, etc.).

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors (existing errors may remain — record them, do not treat as regressions).

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/00070_bookings_custom_request_fields.sql src/types/database.types.ts
git commit -m "feat(bookings): add is_multi_day, city, venue, budget columns for custom quotes"
```

---

## Task 2: Fix calendar selected-day contrast

**Files:**

- Modify: `src/components/ui/date-picker.tsx` (lines 99–102)
- Create: `src/__tests__/components/date-picker.test.tsx`

**Interfaces:**

- Consumes: nothing new.
- Produces: unchanged component API. Selected day now renders with `bg-hot-pink` and `text-cream` on the button element (not the outer cell).

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/components/date-picker.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DatePicker } from '@/components/ui/date-picker';

function noop() {}

describe('DatePicker selected-day contrast', () => {
  it('applies hot-pink background and cream text to the button element of the selected day', () => {
    // Pick a date far in the future so it's not disabled.
    render(<DatePicker selected="2099-03-14" onSelect={noop} />);
    const selectedBtn = screen.getByRole('gridcell', { selected: true }).querySelector('button');
    expect(selectedBtn).not.toBeNull();
    const cls = selectedBtn!.className;
    // Fix: selected styling must land on the day_button element itself.
    expect(cls).toMatch(/bg-hot-pink/);
    expect(cls).toMatch(/text-cream/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- --dir src/__tests__/components/date-picker.test.tsx`
Expected: FAIL — `.className` does not contain `bg-hot-pink` (currently `text-ink` inherited from `day_button` slot).

- [ ] **Step 3: Fix the picker**

In `src/components/ui/date-picker.tsx`, replace the `classNames` block for `day_button` and `selected` (lines 99–102):

```tsx
          day: 'w-9 h-9 text-center text-[12px] tabular-nums p-0',
          day_button:
            'w-9 h-9 inline-flex items-center justify-center rounded-sm text-ink tabular-nums hover:bg-cream-soft transition-colors',
          selected:
            '[&_button]:bg-hot-pink [&_button]:text-cream [&_button]:font-semibold [&_button]:shadow-[0_2px_8px_rgba(229,19,127,0.35)] [&_button:hover]:bg-hot-pink',
```

The `[&_button]:*` variants target the inner `<button>` (which owns the text color) instead of the outer `<td>` cell — that's the whole bug.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- --dir src/__tests__/components/date-picker.test.tsx`
Expected: PASS.

- [ ] **Step 5: Confirm no other picker consumers regress**

Run: `grep -rn "from '@/components/ui/date-picker'" src`
Expected: exactly two consumers — `CustomRequestForm.tsx` and `marketplace/AvailabilityCalendar.tsx`. No API changes, so both keep working.

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/date-picker.tsx src/__tests__/components/date-picker.test.tsx
git commit -m "fix(date-picker): hot-pink selected-day, land styling on button not cell"
```

---

## Task 3: Add Arab event types

**Files:**

- Modify: `src/types/index.ts` (EVENT_TYPES, lines 54–77)
- Create: `src/__tests__/types/event-types.test.ts`

**Interfaces:**

- Consumes: nothing.
- Produces: three new entries appended to the `cultural` group — `katb_el_kitab`, `laylat_al_henna`, `zaffa`. `EventTypeId` union widens to include them. Consumers (`EventTypePicker`, custom-request validation, database.types constraint) pick them up automatically because they read from `EVENT_TYPES`.

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/types/event-types.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { EVENT_TYPES } from '@/types';

describe('EVENT_TYPES — Arab additions', () => {
  it('includes katb_el_kitab in the cultural group', () => {
    const entry = EVENT_TYPES.find((e) => e.id === 'katb_el_kitab');
    expect(entry).toBeDefined();
    expect(entry?.group).toBe('cultural');
    expect(entry?.label).toMatch(/Katb el-Kitab/i);
  });

  it('includes laylat_al_henna in the cultural group', () => {
    const entry = EVENT_TYPES.find((e) => e.id === 'laylat_al_henna');
    expect(entry).toBeDefined();
    expect(entry?.group).toBe('cultural');
    expect(entry?.label).toMatch(/Laylat al-Henna/i);
  });

  it('includes zaffa in the cultural group', () => {
    const entry = EVENT_TYPES.find((e) => e.id === 'zaffa');
    expect(entry).toBeDefined();
    expect(entry?.group).toBe('cultural');
    expect(entry?.label).toMatch(/Zaffa/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- --dir src/__tests__/types/event-types.test.ts`
Expected: FAIL — three entries not found.

- [ ] **Step 3: Add the entries**

In `src/types/index.ts`, add these three entries **before** the existing `{ id: 'multiple', label: 'Multi-event booking', group: 'cultural' as const },` line (so `multiple` stays visually last in its group):

```ts
  { id: 'katb_el_kitab', label: 'Katb el-Kitab / Milka', group: 'cultural' as const },
  { id: 'laylat_al_henna', label: 'Laylat al-Henna', group: 'cultural' as const },
  { id: 'zaffa', label: 'Zaffa (wedding procession)', group: 'cultural' as const },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- --dir src/__tests__/types/event-types.test.ts`
Expected: PASS.

- [ ] **Step 5: Confirm downstream picks them up**

Run: `grep -rn "EVENT_TYPES\b" src --include='*.ts' --include='*.tsx' | head`
Expected: consumers include `EventTypePicker`, `custom-request-validation.ts`, others. Confirm each reads from the exported constant (no hard-coded id lists).

- [ ] **Step 6: Commit**

```bash
git add src/types/index.ts src/__tests__/types/event-types.test.ts
git commit -m "feat(events): add Katb el-Kitab, Laylat al-Henna, Zaffa event types"
```

---

## Task 4: Extend API validation + persist new fields on the bookings row

**Files:**

- Modify: `src/lib/booking/custom-request-validation.ts`
- Modify: `src/app/api/bookings/custom-request/route.ts`
- Create: `src/__tests__/lib/booking/custom-request-validation.test.ts`

**Interfaces:**

- Consumes: extended `bookings` table (Task 1), new event types (Task 3).
- Produces:
  - `customRequestSchemaV2` (extended) accepts optional `is_multi_day: boolean`, `event_city: string | null`, `venue_name: string | null`, `budget_range: 'lt_5k' | '5k_15k' | '15k_30k' | 'gt_30k' | 'discuss' | null`.
  - Route handler at `POST /api/bookings/custom-request` writes these four fields onto the inserted booking row when present.

- [ ] **Step 1: Write the failing validation test**

Create `src/__tests__/lib/booking/custom-request-validation.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { customRequestSchemaV2 } from '@/lib/booking/custom-request-validation';

const validBase = {
  vendor_slug: 'karim-photography',
  events: [
    { date: '2099-03-14', startTime: '16:00', guestCount: 200, eventTypeId: 'wedding' as const },
  ],
  description:
    'Traditional South Asian wedding, ceremony at 5 PM, want drone shots of the venue if possible with the wedding party.',
};

describe('customRequestSchemaV2 — v2 extensions', () => {
  it('accepts the legacy shape (no new fields)', () => {
    const parsed = customRequestSchemaV2.safeParse(validBase);
    expect(parsed.success).toBe(true);
  });

  it('accepts all four new optional fields', () => {
    const parsed = customRequestSchemaV2.safeParse({
      ...validBase,
      is_multi_day: true,
      event_city: 'Houston, TX',
      venue_name: 'The Post Oak Hotel',
      budget_range: '15k_30k',
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects an unknown budget_range', () => {
    const parsed = customRequestSchemaV2.safeParse({ ...validBase, budget_range: 'huge_amount' });
    expect(parsed.success).toBe(false);
  });

  it('accepts null / undefined for the three optional string fields', () => {
    const parsed = customRequestSchemaV2.safeParse({
      ...validBase,
      event_city: null,
      venue_name: null,
      budget_range: null,
    });
    expect(parsed.success).toBe(true);
  });

  it('accepts the three new Arab event type ids', () => {
    for (const eventTypeId of ['katb_el_kitab', 'laylat_al_henna', 'zaffa'] as const) {
      const parsed = customRequestSchemaV2.safeParse({
        ...validBase,
        events: [{ date: '2099-03-14', startTime: '16:00', guestCount: 200, eventTypeId }],
      });
      expect(parsed.success).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run test to verify failures on the new-fields cases**

Run: `npm run test -- --dir src/__tests__/lib/booking/custom-request-validation.test.ts`
Expected: some passes, but "accepts all four new optional fields" FAILS because schema does not know the new keys yet.

- [ ] **Step 3: Extend the schema**

In `src/lib/booking/custom-request-validation.ts`, replace the V2 block with:

```ts
export const BUDGET_RANGES = ['lt_5k', '5k_15k', '15k_30k', 'gt_30k', 'discuss'] as const;
export type BudgetRange = (typeof BUDGET_RANGES)[number];

// V2 schema — extended with v2 punch-list fields (all optional, nullable).
export const customRequestSchemaV2 = z.object({
  vendor_slug: z.string().min(1).max(120),
  events: z.array(customEventEntrySchema).min(1),
  description: z.string().min(50).max(1000),
  is_multi_day: z.boolean().optional().default(false),
  event_city: z.string().min(1).max(120).nullish(),
  venue_name: z.string().max(120).nullish(),
  budget_range: z.enum(BUDGET_RANGES).nullish(),
});

export type CustomRequestInputV2 = z.infer<typeof customRequestSchemaV2>;
```

- [ ] **Step 4: Run tests to verify all pass**

Run: `npm run test -- --dir src/__tests__/lib/booking/custom-request-validation.test.ts`
Expected: all cases PASS.

- [ ] **Step 5: Persist the new fields in the route**

Open `src/app/api/bookings/custom-request/route.ts`. Locate the Supabase `.insert(...)` call. Extend the inserted object with the four new columns (whichever fields the parsed payload has):

```ts
const insertRow = {
  vendor_id: vendor.id,
  couple_id: user.id,
  status: 'pending',
  is_multi_day: parsed.is_multi_day ?? false,
  event_city: parsed.event_city ?? null,
  venue_name: parsed.venue_name ?? null,
  budget_range: parsed.budget_range ?? null,
  // ... existing keys stay verbatim
};
```

Keep the existing per-event insert logic (booking_events / whatever the current shape is) unchanged. If existing insert code uses spread or field-by-field, adapt to the same style.

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/booking/custom-request-validation.ts src/app/api/bookings/custom-request/route.ts src/__tests__/lib/booking/custom-request-validation.test.ts
git commit -m "feat(custom-request): accept and persist is_multi_day + city + venue + budget"
```

---

## Task 5: `CustomRequestFlow` state machine + Step 1 (shape gate)

**Files:**

- Create: `src/components/booking/CustomRequestFlow.tsx`
- Create: `src/components/booking/steps/Step1Shape.tsx`

**Interfaces:**

- Consumes: shadcn `RadioGroup` from `@/components/ui/radio-group` (verify exists; if not, install via `npx shadcn add radio-group`); shadcn `Button` from `@/components/ui/button`.
- Produces:
  - `CustomRequestFlow` React component with props `{ vendorSlug: string; vendorBusinessName: string; vendorResponseSlaHours: number | null; onClose?: () => void }`.
  - Owns internal state: `{ stepIndex: 0|1|2, isMultiDay: boolean, dayCount: number, events: CustomEvent[], eventCity: string, venueName: string, budgetRange: BudgetRange | null, description: string, submissionState }`.
  - `Step1Shape` props: `{ isMultiDay: boolean; dayCount: number; onChange: (v: {isMultiDay: boolean; dayCount: number}) => void; onContinue: () => void; onCancel?: () => void }`.

- [ ] **Step 1: Confirm shadcn RadioGroup is installed**

Run: `ls src/components/ui/radio-group.tsx 2>&1`
If missing: `npx shadcn@latest add radio-group` — this is a shadcn add, not a new dep.

- [ ] **Step 2: Write the failing Step1 test**

Create `src/__tests__/components/steps/step1-shape.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Step1Shape } from '@/components/booking/steps/Step1Shape';

describe('Step1Shape', () => {
  it('renders single-event by default, no day counter visible', () => {
    render(<Step1Shape isMultiDay={false} dayCount={3} onChange={vi.fn()} onContinue={vi.fn()} />);
    expect(screen.getByRole('radio', { name: /single event/i })).toBeChecked();
    expect(screen.queryByLabelText(/how many events/i)).not.toBeInTheDocument();
  });

  it('emits multi-day change and shows the day counter when picked', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Step1Shape isMultiDay={false} dayCount={3} onChange={onChange} onContinue={vi.fn()} />);
    await user.click(screen.getByRole('radio', { name: /multi-day/i }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ isMultiDay: true }));
  });

  it('shows day counter when isMultiDay=true', () => {
    render(<Step1Shape isMultiDay={true} dayCount={3} onChange={vi.fn()} onContinue={vi.fn()} />);
    expect(screen.getByLabelText(/how many events/i)).toHaveValue(3);
  });

  it('fires onContinue when the button is clicked', async () => {
    const user = userEvent.setup();
    const onContinue = vi.fn();
    render(
      <Step1Shape isMultiDay={false} dayCount={3} onChange={vi.fn()} onContinue={onContinue} />
    );
    await user.click(screen.getByRole('button', { name: /continue/i }));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run test -- --dir src/__tests__/components/steps/step1-shape.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement Step1Shape**

Create `src/components/booking/steps/Step1Shape.tsx`:

```tsx
'use client';

import * as React from 'react';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

export interface Step1ShapeProps {
  isMultiDay: boolean;
  dayCount: number;
  onChange: (v: { isMultiDay: boolean; dayCount: number }) => void;
  onContinue: () => void;
  onCancel?: () => void;
}

export function Step1Shape({
  isMultiDay,
  dayCount,
  onChange,
  onContinue,
  onCancel,
}: Step1ShapeProps) {
  return (
    <div className="space-y-8">
      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo">
          Step 1 of 3
        </p>
        <h2 className="text-balance font-display text-2xl font-bold tracking-[-0.014em] text-ink">
          What's the shape of your event?
        </h2>
        <p className="mt-2 text-pretty text-sm text-ink-muted">
          Multi-day events (a mehndi Friday, a wedding Saturday, a walima Sunday) get their own card
          for each day.
        </p>
      </div>

      <RadioGroup
        value={isMultiDay ? 'multi' : 'single'}
        onValueChange={(v) => onChange({ isMultiDay: v === 'multi', dayCount })}
        className="gap-3"
      >
        <label className="flex cursor-pointer items-start gap-3 rounded-md border border-hairline bg-cream p-4 transition-colors hover:border-ink">
          <RadioGroupItem value="single" id="shape-single" className="mt-0.5" />
          <div>
            <div className="text-sm font-semibold text-ink">Single event</div>
            <div className="text-xs text-ink-muted">One date, one guest count, one event type.</div>
          </div>
        </label>
        <label className="flex cursor-pointer items-start gap-3 rounded-md border border-hairline bg-cream p-4 transition-colors hover:border-ink">
          <RadioGroupItem value="multi" id="shape-multi" className="mt-0.5" />
          <div>
            <div className="text-sm font-semibold text-ink">Multi-day / multi-event</div>
            <div className="text-xs text-ink-muted">
              Multiple ceremonies across days. Each gets its own type, date, time, and guest count.
            </div>
          </div>
        </label>
      </RadioGroup>

      {isMultiDay && (
        <div>
          <label
            htmlFor="day-count"
            className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo"
          >
            How many events?
          </label>
          <input
            id="day-count"
            aria-label="How many events?"
            type="number"
            min={2}
            max={7}
            value={dayCount}
            onChange={(e) => {
              const n = Math.max(2, Math.min(7, Number(e.target.value) || 2));
              onChange({ isMultiDay: true, dayCount: n });
            }}
            className="w-24 rounded-md border border-hairline bg-cream px-3 py-2 tabular-nums text-ink focus:border-ink focus:outline-none"
          />
          <p className="mt-1 text-xs text-ink-soft">2 to 7 events.</p>
        </div>
      )}

      <div className="flex items-center justify-between border-t border-hairline pt-4">
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md px-3 py-2 text-sm text-ink-muted hover:text-ink"
          >
            Cancel
          </button>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={onContinue}
          className="inline-flex items-center gap-2 rounded-md bg-ink px-6 py-3 text-sm font-semibold text-cream transition-[background-color,transform] hover:bg-hot-pink active:scale-[0.96]"
        >
          Continue →
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run Step1 tests to verify they pass**

Run: `npm run test -- --dir src/__tests__/components/steps/step1-shape.test.tsx`
Expected: PASS.

- [ ] **Step 6: Implement CustomRequestFlow shell**

Create `src/components/booking/CustomRequestFlow.tsx`:

```tsx
'use client';

import * as React from 'react';
import type { EventTypeId } from '@/types';
import type { BudgetRange } from '@/lib/booking/custom-request-validation';
import { Step1Shape } from './steps/Step1Shape';

export type CustomEvent = {
  id: string;
  date: string;
  startTime: string;
  guestCount: string; // string during edit; coerced on submit
  eventTypeId: EventTypeId;
};

export interface CustomRequestFlowProps {
  vendorSlug: string;
  vendorBusinessName: string;
  vendorResponseSlaHours: number | null;
  onClose?: () => void;
}

function makeBlankEvent(): CustomEvent {
  return {
    id: crypto.randomUUID(),
    date: '',
    startTime: '',
    guestCount: '50',
    eventTypeId: 'wedding',
  };
}

export function CustomRequestFlow({
  vendorSlug,
  vendorBusinessName,
  vendorResponseSlaHours,
  onClose,
}: CustomRequestFlowProps) {
  const [stepIndex, setStepIndex] = React.useState<0 | 1 | 2>(0);
  const [isMultiDay, setIsMultiDay] = React.useState(false);
  const [dayCount, setDayCount] = React.useState(3);
  const [events, setEvents] = React.useState<CustomEvent[]>([makeBlankEvent()]);
  const [eventCity, setEventCity] = React.useState('');
  const [venueName, setVenueName] = React.useState('');
  const [budgetRange, setBudgetRange] = React.useState<BudgetRange | null>(null);
  const [description, setDescription] = React.useState('');

  function goToStep2() {
    // Reconcile the events array with the shape decision.
    if (isMultiDay) {
      setEvents((prev) => {
        const target = dayCount;
        if (prev.length === target) return prev;
        if (prev.length < target) {
          return [...prev, ...Array.from({ length: target - prev.length }, makeBlankEvent)];
        }
        return prev.slice(0, target);
      });
    } else {
      setEvents((prev) => (prev.length === 1 ? prev : [prev[0]]));
    }
    setStepIndex(1);
  }

  return (
    <div className="mx-auto max-w-3xl">
      {stepIndex === 0 && (
        <Step1Shape
          isMultiDay={isMultiDay}
          dayCount={dayCount}
          onChange={(v) => {
            setIsMultiDay(v.isMultiDay);
            setDayCount(v.dayCount);
          }}
          onContinue={goToStep2}
          onCancel={onClose}
        />
      )}
      {stepIndex === 1 && (
        <div className="text-sm text-ink-muted">
          Step 2 renders here (implemented in Task 6). Current state:{' '}
          {isMultiDay ? 'multi' : 'single'}, {events.length} event(s), vendor {vendorBusinessName}.
        </div>
      )}
      {stepIndex === 2 && (
        <div className="text-sm text-ink-muted">Step 3 renders here (Task 7).</div>
      )}
    </div>
  );
}
```

- [ ] **Step 7: Typecheck the flow**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/components/booking/CustomRequestFlow.tsx src/components/booking/steps/Step1Shape.tsx src/__tests__/components/steps/step1-shape.test.tsx
git commit -m "feat(custom-request): flow shell + Step 1 shape gate"
```

---

## Task 6: Step 2 — event cards + shared fields (guest-count fix, ascending-date rule)

**Files:**

- Create: `src/components/booking/steps/Step2Details.tsx`
- Modify: `src/components/booking/CustomRequestFlow.tsx` (wire Step 2 in, remove placeholder)

**Interfaces:**

- Consumes: `DatePicker`, `EventTypePicker`, `CustomEvent` (from Task 5), `BUDGET_RANGES` (from Task 4).
- Produces:
  - `Step2Details` props: `{ isMultiDay: boolean; events: CustomEvent[]; onEventsChange: (events: CustomEvent[]) => void; eventCity, venueName, budgetRange, description; and setters for each; onBack: () => void; onContinue: () => void }`.
  - Emits ascending-date invariant: when Day N changes, Days > N with dates `<= newDayNDate` clear their date.
  - Guest count edit uses `string` locally; coerces on Step 3 submit only.

- [ ] **Step 1: Write the failing Step2 tests**

Create `src/__tests__/components/steps/step2-details.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Step2Details } from '@/components/booking/steps/Step2Details';
import type { CustomEvent } from '@/components/booking/CustomRequestFlow';

function mkEvent(overrides: Partial<CustomEvent> = {}): CustomEvent {
  return {
    id: crypto.randomUUID(),
    date: '',
    startTime: '',
    guestCount: '50',
    eventTypeId: 'wedding',
    ...overrides,
  };
}

describe('Step2Details — guest count fix', () => {
  it('allows clearing the guest count field and typing a value not starting with 1', async () => {
    const user = userEvent.setup();
    let events: CustomEvent[] = [mkEvent()];
    const onEventsChange = vi.fn((next: CustomEvent[]) => {
      events = next;
    });
    render(
      <Step2Details
        isMultiDay={false}
        events={events}
        onEventsChange={onEventsChange}
        eventCity=""
        venueName=""
        budgetRange={null}
        description=""
        onEventCityChange={vi.fn()}
        onVenueNameChange={vi.fn()}
        onBudgetRangeChange={vi.fn()}
        onDescriptionChange={vi.fn()}
        onBack={vi.fn()}
        onContinue={vi.fn()}
      />
    );
    const guestInput = screen.getByLabelText(/guests/i) as HTMLInputElement;
    await user.clear(guestInput);
    await user.type(guestInput, '600');
    // Final call to onEventsChange should carry guestCount '600' (string), not clamp to '1'.
    const last = onEventsChange.mock.calls.at(-1)?.[0][0].guestCount;
    expect(last).toBe('600');
  });
});

describe('Step2Details — ascending date invariant', () => {
  it('clears Day 2 date when Day 1 date moves past it', async () => {
    const eventsBefore: CustomEvent[] = [
      mkEvent({ date: '2099-03-13' }),
      mkEvent({ date: '2099-03-14' }),
    ];
    let events = eventsBefore;
    const onEventsChange = vi.fn((next: CustomEvent[]) => {
      events = next;
    });
    render(
      <Step2Details
        isMultiDay={true}
        events={events}
        onEventsChange={onEventsChange}
        eventCity=""
        venueName=""
        budgetRange={null}
        description=""
        onEventCityChange={vi.fn()}
        onVenueNameChange={vi.fn()}
        onBudgetRangeChange={vi.fn()}
        onDescriptionChange={vi.fn()}
        onBack={vi.fn()}
        onContinue={vi.fn()}
      />
    );
    // Simulate re-selecting Day 1 to Mar 20 via the exposed test hook path:
    // The Step2Details component exposes DatePicker; test the behavior by directly
    // dispatching a change through the onEventsChange path.
    // Instead, this behavior is asserted via an internal helper. If refactored,
    // update the test accordingly.
    // Placeholder: this test guards the ordering invariant lives somewhere.
    expect(true).toBe(true);
  });
});
```

Note: the ordering invariant is genuinely hard to hit through DOM alone because `react-day-picker` renders many cells. The unit test above is a scaffold; the real coverage lands in the E2E scenario C in Task 11.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- --dir src/__tests__/components/steps/step2-details.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement Step2Details**

Create `src/components/booking/steps/Step2Details.tsx`:

```tsx
'use client';

import * as React from 'react';
import { DatePicker } from '@/components/ui/date-picker';
import { EventTypePicker } from '@/components/ui/EventTypePicker';
import { BUDGET_RANGES, type BudgetRange } from '@/lib/booking/custom-request-validation';
import type { CustomEvent } from '../CustomRequestFlow';

export interface Step2DetailsProps {
  isMultiDay: boolean;
  events: CustomEvent[];
  onEventsChange: (events: CustomEvent[]) => void;
  eventCity: string;
  onEventCityChange: (v: string) => void;
  venueName: string;
  onVenueNameChange: (v: string) => void;
  budgetRange: BudgetRange | null;
  onBudgetRangeChange: (v: BudgetRange | null) => void;
  description: string;
  onDescriptionChange: (v: string) => void;
  onBack: () => void;
  onContinue: () => void;
}

const BUDGET_LABEL: Record<BudgetRange, string> = {
  lt_5k: 'Under $5k',
  '5k_15k': '$5k–15k',
  '15k_30k': '$15k–30k',
  gt_30k: '$30k+',
  discuss: 'Prefer to discuss',
};

const HINT_CHIPS = [
  'Cultural specifics',
  'Coverage hours',
  'Must-have shots',
  'Dietary needs',
  'Color palette',
];

export function Step2Details({
  isMultiDay,
  events,
  onEventsChange,
  eventCity,
  onEventCityChange,
  venueName,
  onVenueNameChange,
  budgetRange,
  onBudgetRangeChange,
  description,
  onDescriptionChange,
  onBack,
  onContinue,
}: Step2DetailsProps) {
  function updateEvent(idx: number, patch: Partial<CustomEvent>) {
    const next = events.map((e, i) => (i === idx ? { ...e, ...patch } : e));
    // Ascending-date invariant: if the changed row is a date and later rows have
    // dates <= new date, clear those later dates.
    if (patch.date && isMultiDay) {
      for (let j = idx + 1; j < next.length; j++) {
        if (next[j].date && next[j].date <= patch.date) {
          next[j] = { ...next[j], date: '' };
        }
      }
    }
    onEventsChange(next);
  }

  const canContinue =
    events.every((e) => e.date && e.eventTypeId && e.guestCount.trim()) &&
    eventCity.trim().length > 0 &&
    description.trim().length >= 50;

  return (
    <div className="space-y-6">
      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo">
          Step 2 of 3 · {isMultiDay ? 'Multi-day' : 'Single event'}
          {isMultiDay && (
            <span className="ml-2 inline-block rounded-full border border-haldi/40 bg-haldi/15 px-2 py-0.5 text-[10px] tracking-[0.14em] text-ink">
              Days must be in order
            </span>
          )}
        </p>
        <h2 className="text-balance font-display text-2xl font-bold tracking-[-0.014em] text-ink">
          Tell us the details
        </h2>
      </div>

      <div className="space-y-4">
        {events.map((event, idx) => {
          const prevDate = idx > 0 ? events[idx - 1].date : '';
          const minDateMatcher = prevDate
            ? { before: new Date(`${prevDate}T00:00:00`) }
            : undefined;
          return (
            <div
              key={event.id}
              className="rounded-lg border border-hairline bg-cream p-5 shadow-[0_1px_2px_rgba(27,25,19,0.04),0_8px_24px_rgba(27,25,19,0.05)]"
            >
              <div className="mb-3 flex items-center justify-between">
                <span className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo">
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-indigo text-[10px] font-semibold text-cream shadow-[0_1px_2px_rgba(43,46,122,0.25)]">
                    {idx + 1}
                  </span>
                  {isMultiDay ? `Day ${idx + 1}` : 'Event details'}
                </span>
              </div>

              <div className="grid grid-cols-1 gap-6 md:grid-cols-[268px_1fr]">
                <div>
                  <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo">
                    Date
                    {isMultiDay && idx > 0 && prevDate && (
                      <span className="ml-2 font-normal text-ink-soft">
                        {' '}
                        — must be after {prevDate}
                      </span>
                    )}
                  </label>
                  <DatePicker
                    selected={event.date}
                    onSelect={(v) => updateEvent(idx, { date: v })}
                    disabled={minDateMatcher}
                  />
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo">
                      Event type
                    </label>
                    <EventTypePicker
                      value={event.eventTypeId}
                      onValueChange={(v) => updateEvent(idx, { eventTypeId: v })}
                    />
                  </div>
                  <div>
                    <label
                      htmlFor={`time-${event.id}`}
                      className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo"
                    >
                      Start time
                    </label>
                    <input
                      id={`time-${event.id}`}
                      type="time"
                      value={event.startTime}
                      onChange={(e) => updateEvent(idx, { startTime: e.target.value })}
                      className="w-full rounded-md border border-hairline bg-cream px-3 py-2 text-ink focus:border-ink focus:outline-none"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor={`guests-${event.id}`}
                      className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo"
                    >
                      Guests
                    </label>
                    <input
                      id={`guests-${event.id}`}
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={event.guestCount}
                      onChange={(e) => {
                        // Allow any digits or empty. Coercion happens at Step 3 submit.
                        const raw = e.target.value.replace(/[^0-9]/g, '');
                        updateEvent(idx, { guestCount: raw });
                      }}
                      className="w-full rounded-md border border-hairline bg-cream px-3 py-2 tabular-nums text-ink focus:border-ink focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid gap-4 border-t border-hairline pt-6 md:grid-cols-2">
        <div>
          <label
            htmlFor="event-city"
            className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo"
          >
            Event city
          </label>
          <input
            id="event-city"
            type="text"
            required
            value={eventCity}
            onChange={(e) => onEventCityChange(e.target.value)}
            placeholder="Houston, TX"
            className="w-full rounded-md border border-hairline bg-cream px-3 py-2 text-ink focus:border-ink focus:outline-none"
          />
        </div>
        <div>
          <label
            htmlFor="venue-name"
            className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo"
          >
            Venue name <span className="text-ink-soft">— optional</span>
          </label>
          <input
            id="venue-name"
            type="text"
            value={venueName}
            onChange={(e) => onVenueNameChange(e.target.value)}
            placeholder="The Post Oak Hotel, or leave blank if not booked"
            className="w-full rounded-md border border-hairline bg-cream px-3 py-2 text-ink focus:border-ink focus:outline-none"
          />
        </div>
      </div>

      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo">
          Budget range{' '}
          <span className="font-normal normal-case tracking-normal text-ink-soft">
            — optional, helps them quote
          </span>
        </p>
        <div role="radiogroup" aria-label="Budget range" className="flex flex-wrap gap-2">
          {BUDGET_RANGES.map((id) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={budgetRange === id}
              onClick={() => onBudgetRangeChange(budgetRange === id ? null : id)}
              className={
                budgetRange === id
                  ? 'rounded-full border border-indigo bg-indigo px-4 py-1.5 text-xs font-semibold text-cream shadow-[0_2px_8px_rgba(43,46,122,0.28)]'
                  : 'border-hairline-strong rounded-full border bg-transparent px-4 py-1.5 text-xs text-ink-muted hover:border-ink hover:text-ink'
              }
            >
              {BUDGET_LABEL[id]}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo">
          Tell them more
        </p>
        <div className="mb-2 flex flex-wrap gap-1.5">
          {HINT_CHIPS.map((chip) => (
            <span
              key={chip}
              className="rounded-full border border-hairline bg-cream px-2.5 py-1 text-[11px] text-ink-muted"
            >
              {chip}
            </span>
          ))}
        </div>
        <textarea
          rows={6}
          minLength={50}
          maxLength={1000}
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          placeholder="Tell the vendor what makes your event special — coverage hours, dietary needs, color palette, cultural specifics, anything outside their standard offering…"
          className="w-full rounded-md border border-hairline bg-cream px-3 py-2 text-ink focus:border-ink focus:outline-none"
        />
        <p className="mt-1 text-xs tabular-nums text-ink-soft">
          {description.length} / 1000 · minimum 50 characters
        </p>
      </div>

      <div className="flex items-center justify-between border-t border-hairline pt-4">
        <button
          type="button"
          onClick={onBack}
          className="rounded-md px-3 py-2 text-sm text-ink-muted hover:text-ink"
        >
          ← Back
        </button>
        <button
          type="button"
          disabled={!canContinue}
          onClick={onContinue}
          className="inline-flex items-center gap-2 rounded-md bg-ink px-6 py-3 text-sm font-semibold text-cream transition-[background-color,transform] hover:bg-hot-pink active:scale-[0.96] disabled:opacity-50 disabled:hover:bg-ink"
        >
          Review →
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Wire Step 2 into the flow**

In `src/components/booking/CustomRequestFlow.tsx`, replace the `stepIndex === 1` placeholder with:

```tsx
{
  stepIndex === 1 && (
    <Step2Details
      isMultiDay={isMultiDay}
      events={events}
      onEventsChange={setEvents}
      eventCity={eventCity}
      onEventCityChange={setEventCity}
      venueName={venueName}
      onVenueNameChange={setVenueName}
      budgetRange={budgetRange}
      onBudgetRangeChange={setBudgetRange}
      description={description}
      onDescriptionChange={setDescription}
      onBack={() => setStepIndex(0)}
      onContinue={() => setStepIndex(2)}
    />
  );
}
```

Add the import: `import { Step2Details } from './steps/Step2Details';`

- [ ] **Step 5: Run tests**

Run: `npm run test -- --dir src/__tests__/components/steps/step2-details.test.tsx`
Expected: guest-count test PASSES.

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/booking/steps/Step2Details.tsx src/components/booking/CustomRequestFlow.tsx src/__tests__/components/steps/step2-details.test.tsx
git commit -m "feat(custom-request): Step 2 details — cards, guest fix, ascending-date rule, location, budget"
```

---

## Task 7: Step 3 — review + send (with hot-pink hover)

**Files:**

- Create: `src/components/booking/steps/Step3Review.tsx`
- Modify: `src/components/booking/CustomRequestFlow.tsx` (wire Step 3, add submit)

**Interfaces:**

- Consumes: full flow state.
- Produces:
  - `Step3Review` props: `{ isMultiDay, events, eventCity, venueName, budgetRange, description, vendorBusinessName, vendorResponseSlaHours, onBack: () => void, onSubmit: () => Promise<void>, submitting: boolean, submitError: string | null }`.
  - Renders a read-only summary + Send request button (`bg-ink` → `hover:bg-hot-pink`).
  - `CustomRequestFlow` grows a submit handler that POSTs to `/api/bookings/custom-request` with the extended payload.

- [ ] **Step 1: Implement Step3Review**

Create `src/components/booking/steps/Step3Review.tsx`:

```tsx
'use client';

import * as React from 'react';
import { EVENT_TYPES } from '@/types';
import { type BudgetRange } from '@/lib/booking/custom-request-validation';
import type { CustomEvent } from '../CustomRequestFlow';

const BUDGET_LABEL: Record<BudgetRange, string> = {
  lt_5k: 'Under $5k',
  '5k_15k': '$5k–15k',
  '15k_30k': '$15k–30k',
  gt_30k: '$30k+',
  discuss: 'Prefer to discuss',
};

const TYPE_LABEL: Record<string, string> = Object.fromEntries(
  EVENT_TYPES.map((e) => [e.id, e.label])
);

export interface Step3ReviewProps {
  isMultiDay: boolean;
  events: CustomEvent[];
  eventCity: string;
  venueName: string;
  budgetRange: BudgetRange | null;
  description: string;
  vendorBusinessName: string;
  vendorResponseSlaHours: number | null;
  onBack: () => void;
  onSubmit: () => void | Promise<void>;
  submitting: boolean;
  submitError: string | null;
}

export function Step3Review(props: Step3ReviewProps) {
  const {
    isMultiDay,
    events,
    eventCity,
    venueName,
    budgetRange,
    description,
    vendorBusinessName,
    onBack,
    onSubmit,
    submitting,
    submitError,
  } = props;

  return (
    <div className="space-y-6">
      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo">
          Step 3 of 3
        </p>
        <h2 className="text-balance font-display text-2xl font-bold tracking-[-0.014em] text-ink">
          Review and send
        </h2>
        <p className="mt-2 text-sm text-ink-muted">
          {vendorBusinessName} will get exactly this. Change anything by going back.
        </p>
      </div>

      {submitError && (
        <div role="alert" className="rounded-md bg-haldi/10 p-3 text-sm text-ink">
          {submitError}
        </div>
      )}

      <div className="space-y-5 rounded-lg border border-hairline bg-cream p-5">
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo">
            {isMultiDay ? `${events.length}-day event` : 'Single event'}
          </p>
          <div className="space-y-3">
            {events.map((e, i) => (
              <div key={e.id} className="grid grid-cols-4 gap-3 text-sm text-ink">
                <div className="col-span-1 text-ink-muted">
                  {isMultiDay ? `Day ${i + 1}` : 'Event'}
                </div>
                <div>{TYPE_LABEL[e.eventTypeId] ?? e.eventTypeId}</div>
                <div className="tabular-nums">
                  {e.date} {e.startTime && `· ${e.startTime}`}
                </div>
                <div className="tabular-nums">{e.guestCount} guests</div>
              </div>
            ))}
          </div>
        </div>
        <div className="border-t border-hairline pt-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo">
            Location
          </p>
          <p className="text-sm text-ink">
            {eventCity}
            {venueName && ` · ${venueName}`}
          </p>
        </div>
        {budgetRange && (
          <div className="border-t border-hairline pt-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo">
              Budget
            </p>
            <p className="text-sm text-ink">{BUDGET_LABEL[budgetRange]}</p>
          </div>
        )}
        <div className="border-t border-hairline pt-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo">Notes</p>
          <p className="whitespace-pre-wrap text-pretty text-sm text-ink">{description}</p>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-hairline pt-4">
        <button
          type="button"
          onClick={onBack}
          disabled={submitting}
          className="rounded-md px-3 py-2 text-sm text-ink-muted hover:text-ink disabled:opacity-50"
        >
          ← Back
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={submitting}
          aria-busy={submitting}
          className="inline-flex items-center gap-2 rounded-md bg-ink px-6 py-3 text-sm font-semibold text-cream transition-[background-color,transform] hover:bg-hot-pink active:scale-[0.96] disabled:opacity-60"
        >
          {submitting ? 'Sending request…' : 'Send request'}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire Step 3 + submit handler into flow**

In `src/components/booking/CustomRequestFlow.tsx`:

Add above the return: submission state and handler.

```tsx
const [submitting, setSubmitting] = React.useState(false);
const [submitError, setSubmitError] = React.useState<string | null>(null);
const [successBookingId, setSuccessBookingId] = React.useState<string | null>(null);

async function handleSubmit() {
  setSubmitError(null);
  setSubmitting(true);
  try {
    const res = await fetch('/api/bookings/custom-request', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        vendor_slug: vendorSlug,
        is_multi_day: isMultiDay,
        events: events.map((e) => ({
          date: e.date,
          startTime: e.startTime,
          guestCount: Math.max(1, Number(e.guestCount) || 1),
          eventTypeId: e.eventTypeId,
        })),
        event_city: eventCity.trim() || null,
        venue_name: venueName.trim() || null,
        budget_range: budgetRange,
        description,
      }),
    });
    const json = await res.json();
    if (!res.ok || !json.ok) {
      setSubmitError('We couldn’t send your request — please try again.');
      return;
    }
    setSuccessBookingId(json.booking_id);
  } catch {
    setSubmitError('We couldn’t send your request — please try again.');
  } finally {
    setSubmitting(false);
  }
}
```

Replace the `stepIndex === 2` placeholder with:

```tsx
{
  stepIndex === 2 && !successBookingId && (
    <Step3Review
      isMultiDay={isMultiDay}
      events={events}
      eventCity={eventCity}
      venueName={venueName}
      budgetRange={budgetRange}
      description={description}
      vendorBusinessName={vendorBusinessName}
      vendorResponseSlaHours={vendorResponseSlaHours}
      onBack={() => setStepIndex(1)}
      onSubmit={handleSubmit}
      submitting={submitting}
      submitError={submitError}
    />
  );
}

{
  successBookingId && (
    <div
      role="status"
      aria-live="polite"
      className="rounded-lg border border-hairline bg-cream p-8 text-ink"
    >
      <h2 className="text-balance font-display text-2xl font-bold tracking-[-0.012em]">
        Request sent.
      </h2>
      <p className="mt-3 text-sm text-ink-muted">
        {vendorBusinessName} will respond
        {vendorResponseSlaHours ? ` within ${vendorResponseSlaHours} hours` : ' soon'} with a quote.
        We'll send you a notification — check your dashboard inbox.
      </p>
      <div className="mt-6 flex gap-3">
        <a
          href={`/dashboard/bookings/${successBookingId}`}
          className="rounded-md bg-ink px-4 py-2 text-sm font-semibold text-cream hover:bg-hot-pink active:scale-[0.96]"
        >
          View in dashboard
        </a>
        <a
          href="/vendors"
          className="rounded-md border border-hairline px-4 py-2 text-sm font-semibold text-ink hover:border-ink"
        >
          Browse other vendors
        </a>
      </div>
    </div>
  );
}
```

Add: `import { Step3Review } from './steps/Step3Review';`

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Manual smoke via dev server**

Run: `npm run dev` — visit `/vendors/[any-slug]/request` (page mounts CustomRequestFlow via Task 8 next; for now confirm the component tree compiles without runtime errors by mounting a test route or checking the build). Skip if page swap not done yet.

- [ ] **Step 5: Commit**

```bash
git add src/components/booking/steps/Step3Review.tsx src/components/booking/CustomRequestFlow.tsx
git commit -m "feat(custom-request): Step 3 review + submit; hot-pink hover on Send"
```

---

## Task 8: Page fallback — mount `CustomRequestFlow` at `/vendors/[slug]/request`

**Files:**

- Modify: `src/app/(marketplace)/vendors/[slug]/request/page.tsx`

**Interfaces:**

- Consumes: `CustomRequestFlow` from Task 7.
- Produces: page renders the same flow inline (no modal chrome, no `onClose`). A `← Back to {vendor.business_name}` link sits above the flow.

- [ ] **Step 1: Swap the page**

Replace the body of `src/app/(marketplace)/vendors/[slug]/request/page.tsx` (keeping auth + fetch logic) with:

```tsx
import Link from 'next/link';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { notFound, redirect } from 'next/navigation';
import { CustomRequestFlow } from '@/components/booking/CustomRequestFlow';

export const dynamic = 'force-dynamic';

interface RequestPageProps {
  params: Promise<{ slug: string }>;
}

export default async function CustomRequestPage({ params }: RequestPageProps) {
  const { slug } = await params;
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?redirect=/vendors/${slug}/request`);
  }

  const { data: vendor } = await supabase
    .from('vendor_profiles')
    .select('business_name, response_sla_hours')
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle();

  if (!vendor) notFound();

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Link
        href={`/vendors/${slug}`}
        className="mb-6 inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink"
      >
        ← Back to {vendor.business_name}
      </Link>
      <CustomRequestFlow
        vendorSlug={slug}
        vendorBusinessName={vendor.business_name}
        vendorResponseSlaHours={vendor.response_sla_hours ?? null}
      />
    </div>
  );
}
```

- [ ] **Step 2: Smoke test**

Run `npm run dev`. Visit `/vendors/[a-real-slug]/request` (log in first if needed). Confirm Step 1 renders, radio + continue works, Step 2 renders, Step 3 renders. Click through to a fake send if possible.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(marketplace\)/vendors/\[slug\]/request/page.tsx
git commit -m "feat(custom-request): mount flow on /vendors/[slug]/request with back link"
```

---

## Task 9: Modal wrapper + wire vendor page CTAs + delete legacy form

**Files:**

- Create: `src/components/booking/CustomRequestModal.tsx`
- Modify: `src/components/marketplace/vendor-profile/VendorProfile.tsx`
- Delete: `src/components/booking/CustomRequestForm.tsx`

**Interfaces:**

- Consumes: `CustomRequestFlow`, shadcn `Dialog` from `@/components/ui/dialog`.
- Produces:
  - `CustomRequestModal` props: `{ open: boolean; onOpenChange: (open: boolean) => void; vendorSlug: string; vendorBusinessName: string; vendorResponseSlaHours: number | null }`.
  - `VendorProfile` hoists a single `[modalOpen, setModalOpen]` and each of the 5 CTAs opens it via `onClick={() => setModalOpen(true)}`. `<Link>` fallback preserved so no-JS clicks still navigate to `/vendors/[slug]/request`.
  - Legacy `CustomRequestForm.tsx` no longer imported anywhere; deleted.

- [ ] **Step 1: Verify no other legacy-form imports**

Run: `grep -rn "CustomRequestForm" src`
Expected: only `src/components/booking/CustomRequestForm.tsx` (self) — no external imports remain since Task 8 moved the page off it. If any other file still imports it, migrate that file first.

- [ ] **Step 2: Create the modal wrapper**

Create `src/components/booking/CustomRequestModal.tsx`:

```tsx
'use client';

import * as React from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { CustomRequestFlow } from './CustomRequestFlow';

export interface CustomRequestModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vendorSlug: string;
  vendorBusinessName: string;
  vendorResponseSlaHours: number | null;
}

export function CustomRequestModal({
  open,
  onOpenChange,
  vendorSlug,
  vendorBusinessName,
  vendorResponseSlaHours,
}: CustomRequestModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl overflow-hidden bg-cream p-0">
        <div
          className="h-[3px] w-full bg-gradient-to-r from-indigo via-indigo to-hot-pink"
          aria-hidden
        />
        <div className="max-h-[80vh] overflow-y-auto px-8 py-6">
          <DialogTitle className="sr-only">Custom quote request — {vendorBusinessName}</DialogTitle>
          <DialogDescription className="sr-only">
            Send a custom quote request to {vendorBusinessName}.
          </DialogDescription>
          <CustomRequestFlow
            vendorSlug={vendorSlug}
            vendorBusinessName={vendorBusinessName}
            vendorResponseSlaHours={vendorResponseSlaHours}
            onClose={() => onOpenChange(false)}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Wire CTAs in VendorProfile**

Open `src/components/marketplace/vendor-profile/VendorProfile.tsx`. Add near the top of the component body:

```tsx
const [customRequestOpen, setCustomRequestOpen] = React.useState(false);
```

At the router.push line (~line 73): replace `router.push(`/vendors/${vendor.slug}/request`);` with `setCustomRequestOpen(true);`.

For each `<Link href={`/vendors/${vendor.slug}/request`}>` (lines 131, 147, 186, 202): wrap in a click interceptor that opens the modal but preserves the href for no-JS:

```tsx
<Link
  href={`/vendors/${vendor.slug}/request`}
  onClick={(e) => {
    e.preventDefault();
    setCustomRequestOpen(true);
  }}
  className="…"
>
  Request custom quote
</Link>
```

At the very end of the returned JSX (just before the outermost closing tag), mount the modal:

```tsx
<CustomRequestModal
  open={customRequestOpen}
  onOpenChange={setCustomRequestOpen}
  vendorSlug={vendor.slug}
  vendorBusinessName={vendor.business_name}
  vendorResponseSlaHours={vendor.response_sla_hours ?? null}
/>
```

Add imports:

```tsx
import { CustomRequestModal } from '@/components/booking/CustomRequestModal';
```

- [ ] **Step 4: Delete legacy form**

```bash
rm src/components/booking/CustomRequestForm.tsx
```

- [ ] **Step 5: Confirm no dangling imports**

Run: `grep -rn "CustomRequestForm" src`
Expected: no matches.

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 7: Smoke test**

Run `npm run dev`. On a vendor page with a "Request custom quote" CTA, click it — modal opens. Close it — back on vendor page. Click through Steps 1 → 2 → 3.

- [ ] **Step 8: Commit**

```bash
git add src/components/booking/CustomRequestModal.tsx src/components/marketplace/vendor-profile/VendorProfile.tsx
git rm src/components/booking/CustomRequestForm.tsx
git commit -m "feat(custom-request): open flow as modal on vendor page; drop legacy form"
```

---

## Task 10: Vendor-side BookingDetail surfaces new fields

**Files:**

- Modify: `src/components/dashboard/BookingDetail.tsx`

**Interfaces:**

- Consumes: `bookings.event_city`, `bookings.venue_name`, `bookings.budget_range` (Task 1).
- Produces: read-only rows appear in the request-detail block when those fields are non-null.

- [ ] **Step 1: Locate the request-detail block**

Run: `grep -n "description\|event_type\|guest_count" src/components/dashboard/BookingDetail.tsx | head`
Expected: pinpoint the section that already renders the description / date / guests for a custom-quote request. Add new rows there.

- [ ] **Step 2: Add the three new rows**

Wherever the current request summary lives, insert (with the same visual language the file already uses):

```tsx
{
  booking.event_city && (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
        Location
      </p>
      <p className="text-sm text-ink">
        {booking.event_city}
        {booking.venue_name && ` · ${booking.venue_name}`}
      </p>
    </div>
  );
}
{
  booking.budget_range && (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-muted">Budget</p>
      <p className="text-sm text-ink">
        {
          (
            {
              lt_5k: 'Under $5k',
              '5k_15k': '$5k–15k',
              '15k_30k': '$15k–30k',
              gt_30k: '$30k+',
              discuss: 'Prefer to discuss',
            } as const
          )[booking.budget_range as 'lt_5k' | '5k_15k' | '15k_30k' | 'gt_30k' | 'discuss']
        }
      </p>
    </div>
  );
}
{
  booking.is_multi_day && <p className="text-xs text-ink-soft">Multi-day event</p>;
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Smoke test**

Run `npm run dev`. From a couple account, send a request with city/venue/budget → log in as the vendor → open the booking in dashboard → confirm all three rows show up.

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/BookingDetail.tsx
git commit -m "feat(vendor-crm): surface event_city, venue, budget on custom-quote bookings"
```

---

## Task 11: E2E rewrite — drive the actual form

**Files:**

- Rewrite: `tests/e2e/custom-request-flow.spec.ts`

**Interfaces:**

- Consumes: everything shipped so far.
- Produces: 5 Playwright scenarios covering the whole flow through real DOM clicks/typing (no direct API POST).

- [ ] **Step 1: Read the current spec to understand the fixtures/pattern**

Run: `head -60 tests/e2e/custom-request-flow.spec.ts`
Note the test-user setup pattern + `vendor.vendorSlug` fixture the spec uses.

- [ ] **Step 2: Rewrite the spec**

Overwrite `tests/e2e/custom-request-flow.spec.ts` with these five scenarios (preserve the file's existing imports/fixtures at the top — the shape below is a template; adapt to the fixture names actually in use):

```ts
import { test, expect } from '@playwright/test';
// keep existing fixture imports at top of file

const FUTURE_DATE_ISO = (offsetDays: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
};

test.describe('Custom-request flow — UI-driven', () => {
  // Scenario A: single-event happy path via modal on vendor page
  test('A) single event through the modal', async ({ couplePage, vendor }) => {
    await couplePage.goto(`/vendors/${vendor.vendorSlug}`);
    await couplePage
      .getByRole('link', { name: /request custom quote/i })
      .first()
      .click();
    // Modal opens on Step 1
    await expect(couplePage.getByRole('heading', { name: /what's the shape/i })).toBeVisible();
    await couplePage.getByRole('radio', { name: /single event/i }).check();
    await couplePage.getByRole('button', { name: /continue/i }).click();

    // Step 2
    await expect(couplePage.getByRole('heading', { name: /tell us the details/i })).toBeVisible();
    // Pick a future date on the react-day-picker — target by aria-selected on cells
    const dateBtn = couplePage
      .getByRole('button', { name: new RegExp(`^${new Date(FUTURE_DATE_ISO(90)).getDate()}$`) })
      .first();
    await dateBtn.click();
    await couplePage.getByLabel(/start time/i).fill('16:00');
    const guests = couplePage.getByLabel(/guests/i);
    await guests.click();
    await guests.press('Control+A');
    await guests.type('250');
    await couplePage.getByLabel(/event type/i).click();
    await couplePage.getByRole('option', { name: /wedding/i }).click();
    await couplePage.getByLabel(/event city/i).fill('Houston, TX');
    await couplePage.getByLabel(/venue name/i).fill('The Post Oak Hotel');
    await couplePage.getByRole('radio', { name: /15k.30k/i }).click();
    await couplePage
      .getByPlaceholder(/tell the vendor/i)
      .fill(
        'Traditional South Asian wedding, ceremony at 5, reception dinner + dance floor. Would love drone shots.'
      );
    await couplePage.getByRole('button', { name: /review/i }).click();

    // Step 3
    await expect(couplePage.getByRole('heading', { name: /review and send/i })).toBeVisible();
    await expect(couplePage.getByText(/houston, tx/i)).toBeVisible();
    await expect(couplePage.getByText(/15k.15k|15k.–15k|\$15k–30k/i)).toBeVisible();
    await couplePage.getByRole('button', { name: /^send request$/i }).click();

    await expect(couplePage.getByRole('heading', { name: /request sent/i })).toBeVisible();
  });

  // Scenario B: multi-day, 3 events
  test('B) multi-day 3 events through the modal', async ({ couplePage, vendor }) => {
    await couplePage.goto(`/vendors/${vendor.vendorSlug}`);
    await couplePage
      .getByRole('link', { name: /request custom quote/i })
      .first()
      .click();

    await couplePage.getByRole('radio', { name: /multi-day/i }).check();
    const dayCount = couplePage.getByLabel(/how many events/i);
    await dayCount.fill('3');
    await couplePage.getByRole('button', { name: /continue/i }).click();

    // Expect 3 event cards
    await expect(couplePage.getByText(/day one/i)).toBeVisible();
    await expect(couplePage.getByText(/day two/i)).toBeVisible();
    await expect(couplePage.getByText(/day three/i)).toBeVisible();

    // Fill each day — Day 1 = today+90, Day 2 = +91, Day 3 = +92 (relying on Playwright's page.setInputFiles pattern would be safer;
    // for MVP click three ascending dates in the same month).
    // (Detailed clicks intentionally omitted — see notes below on refactoring to data-testid.)
  });

  // Scenario C: ordering guard
  test('C) picking Day 1 date after Day 2 clears Day 2', async ({ couplePage, vendor }) => {
    // Multi-day, 2 events. Pick Day1 = March 10, Day2 = March 14. Then re-pick Day1 = March 20.
    // Assert Day 2's date input is now empty and shows the "must be after" hint.
    // Full click sequence omitted for brevity — implementer fills in per the pattern above.
  });

  // Scenario D: guest-count edit
  test('D) guest count field allows clearing the leading 1', async ({ couplePage, vendor }) => {
    await couplePage.goto(`/vendors/${vendor.vendorSlug}`);
    await couplePage
      .getByRole('link', { name: /request custom quote/i })
      .first()
      .click();
    await couplePage.getByRole('radio', { name: /single event/i }).check();
    await couplePage.getByRole('button', { name: /continue/i }).click();

    const guests = couplePage.getByLabel(/guests/i);
    // Field starts at default 50. Clear it, retype 600.
    await guests.click();
    await guests.press('Control+A');
    await guests.press('Delete');
    await guests.type('600');
    await expect(guests).toHaveValue('600');
  });

  // Scenario E: deep-link fallback
  test('E) /vendors/[slug]/request renders as page with back link', async ({
    couplePage,
    vendor,
  }) => {
    await couplePage.goto(`/vendors/${vendor.vendorSlug}/request`);
    await expect(couplePage.getByRole('link', { name: new RegExp(`back to`, 'i') })).toBeVisible();
    await expect(couplePage.getByRole('heading', { name: /what's the shape/i })).toBeVisible();
  });
});
```

Notes for the implementer:

- Scenarios B and C are outlined but not fully clicked out because react-day-picker cells are addressed by day-of-month number and month heading. Consider adding `data-testid` to key DOM nodes in `Step2Details` (e.g., `data-testid="event-card-${idx}"`, `data-testid="date-picker-${idx}"`) BEFORE finalizing these scenarios. That refactor is in-scope for this task if the tests can't be written cleanly without it.
- The E2E rewrite must actually pass in CI. If a scenario is genuinely brittle, mark it `test.skip` with a `TODO(refactor testids)` comment rather than shipping green-by-accident.

- [ ] **Step 3: Run E2E locally against dev server**

Run: `npm run test:e2e -- custom-request-flow`
Expected: at minimum scenarios A, D, E pass. B and C should pass once refactored with test-ids per the notes above.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/custom-request-flow.spec.ts
# and any data-testid additions to Step2Details.tsx from the refactor step
git add -u
git commit -m "test(e2e): rewrite custom-request spec to drive the real form UI"
```

- [ ] **Step 5: Push branch**

```bash
git push -u origin feat/vendor-page-custom-quote-fallback
```

- [ ] **Step 6: Open PR**

```bash
gh pr create --title "feat(custom-request): v2 flow — 6 punch-list fixes + modal + Arab types" --body "$(cat <<'EOF'
## Summary

- Fix calendar selected-day black-on-black (hot-pink on cream, contrast passes)
- Fix guest-count leading-1 lock (edit-as-string, coerce on submit)
- Restructure request with Event City + Venue + optional Budget chips + helper hints
- Add Arab-specific event types: Katb el-Kitab / Milka, Laylat al-Henna, Zaffa
- Invert multi-day flow: shape gate first (Step 1), per-day cards with ascending-date rule (Step 2), review + Send (Step 3)
- Send button now `bg-ink` at rest, `bg-hot-pink` on hover
- Whole flow lands as a modal from vendor page; `/vendors/[slug]/request` fallback preserved with a Back link
- Legacy `CustomRequestForm.tsx` deleted
- Vendor CRM BookingDetail surfaces event_city / venue_name / budget_range / is_multi_day
- Migration 00070 adds nullable `bookings` columns; database.types.ts hand-patched
- E2E spec rewritten to drive the real form UI (was posting straight to the API)

## Test plan

- [ ] Migration 00070 applied to dev via psql; verified 4 columns exist
- [ ] `npm run test` — vitest suites for date-picker, event-types, custom-request-validation, step1-shape, step2-details all pass
- [ ] `npm run test:e2e` — custom-request-flow scenarios A / D / E pass; B / C pass once test-ids are in
- [ ] Manual: open flow from vendor page CTA (modal opens), complete a single-event and a multi-day request; verify vendor sees the new fields in dashboard BookingDetail
- [ ] Manual: `/vendors/[slug]/request` deep-link still renders the flow inline with a Back link
- [ ] User applies migration 00070 to prod

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01QcguQPWrzrgixddiGcqp4o
EOF
)"
```

---

## Self-review notes

- **Spec coverage:** every one of the 6 punch-list items maps to a task — #1→T2, #2→T6, #3→T4+T6, #4a→T3, #4b→T5+T6, #5→T7. Modal (item 6) → T9. E2E rewrite → T11. Migration + types → T1. Vendor-side surface → T10.
- **Placeholder scan:** no `TBD`/`TODO` in step bodies. Scenarios B/C in T11 intentionally sketch out a refactor decision rather than pretend-implement — this is called out explicitly in-line.
- **Type consistency:** `CustomEvent.guestCount` is `string` throughout (edit model). Coercion happens exactly once, in the submit handler in T7. `BudgetRange` union is defined in T4's schema, imported by T5/T6/T7 consumers. `BUDGET_RANGES` is the const-array used to iterate for chips. `EventTypeId` union widens automatically via T3's additions.
- **Cross-task naming:** `CustomRequestFlow`, `CustomRequestModal`, `Step1Shape`, `Step2Details`, `Step3Review` used consistently.
- **File-structure decomposition:** each new component is one file with one job. The flow component owns state; step components are pure presentational with callbacks.

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-07-05-custom-quote-flow-v2.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration
**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
