# Bucket A — Vendor Onboarding Wizard + Packages Editor Polish

**Status:** Approved (brainstorm) · awaiting implementation plan
**Date:** 2026-06-18
**Author:** Claude (with Sardar)
**Sequencing:** Bucket A of 5 in the pre-launch redesign sweep (D → **A** → B → E → C). A.1 (wizard) + A.2 (packages editor) bundled into a single bucket per the brainstorm decision.

---

## 1. Why this exists

D.1 shipped on 2026-06-18. The four hand-curated photobooth vendors (Epic Events, PhotoxUSA, GLAMBOT, Chicago Photo Booth Rental — tokens expire 2026-06-23) will start claiming their listings this week. The onboarding wizard is the next critical-path surface: every claimed vendor walks through it before their profile becomes visible on the marketplace.

An audit of the 7-step vendor onboarding wizard (`src/components/onboarding/Step*.tsx`) plus the packages editor (`src/components/forms/PackageAddonsEditor.tsx`, `PackageEditorForm.tsx`) surfaced ten user-flagged rough edges. Bucket A polishes all of them in one cycle so the first cohort's signup experience matches the brand's "premium platform" positioning rather than the "rushed MVP" feel several spots currently have.

The user-flagged punch list:

1. AI bio assist appears broken to vendors and the UX of the button doesn't fit the flow
2. Bio field has a hard 50–500 character constraint that blocks submission
3. Step 2 address is required even for service-area-only vendors (mobile makeup artists, etc.)
4. Photo upload feels invisible; the X button on uploaded photos is misaligned
5. Form errors surface only the first failing field — vendors can't see what else needs fixing
6. The 3% platform fee is never disclosed anywhere in the wizard
7. The Step 7 preview card navigates the vendor to the public profile page with no back-to-wizard affordance
8. Addon price inputs in the packages editor have leading zeros, allow negatives, and arrow keys step by $0.01
9. Package feature image upload has the same visibility + alignment issues as portfolio
10. Form errors don't explain _why_ a step is blocked

Plus one cost-discipline pivot: swap the AI provider from Anthropic Claude Haiku 4.5 to Google Gemini 2.5 Flash-Lite (~10× cheaper at output, comparable quality for short-form bio generation).

---

## 2. Scope (in / out)

### In scope

- AI bio assist provider swap to Google Gemini 2.5 Flash-Lite + lightly retuned prompts
- Bio assist UI overhaul: inline streaming card with Accept/Decline buttons, no navigation away
- Bio textarea: drop the hard 50-char floor; keep 500-char cap; pre-fill from `scraped_vendors.bio` on claim (already works, surface a one-line affordance)
- Step 2 address field becomes optional
- Per-field form errors across all 7 wizard steps via a shared `useFormErrors()` hook
- 3% / 5% platform fee disclosure copy in Step 6 (StepPaymentMode) and Step 7 (StepReview)
- Step 7 preview switches from `<Link>` navigation to full-viewport modal containing the existing `<VendorProfile>` component
- New `FamilyDrawer` primitive ported into the codebase (Vaul-based)
- New `<PhotoUploaderDrawer>` domain wrapper used by both StepPortfolio + PackageEditorForm
- Closed-state thumbnail strip on the wizard step + packages editor showing current photos at a glance
- Primary-photo selection UX via array-position-0 (no schema change)
- Drag-to-reorder via `@dnd-kit/sortable`
- Per-thumbnail upload progress + error states
- New UploadThing endpoint `packageFeatureImage`
- Packages editor addon price input: `step="1"`, `min="0"`, empty-when-zero render, defensive guard in `handlePriceChange`
- Three new Playwright specs: `bucket-a-addon-price`, `bucket-a-photo-uploader`, `bucket-a-form-errors`

### Out of scope (deferred)

- Fresh per-vendor Apify IG fetches at signup time (adds latency + cost; defer indefinitely)
- AI-powered pre-extract of packages from vendor websites (real scraping feature, not polish — its own bucket)
- Vendor reviews tab (known D.1 stub; its own ticket)
- Onboarding observability (Sentry hookup, first-booking alerts) — different concern
- Mobile-specific layout passes for the wizard
- Profile completeness percentage indicator (the existing "Step N of 7" + checkmark side-panel is sufficient)

---

## 3. AI bio assist — Gemini swap + UI overhaul

### 3.1 Provider swap

Replace the existing Anthropic client at `src/lib/ai/anthropic.ts` (or wherever `getAnthropic()` resolves) with a Google AI client. The OpenAI client at `src/lib/ai/openai.ts` (if used) is unaffected.

```ts
// src/lib/ai/google.ts (new)
import { GoogleGenerativeAI } from '@google/generative-ai';

let _client: GoogleGenerativeAI | null = null;

export function getGoogleAI(): GoogleGenerativeAI {
  if (!_client) {
    const key = process.env.GOOGLE_API_KEY;
    if (!key) throw new Error('GOOGLE_API_KEY missing');
    _client = new GoogleGenerativeAI(key);
  }
  return _client;
}

export const BIO_ASSIST_MODEL = 'gemini-2.5-flash-lite';
```

Add to `.env.local` and Vercel production:

```
GOOGLE_API_KEY=<from Google AI Studio>
```

The bio-assist route at `src/app/api/ai/bio-assist/route.ts` switches from `@anthropic-ai/sdk` to `@google/generative-ai`, but the SSE streaming shape is preserved — Gemini supports `streamGenerateContent` which yields chunks compatible with the existing client-side decoder. The route's rate limit check and role check are unchanged.

### 3.2 Prompt retuning

The existing prompts at `src/lib/ai/prompts.ts` (`BIO_DRAFT_SYSTEM`, `BIO_POLISH_SYSTEM`) were written for Claude's conversational tendency. Gemini's default response style is more structured — without retuning, vendors get bulleted lists or rigid templates instead of flowing prose.

Retuning is targeted:

- Append `"Write in 2-3 short conversational sentences. Do NOT use bullets, numbered lists, or headings. Match the natural rhythm of someone introducing themselves at a casual industry event."` to both system prompts
- Lower the system prompt's instruction count overall — Gemini follows fewer-but-stronger instructions better than long checklists

### 3.3 UI overhaul

Replace `src/components/onboarding/BioAssistButton.tsx` with a redesigned inline flow inside `StepBasics.tsx`. The streaming card pattern replaces the current button-that-feels-disconnected pattern.

**Idle state** (button only):

```
┌─ Bio (max 500 chars) ────────────────────────┐
│ [textarea with vendor draft or pre-filled    │
│  IG bio]                                     │
└──────────────────────────────────────────────┘
[ ✨ Polish with AI ]
```

**Smart button label** — based on textarea content:

- Empty or under 20 chars → **"✨ Draft with AI"** (uses `BIO_DRAFT_SYSTEM` prompt + category + business name + scraped IG bio context)
- 20+ chars → **"✨ Polish with AI"** (uses `BIO_POLISH_SYSTEM` prompt + current bio text)

**Streaming state** (button shows loading, suggestion card appears):

```
[ ⋯ Polishing… ]   ← button disabled

┌─ ✨ AI Suggestion ─────────────────────── ✕ ─┐
│ <Gemini's text streams in real-time here>    │
└──────────────────────────────────────────────┘
```

**Complete state** (Accept/Decline buttons fade in):

```
┌─ ✨ AI Suggestion ─────────────────────── ✕ ─┐
│ <full suggested bio>                         │
│                                              │
│ [ Use this ]  [ Keep mine ]                  │
└──────────────────────────────────────────────┘
```

- **"Use this"** (primary, ink bg, cream text) → replaces textarea content with the suggestion
- **"Keep mine"** (secondary, cream bg, ink border) → dismisses the card
- X corner button + ESC → same as "Keep mine"
- After accept or dismiss, the button re-enables — vendor can iterate

### 3.4 Error states

Replace silent failures with explicit card content:

- 429 rate limit → "Bio assistant is busy — try again in a minute."
- 500 API down / missing key → "Bio assistant unavailable. Please write your own for now."
- Empty stream → "No suggestions this time. Try tweaking your draft and retry."

Each error variant still shows the X / "Keep mine" affordance so the vendor isn't stuck.

### 3.5 Bio field constraint relaxation

In `src/lib/onboarding/validation.ts`, the `basicsSchema.bio` field currently enforces `z.string().min(50).max(500)`. Change to `z.string().max(500)` — drop the floor. Render a soft inline hint below the textarea when char count < 50:

> "Bios under 50 chars usually feel rushed. Two or three sentences works well."

The hint doesn't block the Next button. Vendors who insist on a short bio can proceed.

### 3.6 Pre-fill affordance

When a vendor arrives via the claim flow, `promoteScrapedVendor` already writes `scraped_vendors.bio` into `vendor_profiles.bio`. The wizard reads this on Step 1 load. Add a small one-line affordance above the textarea when the bio was pre-filled from the scraped row:

> "Pulled from your Instagram bio — edit or polish below."

Cream bg, ink text, dismissible with a small ✕. State persists per session (dismiss once, gone for the rest of the signup).

---

## 4. Form polish

### 4.1 Address optional (Step 2)

In `src/lib/onboarding/validation.ts:23`, change:

```ts
baseAddressLine1: z.string().min(1, 'Address required'),
```

to:

```ts
baseAddressLine1: z.string().optional(),
```

In `StepLocation.tsx`, add a checkbox below the address input:

```
☐ I don't have a fixed address (I travel to clients)
```

When checked, the address input disables with a "Skipped" muted label. Schema remains optional regardless of checkbox state — the checkbox is a UX affordance, not a data field.

When unchecked and address empty, show a soft hint (not an error):

> "Adding an address helps couples find you in local searches."

The marketplace map view degrades gracefully when address is null — vendor still appears in category lists, just not on the map. Verify `vendor_profiles.base_address_line_1` nullable in DB before merging.

### 4.2 Per-field form errors

Today every step's submit handler calls:

```ts
setError(parsed.error.issues[0].message);
```

This surfaces only the first failing field. Replace with a `fieldErrors` shape derived from `flatten()`:

```ts
const parsed = schema.safeParse(data);
if (!parsed.success) {
  setFieldErrors(parsed.error.flatten().fieldErrors);
  return;
}
```

Each step renders inline error messages immediately below the relevant input:

```tsx
<Input ... />
{fieldErrors.businessName?.[0] && (
  <p className="mt-1 text-xs text-hot-pink">{fieldErrors.businessName[0]}</p>
)}
```

Above the step's content, render a summary count when 2+ errors exist:

> "3 fields need attention"

(Single hot-pink line, no extra chrome — keeps scanner-friendly without screaming.)

Inline errors clear on next keystroke in their field (handled by setting `setFieldErrors(prev => ({ ...prev, fieldName: undefined }))` in each `onChange` handler — or more cleanly via a shared hook).

The shared pattern lives in a small hook at `src/hooks/useFormErrors.ts`:

```ts
export function useFormErrors<T extends z.ZodTypeAny>() {
  const [errors, setErrors] = useState<Record<string, string[] | undefined>>({});

  function applyZodErrors(zodError: z.ZodError) {
    setErrors(zodError.flatten().fieldErrors as Record<string, string[]>);
  }

  function clearField(name: string) {
    setErrors((prev) => ({ ...prev, [name]: undefined }));
  }

  function getError(name: string): string | undefined {
    return errors[name]?.[0];
  }

  const total = Object.values(errors).filter((v) => v && v.length > 0).length;

  return { errors, applyZodErrors, clearField, getError, total };
}
```

Each of the 7 step components imports the hook. The implementation diff per step is small — about 10 lines per file.

### 4.3 3% / 5% fee disclosure (Step 6 + Step 7)

Step 6 (`StepPaymentMode.tsx`) currently says "small platform fee" with no number. Replace with explicit copy:

**"Through Baazar" (Stripe) card:**

> "Couples pay a 10% deposit through Baazar at booking. We keep **3% of the booking total** as our platform fee; you receive the rest. You handle the remaining 90% directly with the couple per your payment terms."

**"Direct payments" (cash) card:**

> "Couples pay a 5% deposit through Baazar at booking. We keep that 5% as our platform fee (slightly higher because we're carrying the booking risk). You handle the remaining 95% directly with the couple."

Both cards get a small "How does this work?" inline expandable explaining the deposit-vs-balance split in plain English. The expandable uses `<details>` with chevron, no JS — simple, accessible.

Step 7 (`StepReview.tsx`) adds a one-line confirmation under the payment mode summary card:

> "Baazar takes 3% (Stripe mode) or 5% (cash mode). Everything else is yours."

### 4.4 Step 7 preview modal

Replace the current `<VendorCard>`-as-Link on `StepReview.tsx` with a `<button>` that opens a full-viewport modal.

Modal content: the existing `<VendorProfile>` component (the same one that renders `/vendors/[slug]`) — 1:1 WYSIWYG.

Modal chrome:

- Thin top banner: cream bg, ink text, hot-pink dot, copy "Preview — not yet published"
- X button top-right (ink, 40×40, no background)
- ESC closes
- Click-outside (backdrop) closes
- Modal scrolls inside its own bounds; wizard form state untouched

Reuses the existing shadcn Dialog primitive (already in the codebase from the D.1 `CounterModal`). No new dependencies.

---

## 5. Photo upload via FamilyDrawer

### 5.1 FamilyDrawer primitive

Port the FamilyDrawer pattern into `src/components/ui/family-drawer/`. The underlying lib is Vaul (`vaul`) plus a custom animation wrapper. One-time setup.

Component exports (matches the example structure):

```
FamilyDrawerRoot
FamilyDrawerTrigger
FamilyDrawerPortal
FamilyDrawerOverlay
FamilyDrawerContent
FamilyDrawerClose
FamilyDrawerHeader
FamilyDrawerButton
FamilyDrawerSecondaryButton
FamilyDrawerAnimatedWrapper
FamilyDrawerAnimatedContent
FamilyDrawerViewContent
useFamilyDrawer (hook)
ViewsRegistry (type)
```

Dependencies to add: `vaul` (production), keep existing `@radix-ui/react-dialog` (vaul reuses Radix primitives internally), plus `@dnd-kit/core` + `@dnd-kit/sortable` for drag-to-reorder.

### 5.2 `<PhotoUploaderDrawer>` domain wrapper

New file: `src/components/ui/PhotoUploaderDrawer.tsx`. Wraps the drawer + UploadThing's `useUploadThing` hook + the thumbnail grid.

**Props (the public contract):**

```ts
interface PhotoUploaderDrawerProps {
  value: string[]; // current image URLs
  onChange: (urls: string[]) => void;
  endpoint: 'portfolioImage' | 'packageFeatureImage';
  maxFiles?: number; // default 10
  maxSizeMb?: number; // default 4
  showPrimarySelector?: boolean; // wizard: true, single-image: false
  triggerLabel?: { empty: string; manage: string };
}
```

### 5.3 Closed state (in the consumer step)

When the drawer is closed, the consumer step renders:

- A horizontal strip showing up to 5 thumbnails + `+N more` badge if total ≥ 6
- A button below the strip:
  - Empty (`value.length === 0`): button reads **"Upload photos"** (with ⬆ icon)
  - Has photos: button reads **"Manage photos (N)"**
- When `showPrimarySelector` is true, the primary thumbnail (`value[0]`) renders a small hot-pink "Primary" pill in its top-left corner — visible without hover

Clicking either the strip or the button opens the drawer.

### 5.4 Drawer views

Two views in the `ViewsRegistry`:

- `default` — empty or "add more" entry point
- `manage` — thumbnail grid with hover overlays

**Default view:**

- Large dashed-border drop zone (cream bg, dashed ink/40 border)
- "⬆ Drop photos here / or click to browse" copy
- "JPG, PNG, or WebP · max 4 MB" hint
- Drag-over state: solid hot-pink border + cream/95 bg + subtle 1.05× scale
- Auto-transitions to `manage` view on first successful upload

**Manage view:**

- Sortable grid of thumbnails (`@dnd-kit/sortable`)
- Per-thumbnail hover overlay: ink/60 semi-transparent overlay fades in with two icon buttons centered — ⭐ (set primary) + ✕ (remove)
- Per-thumbnail drag handle (≡ icon) on the left edge for reorder
- Persistent "Primary" pill (hot-pink) on `value[0]` when `showPrimarySelector` is true
- "+ Add more" button in the top-right of the view (opens file picker directly, no view change)
- "Done" button at the bottom closes the drawer

**Per-file states:**

- Uploading: linear progress bar at the bottom of the thumbnail, image at 60% opacity, no hover interactions
- Failed: red border, tooltip with reason on hover, X button to remove
- Complete: full opacity, all hover interactions enabled

### 5.5 Primary photo via array-position-0

No schema change. `value[0]` is the primary. "Set as primary" reorders the array so the chosen photo lands at index 0:

```ts
function setPrimary(idx: number) {
  if (idx === 0) return;
  const next = [...value];
  const [chosen] = next.splice(idx, 1);
  onChange([chosen, ...next]);
}
```

Couples see `vendor_profiles.portfolio_images[0]` as the card hero on the marketplace — the existing marketplace component already takes the first photo.

### 5.6 New UploadThing endpoint

Add `packageFeatureImage` to `src/app/api/uploadthing/core.ts`:

```ts
packageFeatureImage: f({ image: { maxFileSize: '4MB', maxFileCount: 1 } })
  .middleware(async () => {
    const user = await getCurrentUser();
    if (!user) throw new UploadThingError('Unauthorized');
    return { userId: user.id };
  })
  .onUploadComplete(async () => {
    // no-op; image URL returned to client
  }),
```

Same constraints as `portfolioImage` but capped at 1 file.

### 5.7 Consumer integrations

**`StepPortfolio.tsx`** — replace lines 60-103 with:

```tsx
<PhotoUploaderDrawer
  value={images}
  onChange={setImages}
  endpoint="portfolioImage"
  maxFiles={10}
  showPrimarySelector
  triggerLabel={{ empty: 'Upload portfolio photos', manage: 'Manage photos' }}
/>
```

**`PackageEditorForm.tsx`** — replace existing feature-image input with:

```tsx
<PhotoUploaderDrawer
  value={featureImage ? [featureImage] : []}
  onChange={(urls) => setFeatureImage(urls[0] ?? null)}
  endpoint="packageFeatureImage"
  maxFiles={1}
  triggerLabel={{ empty: 'Upload feature image', manage: 'Change feature image' }}
/>
```

---

## 6. Packages editor — addon price input

`src/components/forms/PackageAddonsEditor.tsx:61-67` — three fixes in 7 lines:

**Replacement input:**

```tsx
<Input
  type="number"
  inputMode="numeric"
  step="1"
  min="0"
  className="w-24"
  value={a.price_delta_cents === 0 ? '' : a.price_delta_cents / 100}
  placeholder="0"
  onChange={(e) => handlePriceChange(i, e.target.value)}
/>
```

**Defensive guard in `handlePriceChange` (lines 31-35):**

```ts
function handlePriceChange(i: number, raw: string) {
  const dollars = parseFloat(raw || '0');
  const safeDollars = isNaN(dollars) || dollars < 0 ? 0 : dollars;
  const cents = Math.round(safeDollars * 100);
  update(addons.map((a, j) => (j === i ? { ...a, price_delta_cents: cents } : a)));
}
```

Three fixes accomplished:

- `step="1"` → arrow keys advance/decrement by $1, not $0.01
- `min="0"` → HTML-level non-negative guard (blocks the spinner)
- `value={... === 0 ? '' : ...}` → empty render when zero (no leading "0")
- `safeDollars` guard → clamps pasted/typed negatives to 0

`inputMode="numeric"` is a mobile bonus — shows the numeric keypad on touch devices.

---

## 7. Playwright coverage

Three new specs under `tests/e2e/`. Each uses the existing `seedVendor` + `loginAs` helpers from `tests/e2e/helpers/`.

### 7.1 `bucket-a-addon-price.spec.ts`

Exercises the addon input fixes:

```ts
test.describe('Bucket A — addon price input', () => {
  test('empty initial state, $1 arrow step, negative clamped to 0', async ({ browser }) => {
    const vendor = await seedVendor({ chargesEnabled: false });
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await loginAs(page, vendor);
    await page.goto('/dashboard/profile/packages/new');
    await page.getByLabel(/Package name/i).fill('Test Package');
    await page.getByRole('button', { name: /add an add-on/i }).click();

    const priceInput = page.getByRole('spinbutton').first();

    // 1. No leading zero
    await expect(priceInput).toHaveValue('');

    // 2. Arrow up advances by $1
    await priceInput.focus();
    await page.keyboard.press('ArrowUp');
    await expect(priceInput).toHaveValue('1');

    // 3. Type negative — clamps to 0 (HTML min=0 + onChange guard)
    await priceInput.fill('-5');
    await priceInput.blur();
    await expect(priceInput).toHaveValue('0');

    // 4. Paste negative — same clamp
    await priceInput.fill('');
    await page.evaluate(() => navigator.clipboard.writeText('-50'));
    await priceInput.focus();
    await page.keyboard.press('Meta+V');
    await priceInput.blur();
    await expect(priceInput).toHaveValue('0');
  });
});
```

### 7.2 `bucket-a-photo-uploader.spec.ts`

Exercises the drawer + thumbnail grid + primary selection. Mocks UploadThing to skip real file storage:

```ts
test.describe('Bucket A — PhotoUploaderDrawer', () => {
  test('closed state, open/close, upload, set primary, remove', async ({ browser }) => {
    const vendor = await seedVendor({ chargesEnabled: false });
    // ... seed minimal portfolio profile, navigate to Step 5

    // Closed state shows "Upload photos" when empty
    await expect(page.getByRole('button', { name: 'Upload photos' })).toBeVisible();

    // Click opens drawer
    await page.getByRole('button', { name: 'Upload photos' }).click();
    await expect(page.getByText(/Drop photos here/i)).toBeVisible();

    // ESC closes
    await page.keyboard.press('Escape');
    await expect(page.getByText(/Drop photos here/i)).toBeHidden();

    // Re-open, upload via direct DB seed (mock UploadThing)
    await page.getByRole('button', { name: 'Upload photos' }).click();
    // ... seed two photo URLs via service-role on the vendor's draft profile, refetch

    // Manage view shows thumbnails + "Primary" pill on first
    await expect(page.locator('[data-testid="photo-thumbnail"]')).toHaveCount(2);
    await expect(page.locator('[data-testid="primary-pill"]')).toHaveCount(1);

    // Hover second thumbnail, click ⭐, primary pill moves
    await page.locator('[data-testid="photo-thumbnail"]').nth(1).hover();
    await page
      .locator('[data-testid="photo-thumbnail"]')
      .nth(1)
      .getByRole('button', { name: /set as primary/i })
      .click();
    await expect(page.locator('[data-testid="photo-thumbnail"]').first()).toContainText('Primary');

    // Remove first photo
    await page.locator('[data-testid="photo-thumbnail"]').first().hover();
    await page
      .locator('[data-testid="photo-thumbnail"]')
      .first()
      .getByRole('button', { name: /remove/i })
      .click();
    await expect(page.locator('[data-testid="photo-thumbnail"]')).toHaveCount(1);

    // Done button closes
    await page.getByRole('button', { name: 'Done' }).click();
    await expect(page.getByText(/Drop photos here/i)).toBeHidden();
  });
});
```

### 7.3 `bucket-a-form-errors.spec.ts`

Exercises per-field error surfacing and address optionality:

```ts
test.describe('Bucket A — form errors + address optional', () => {
  test('Step 1: both bio + business name errors visible simultaneously', async ({ browser }) => {
    // ... seed vendor, navigate to Step 1
    await page.getByRole('button', { name: 'Next' }).click();

    await expect(page.locator('text=/3 fields need attention/i')).toBeVisible();
    await expect(page.getByText(/business name is required/i)).toBeVisible();
    await expect(page.getByText(/category is required/i)).toBeVisible();
    // (no bio error — bio is no longer required, just soft-hinted)
  });

  test('Step 2: address-skip checkbox unblocks Next without filling address', async ({
    browser,
  }) => {
    // ... seed vendor, navigate to Step 2
    await page.getByLabel(/I don't have a fixed address/i).check();
    await page.getByRole('button', { name: 'Next' }).click();
    // Step transitions — no error
    await expect(page.locator('text=/online presence/i')).toBeVisible();
  });

  test('Step 3: empty IG handle shows inline error, website still optional', async ({
    browser,
  }) => {
    // ... seed vendor, navigate to Step 3
    await page.getByRole('button', { name: 'Next' }).click();

    await expect(page.getByText(/instagram handle is required/i)).toBeVisible();
    await expect(page.getByText(/website is required/i)).toBeHidden(); // website not required
  });
});
```

Run command (matches D.1 pattern):

```bash
npx playwright test tests/e2e/bucket-a-*.spec.ts --headed --workers=1
```

---

## 8. New env vars + dependencies

**Env vars (add to `.env.local` + Vercel production):**

- `GOOGLE_API_KEY=<from Google AI Studio>` — used by `src/lib/ai/google.ts`

**Dependencies (npm install):**

- `@google/generative-ai` — Gemini SDK
- `vaul` — drawer primitive
- `@dnd-kit/core` + `@dnd-kit/sortable` — drag-to-reorder

**Dependencies to remove (post-merge cleanup ticket, NOT this bucket):**

- `@anthropic-ai/sdk` — no longer used after the bio assist swap; keep in `package.json` for now in case other AI features come back to Claude. Drop in a future cleanup pass.

---

## 9. Migrations

None. Bucket A is pure application-layer + UX changes. The schema is unchanged.

---

## 10. Estimated effort

5-7 working days, split as:

- Day 1 — Gemini swap (provider + prompts + route) + bio assist UI overhaul
- Day 2 — Form polish: address optional + per-field errors hook + 3% fee disclosure + Step 7 preview modal
- Day 3 — FamilyDrawer primitive port + `<PhotoUploaderDrawer>` build (default + manage views)
- Day 4 — Drag-to-reorder + primary-selection + UploadThing `packageFeatureImage` endpoint + consumer integrations
- Day 5 — Addon price input fixes + bio textarea constraint relaxation + pre-fill affordance + soft hint copy
- Day 6 — Three Playwright specs
- Day 7 — Buffer for UI polish, edge cases surfaced by the specs

Single squash-merge PR.

---

## 11. Success criteria

The bucket is done when:

1. AI bio assist is wired to Gemini and produces conversational bios (no bulleted lists)
2. Bio assist UI is fully inline: button click → suggestion card streams → Use this / Keep mine → no navigation away
3. Bio field accepts strings under 50 chars; the soft hint shows but doesn't block Next
4. Pre-fill affordance shows on the wizard when the vendor arrives via claim
5. Step 2 address is optional; the skip checkbox works; the soft hint shows when address is empty
6. Per-field errors render inline below each input across all 7 steps; summary count shows when 2+ errors
7. Step 6 explicitly states "3% of the booking total" (Stripe mode) and "5% as our platform fee" (cash mode); Step 7 has the one-line confirmation
8. Step 7 preview opens as a modal with the brand banner; ESC + X + backdrop close it
9. Photo upload across both surfaces uses the drawer pattern with two views; closed-state strip shows current portfolio
10. Primary-photo selection works via the ⭐ icon and the persistent pill
11. Drag-to-reorder works across thumbnails
12. Addon price input renders empty when 0, advances by $1 on arrow keys, clamps negatives to 0
13. All three Playwright specs pass headless in CI and headed locally
14. No regressions in the existing wizard tests; `npm run typecheck` clean
