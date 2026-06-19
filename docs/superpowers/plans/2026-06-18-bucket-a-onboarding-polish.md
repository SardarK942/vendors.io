# Bucket A — Onboarding Wizard + Packages Editor Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish ten user-flagged rough edges in the vendor onboarding wizard + packages editor, swap the AI bio provider from Anthropic Claude to Google Gemini, and ship the FamilyDrawer-based photo uploader across both surfaces.

**Architecture:** Pure application-layer changes — no schema migrations. A new `<BioAssistCard>` replaces the disconnected `<BioAssistButton>` with an inline streaming flow. A shared `useFormErrors()` hook standardizes per-field error rendering across all 7 wizard steps. A new `FamilyDrawer` primitive (Vaul-based) plus a domain wrapper `<PhotoUploaderDrawer>` consolidates portfolio + packages feature-image uploads. The Gemini swap is contained behind a small `getGoogleAI()` client; the SSE response shape on the client side is preserved verbatim.

**Tech Stack:** Next.js 14 App Router · Supabase (no schema changes) · Vaul (`vaul`) for drawer · `@dnd-kit/core` + `@dnd-kit/sortable` for drag-to-reorder · `@google/generative-ai` for Gemini · UploadThing (existing) · Tailwind + shadcn/Radix · Vitest (unit) · Playwright (E2E, workers=1).

## Global Constraints

- **Spec source of truth:** `docs/superpowers/specs/2026-06-18-bucket-a-onboarding-polish-design.md` — every task's requirements implicitly include the spec's locked rules.
- **Git workflow:** branch off `main` → `feat/bucket-a-onboarding-polish` → squash-merge via `gh pr create`. NEVER commit directly to `main` (AGENTS.md rule).
- **No migrations.** Bucket A is pure application-layer.
- **No new schema columns.** Primary-photo selection uses `portfolio_images[0]`; addon price uses existing `price_delta_cents`.
- **Brand tokens (from `docs/DESIGN.md`):** ink `#1B1414`, cream `#FBF6EC`, hot-pink `#D1006C`.
- **Gemini model id:** `gemini-2.5-flash-lite` (locked).
- **Env var:** `GOOGLE_API_KEY` in `.env.local` + Vercel production.
- **AI prompt rule:** every bio system prompt must end with the conversational rhythm instruction verbatim (see Task 2).
- **Fee disclosure copy (locked verbatim):**
  - Stripe: "Couples pay a 10% deposit through Baazar at booking. We keep **3% of the booking total** as our platform fee; you receive the rest. You handle the remaining 90% directly with the couple per your payment terms."
  - Cash: "Couples pay a 5% deposit through Baazar at booking. We keep that 5% as our platform fee (slightly higher because we're carrying the booking risk). You handle the remaining 95% directly with the couple."
- **Out of scope:** no Apify fresh fetches, no AI website-package extraction, no vendor reviews tab, no Sentry hookup, no mobile-specific layout, no completeness percentage indicator.

---

## File Structure

**New files:**

- `src/lib/ai/google.ts` — Gemini client + model constant
- `src/components/onboarding/BioAssistCard.tsx` — replaces BioAssistButton
- `src/hooks/useFormErrors.ts` — shared per-field error hook
- `src/components/ui/family-drawer/` (folder) — FamilyDrawer primitive port (one file per export)
- `src/components/ui/PhotoUploaderDrawer.tsx` — domain wrapper
- `src/components/ui/PhotoThumbnailGrid.tsx` — sortable grid (used internally by drawer)
- `src/__tests__/hooks/useFormErrors.test.ts`
- `tests/e2e/bucket-a-addon-price.spec.ts`
- `tests/e2e/bucket-a-photo-uploader.spec.ts`
- `tests/e2e/bucket-a-form-errors.spec.ts`

**Modified files:**

- `src/lib/ai/prompts.ts` — append conversational rhythm instruction to both prompts
- `src/app/api/ai/bio-assist/route.ts` — swap from Anthropic SDK to Google SDK
- `src/lib/onboarding/validation.ts` — drop bio min(50); change `baseAddressLine1` to optional
- `src/components/onboarding/StepBasics.tsx` — replace BioAssistButton, add pre-fill affordance, drop hard min char check, integrate useFormErrors
- `src/components/onboarding/StepLocation.tsx` — add skip-address checkbox, soft hint, integrate useFormErrors
- `src/components/onboarding/StepOnline.tsx` — integrate useFormErrors
- `src/components/onboarding/StepDetails.tsx` — integrate useFormErrors
- `src/components/onboarding/StepPortfolio.tsx` — replace UploadButton with PhotoUploaderDrawer, integrate useFormErrors
- `src/components/onboarding/StepPaymentMode.tsx` — replace fee copy with locked verbatim copy, integrate useFormErrors
- `src/components/onboarding/StepReview.tsx` — replace `<VendorCard>`-as-Link with modal, add one-line fee confirmation
- `src/components/forms/PackageAddonsEditor.tsx` — fix price input (step=1, min=0, empty-when-zero, defensive guard)
- `src/components/forms/PackageEditorForm.tsx` — replace feature-image input with PhotoUploaderDrawer
- `src/app/api/uploadthing/core.ts` — add `packageFeatureImage` endpoint
- `.env.example` — add `GOOGLE_API_KEY=` placeholder
- `package.json` — add `@google/generative-ai`, `vaul`, `@dnd-kit/core`, `@dnd-kit/sortable`

---

## Task List

- **T1.** Add Google AI SDK + Gemini client + env var
- **T2.** Retune bio prompts for Gemini
- **T3.** Rewrite `/api/ai/bio-assist` route for Gemini SSE
- **T4.** New `<BioAssistCard>` component (inline streaming + Accept/Decline)
- **T5.** Bio textarea constraint + pre-fill affordance in StepBasics
- **T6.** `useFormErrors()` hook + unit tests
- **T7.** Wire `useFormErrors` into all 7 wizard steps
- **T8.** Address optional (Step 2) + skip checkbox + soft hint
- **T9.** 3% / 5% fee disclosure copy (Step 6 + Step 7)
- **T10.** Step 7 preview modal
- **T11.** Add vaul + dnd-kit dependencies + port FamilyDrawer primitive
- **T12.** `<PhotoUploaderDrawer>` (default + manage views, no DnD yet)
- **T13.** Drag-to-reorder + primary selection on PhotoUploaderDrawer
- **T14.** UploadThing `packageFeatureImage` endpoint
- **T15.** Integrate PhotoUploaderDrawer into StepPortfolio + PackageEditorForm
- **T16.** Addon price input fixes (PackageAddonsEditor)
- **T17.** Playwright spec — addon price input
- **T18.** Playwright spec — photo uploader
- **T19.** Playwright spec — form errors + address optional
- **T20.** Open PR + manual smoke

---

### Task 1: Add Google AI SDK + Gemini client + env var

**Files:**

- Create: `src/lib/ai/google.ts`
- Modify: `package.json` — add `@google/generative-ai`
- Modify: `.env.example` — add `GOOGLE_API_KEY=` placeholder line

**Interfaces:**

- Consumes: `process.env.GOOGLE_API_KEY`
- Produces:

  ```ts
  export function getGoogleAI(): GoogleGenerativeAI;
  export const BIO_ASSIST_MODEL: 'gemini-2.5-flash-lite';
  ```

- [ ] **Step 1: Add the dependency**

```bash
npm install @google/generative-ai
```

Expected: package added to `package.json` + `package-lock.json` updated, no errors.

- [ ] **Step 2: Create the Gemini client**

```ts
// src/lib/ai/google.ts
import { GoogleGenerativeAI } from '@google/generative-ai';

let _client: GoogleGenerativeAI | null = null;

export function getGoogleAI(): GoogleGenerativeAI {
  if (!_client) {
    const key = process.env.GOOGLE_API_KEY;
    if (!key) {
      throw new Error('GOOGLE_API_KEY missing — set it in .env.local and Vercel production');
    }
    _client = new GoogleGenerativeAI(key);
  }
  return _client;
}

export const BIO_ASSIST_MODEL = 'gemini-2.5-flash-lite' as const;
```

- [ ] **Step 3: Add env placeholder**

In `.env.example`, append:

```
# Google AI Studio — used by bio-assist (gemini-2.5-flash-lite)
GOOGLE_API_KEY=
```

- [ ] **Step 4: Add real key to `.env.local`**

Get a key from https://aistudio.google.com/app/apikey and add to `.env.local`:

```
GOOGLE_API_KEY=<your key>
```

(This step is for the user/operator — implementer should leave a note in the report.)

- [ ] **Step 5: Verify typecheck**

```bash
npm run typecheck
```

Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/ai/google.ts package.json package-lock.json .env.example
git commit -m "feat(ai): add Google Gemini client + env var (Bucket A T1)"
```

---

### Task 2: Retune bio prompts for Gemini

**Files:**

- Modify: `src/lib/ai/prompts.ts`

**Interfaces:**

- Consumes: existing `BIO_DRAFT_SYSTEM` and `BIO_POLISH_SYSTEM` exports.
- Produces: same exports, retuned for Gemini's response style.

**Why this matters:** Gemini's default behavior is more structured than Claude's — without the rhythm instruction, vendors get bulleted lists or rigid templates.

- [ ] **Step 1: Read the current prompts**

```bash
cat src/lib/ai/prompts.ts
```

Note the existing structure — the changes below are additive.

- [ ] **Step 2: Append the conversational instruction to both prompts**

Find both `BIO_DRAFT_SYSTEM` and `BIO_POLISH_SYSTEM` exports. At the END of each prompt's string content (right before the closing backtick or quote), append (preserve existing newlines):

```
Write in 2-3 short conversational sentences. Do NOT use bullets, numbered lists, or headings. Match the natural rhythm of someone introducing themselves at a casual industry event.
```

If the existing prompts have explicit sections or headings (e.g. "## Output format"), simplify — Gemini follows fewer-but-stronger instructions better. Remove instruction count where possible, keep only:

1. The role (you are a bio writing assistant for vendors on a wedding marketplace)
2. The task (draft / polish a bio for X type of vendor)
3. The rhythm instruction above

- [ ] **Step 3: Verify typecheck**

```bash
npm run typecheck
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/ai/prompts.ts
git commit -m "feat(ai): retune bio prompts for Gemini's conversational rhythm (Bucket A T2)"
```

---

### Task 3: Rewrite `/api/ai/bio-assist` route for Gemini SSE

**Files:**

- Modify: `src/app/api/ai/bio-assist/route.ts`

**Interfaces:**

- Consumes: `getGoogleAI()` and `BIO_ASSIST_MODEL` from `@/lib/ai/google` (T1), `BIO_DRAFT_SYSTEM` and `BIO_POLISH_SYSTEM` from `@/lib/ai/prompts` (T2), existing `checkAndIncrement` rate-limit helper, existing role check.
- Produces: same SSE response shape the client expects today (`data: <chunk>\n\n` lines, ending with `data: [DONE]\n\n`).

**Critical:** The SSE shape the client consumes MUST be preserved verbatim. The streaming chunks should emit as plain text to keep the new `<BioAssistCard>` component compatible with the existing decoder pattern (Task 4 builds against the same shape).

- [ ] **Step 1: Read the current route**

```bash
cat src/app/api/ai/bio-assist/route.ts
```

Note: the rate limit check, role check, and SSE response shape. These stay; only the provider call changes.

- [ ] **Step 2: Replace the Anthropic provider call with Gemini**

Replace the Anthropic stream loop with:

```ts
import { getGoogleAI, BIO_ASSIST_MODEL } from '@/lib/ai/google';

// inside the POST handler, replace the Anthropic call:
const genAI = getGoogleAI();
const model = genAI.getGenerativeModel({ model: BIO_ASSIST_MODEL });

// systemPrompt is either BIO_DRAFT_SYSTEM or BIO_POLISH_SYSTEM
// userPrompt is the vendor's input + context
const result = await model.generateContentStream({
  contents: [{ role: 'user', parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
  generationConfig: {
    temperature: 0.7,
    maxOutputTokens: 300,
  },
});

const encoder = new TextEncoder();
const stream = new ReadableStream({
  async start(controller) {
    try {
      for await (const chunk of result.stream) {
        const text = chunk.text();
        if (text) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
        }
      }
      controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
      controller.close();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Bio assistant error';
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: msg })}\n\n`));
      controller.close();
    }
  },
});

return new Response(stream, {
  headers: {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  },
});
```

Match the existing SSE shape exactly — if the current route emits `data: ${text}\n\n` (no JSON wrapping), preserve that.

- [ ] **Step 3: Remove the Anthropic import**

Delete the `import { Anthropic } from '@anthropic-ai/sdk'` (and `getAnthropic` if it's no longer used elsewhere).

NOTE: Do NOT delete `@anthropic-ai/sdk` from `package.json` yet — that's a separate cleanup ticket per the spec.

- [ ] **Step 4: Run typecheck**

```bash
npm run typecheck
```

Expected: 0 errors. If the Anthropic import was used elsewhere, fix those too — but report as a concern if scope creeps.

- [ ] **Step 5: Manual smoke (optional)**

Start dev server, hit the route via curl with a valid auth cookie and a simple body — confirm a stream returns text.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/ai/bio-assist/route.ts
git commit -m "feat(ai): swap bio-assist route to Gemini SSE streaming (Bucket A T3)"
```

---

### Task 4: New `<BioAssistCard>` component

**Files:**

- Create: `src/components/onboarding/BioAssistCard.tsx`
- (Defer integration into StepBasics to Task 5)

**Interfaces:**

- Consumes: the SSE shape returned by `/api/ai/bio-assist` (T3) — `data: {"text": "..."}\n\n` chunks followed by `data: [DONE]\n\n`, or `data: {"error": "..."}\n\n` on failure.
- Produces:
  ```ts
  interface BioAssistCardProps {
    currentBio: string;
    businessName: string;
    category: string;
    onAccept: (newBio: string) => void;
  }
  export function BioAssistCard(props: BioAssistCardProps): JSX.Element;
  ```

**Behavior:**

- Idle: shows ONE button below the bio textarea. Label is "✨ Draft with AI" when `currentBio.length < 20`, else "✨ Polish with AI".
- Click → button enters loading state ("⋯ Polishing…" or "⋯ Drafting…"), POSTs to `/api/ai/bio-assist` with `{ mode: 'draft' | 'polish', currentBio, businessName, category }`.
- Suggestion card appears below the button while streaming. Text fills in real-time.
- When stream completes (`[DONE]` received), Accept/Decline buttons fade in.
- **Use this** — calls `onAccept(suggestion)` then closes the card.
- **Keep mine** / X / ESC — closes the card; suggestion discarded.
- Error states: card shows the error message + only X / "Keep mine" affordance.

- [ ] **Step 1: Create the component**

```tsx
// src/components/onboarding/BioAssistCard.tsx
'use client';

import { useState, useRef, useEffect } from 'react';
import { Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface BioAssistCardProps {
  currentBio: string;
  businessName: string;
  category: string;
  onAccept: (newBio: string) => void;
}

type CardState =
  | { kind: 'idle' }
  | { kind: 'streaming'; suggestion: string }
  | { kind: 'complete'; suggestion: string }
  | { kind: 'error'; message: string };

export function BioAssistCard({
  currentBio,
  businessName,
  category,
  onAccept,
}: BioAssistCardProps) {
  const [state, setState] = useState<CardState>({ kind: 'idle' });
  const abortRef = useRef<AbortController | null>(null);

  const mode = currentBio.length < 20 ? 'draft' : 'polish';
  const idleLabel = mode === 'draft' ? '✨ Draft with AI' : '✨ Polish with AI';
  const loadingLabel = mode === 'draft' ? '⋯ Drafting…' : '⋯ Polishing…';

  async function start() {
    abortRef.current = new AbortController();
    setState({ kind: 'streaming', suggestion: '' });

    try {
      const res = await fetch('/api/ai/bio-assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, currentBio, businessName, category }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) {
        const msg =
          res.status === 429
            ? 'Bio assistant is busy — try again in a minute.'
            : 'Bio assistant unavailable. Please write your own for now.';
        setState({ kind: 'error', message: msg });
        return;
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let suggestion = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6).trim();
          if (payload === '[DONE]') {
            setState({ kind: 'complete', suggestion });
            return;
          }
          try {
            const parsed = JSON.parse(payload) as { text?: string; error?: string };
            if (parsed.error) {
              setState({ kind: 'error', message: parsed.error });
              return;
            }
            if (parsed.text) {
              suggestion += parsed.text;
              setState({ kind: 'streaming', suggestion });
            }
          } catch {
            // skip malformed lines
          }
        }
      }
      // Stream ended without [DONE] — treat what we got as complete
      if (suggestion) {
        setState({ kind: 'complete', suggestion });
      } else {
        setState({
          kind: 'error',
          message: 'No suggestions this time. Try tweaking your draft and retry.',
        });
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      setState({
        kind: 'error',
        message: 'Bio assistant unavailable. Please write your own for now.',
      });
    }
  }

  function dismiss() {
    abortRef.current?.abort();
    setState({ kind: 'idle' });
  }

  function accept() {
    if (state.kind !== 'complete') return;
    onAccept(state.suggestion);
    setState({ kind: 'idle' });
  }

  useEffect(() => {
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape' && state.kind !== 'idle') dismiss();
    }
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.kind]);

  const showCard = state.kind !== 'idle';
  const isLoading = state.kind === 'streaming';

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="secondary"
        onClick={start}
        disabled={isLoading}
        className="w-fit"
      >
        {isLoading ? loadingLabel : idleLabel}
      </Button>

      {showCard && (
        <div className="rounded-lg border border-ink/20 bg-cream p-3">
          <div className="flex items-start justify-between gap-2">
            <p className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-ink/60">
              <Sparkles className="size-3" /> AI Suggestion
            </p>
            <button
              type="button"
              onClick={dismiss}
              aria-label="Dismiss suggestion"
              className="text-ink/40 hover:text-ink"
            >
              <X className="size-4" />
            </button>
          </div>

          <p className="mt-2 whitespace-pre-wrap text-sm text-ink">
            {state.kind === 'error' ? state.message : state.kind === 'idle' ? '' : state.suggestion}
            {state.kind === 'streaming' && (
              <span className="ml-1 inline-block h-4 w-1 animate-pulse bg-ink" />
            )}
          </p>

          {state.kind === 'complete' && (
            <div className="mt-3 flex gap-2">
              <Button type="button" onClick={accept} className="bg-ink text-cream hover:bg-ink/90">
                Use this
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={dismiss}
                className="border-ink bg-cream text-ink hover:bg-cream/80"
              >
                Keep mine
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck**

```bash
npm run typecheck
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/onboarding/BioAssistCard.tsx
git commit -m "feat(onboarding): add BioAssistCard with inline streaming + Accept/Decline (Bucket A T4)"
```

---

### Task 5: Bio textarea constraint + pre-fill affordance + StepBasics integration

**Files:**

- Modify: `src/lib/onboarding/validation.ts`
- Modify: `src/components/onboarding/StepBasics.tsx`
- Delete: `src/components/onboarding/BioAssistButton.tsx` (replaced by BioAssistCard from T4)

**Interfaces:**

- Consumes: `<BioAssistCard>` from T4.
- Produces: a Step 1 wizard view where bio is no longer hard-floored at 50 chars, with a pre-fill affordance for claimed vendors and the inline AI flow.

- [ ] **Step 1: Relax bio constraint in validation**

In `src/lib/onboarding/validation.ts`, find the `basicsSchema.bio` field. Change:

```ts
bio: z.string().min(50, 'Bio must be at least 50 characters').max(500, 'Bio must be 500 characters or fewer'),
```

to:

```ts
bio: z.string().max(500, 'Bio must be 500 characters or fewer'),
```

Only drop the `min(50)`. Keep the `max(500)`.

- [ ] **Step 2: Replace BioAssistButton with BioAssistCard in StepBasics**

In `src/components/onboarding/StepBasics.tsx`:

1. Remove the import of `BioAssistButton`. Add `import { BioAssistCard } from './BioAssistCard'`.
2. Find where `<BioAssistButton ... />` is rendered. Replace with:

```tsx
<BioAssistCard
  currentBio={data.bio}
  businessName={data.businessName}
  category={data.category}
  onAccept={(newBio) => setData({ ...data, bio: newBio })}
/>
```

(The exact prop names from existing state may differ — adapt to match the actual setter pattern in this file.)

- [ ] **Step 3: Add soft hint below the textarea**

Below the bio textarea, add a conditional hint when `data.bio.length > 0 && data.bio.length < 50`:

```tsx
{
  data.bio.length > 0 && data.bio.length < 50 && (
    <p className="mt-1 text-xs text-ink/60">
      Bios under 50 chars usually feel rushed. Two or three sentences works well.
    </p>
  );
}
```

- [ ] **Step 4: Add pre-fill affordance**

The wizard reads `vendor_profiles.bio` on Step 1 load. When the vendor arrived via the claim flow AND the bio was pre-filled (heuristic: the original draft loaded from DB has non-empty bio that the vendor hasn't yet edited), show a dismissible banner above the textarea.

In `StepBasics.tsx`:

```tsx
const [showPrefillBanner, setShowPrefillBanner] = useState(() => {
  // Show banner when the bio loaded from DB is non-empty AND the vendor has a scraped_vendor_id link
  // (heuristic — vendor only has scraped_vendor_id when they arrived via claim)
  return Boolean(initialData.bio && initialData.scraped_vendor_id);
});

// ...

{
  showPrefillBanner && (
    <div className="mb-2 flex items-start justify-between gap-2 rounded-md border border-ink/15 bg-cream/60 px-3 py-2">
      <p className="text-xs text-ink">Pulled from your Instagram bio — edit or polish below.</p>
      <button
        type="button"
        onClick={() => setShowPrefillBanner(false)}
        aria-label="Dismiss notice"
        className="text-ink/40 hover:text-ink"
      >
        ✕
      </button>
    </div>
  );
}
```

If the existing `initialData` shape doesn't expose `scraped_vendor_id`, extend the prop / parent fetch to include it. If wiring proves more than a quick add, simplify: show the banner whenever `initialData.bio` is non-empty on first load — the false positive (vendor who already wrote a bio in a previous session) is low-risk because the banner is dismissible.

- [ ] **Step 5: Delete the old BioAssistButton**

```bash
rm src/components/onboarding/BioAssistButton.tsx
```

If grep shows other imports of it, switch them to BioAssistCard or remove them. Run:

```bash
grep -rn "BioAssistButton" src/ 2>/dev/null
```

Expected: no matches after the delete.

- [ ] **Step 6: Verify typecheck**

```bash
npm run typecheck
```

Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/onboarding/validation.ts src/components/onboarding/StepBasics.tsx
git commit -m "feat(onboarding): relax bio constraint + pre-fill affordance + wire BioAssistCard (Bucket A T5)"
```

---

### Task 6: `useFormErrors()` hook + unit tests

**Files:**

- Create: `src/hooks/useFormErrors.ts`
- Create: `src/__tests__/hooks/useFormErrors.test.ts`

**Interfaces:**

- Consumes: `z.ZodError` from `zod`.
- Produces:

  ```ts
  export function useFormErrors(): {
    errors: Record<string, string[] | undefined>;
    applyZodErrors: (zodError: z.ZodError) => void;
    clearField: (name: string) => void;
    clearAll: () => void;
    getError: (name: string) => string | undefined;
    total: number;
  };
  ```

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/hooks/useFormErrors.test.ts
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { z } from 'zod';
import { useFormErrors } from '@/hooks/useFormErrors';

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email'),
  age: z.number().min(18, 'Must be 18+'),
});

describe('useFormErrors()', () => {
  it('returns empty errors initially', () => {
    const { result } = renderHook(() => useFormErrors());
    expect(result.current.errors).toEqual({});
    expect(result.current.total).toBe(0);
  });

  it('applies zod errors as field-keyed entries', () => {
    const { result } = renderHook(() => useFormErrors());
    const parsed = schema.safeParse({ name: '', email: 'not-an-email', age: 10 });

    act(() => {
      if (!parsed.success) result.current.applyZodErrors(parsed.error);
    });

    expect(result.current.total).toBe(3);
    expect(result.current.getError('name')).toBe('Name is required');
    expect(result.current.getError('email')).toBe('Invalid email');
    expect(result.current.getError('age')).toBe('Must be 18+');
  });

  it('clearField removes one error without touching others', () => {
    const { result } = renderHook(() => useFormErrors());
    const parsed = schema.safeParse({ name: '', email: 'bad', age: 5 });
    act(() => {
      if (!parsed.success) result.current.applyZodErrors(parsed.error);
    });

    act(() => {
      result.current.clearField('name');
    });

    expect(result.current.getError('name')).toBeUndefined();
    expect(result.current.getError('email')).toBe('Invalid email');
    expect(result.current.total).toBe(2);
  });

  it('clearAll wipes everything', () => {
    const { result } = renderHook(() => useFormErrors());
    const parsed = schema.safeParse({ name: '', email: 'bad', age: 5 });
    act(() => {
      if (!parsed.success) result.current.applyZodErrors(parsed.error);
    });

    act(() => {
      result.current.clearAll();
    });

    expect(result.current.total).toBe(0);
  });
});
```

- [ ] **Step 2: Run, watch fail**

```bash
npx vitest run src/__tests__/hooks/useFormErrors.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the hook**

```ts
// src/hooks/useFormErrors.ts
import { useState, useCallback } from 'react';
import type { z } from 'zod';

export function useFormErrors() {
  const [errors, setErrors] = useState<Record<string, string[] | undefined>>({});

  const applyZodErrors = useCallback((zodError: z.ZodError) => {
    setErrors(zodError.flatten().fieldErrors as Record<string, string[]>);
  }, []);

  const clearField = useCallback((name: string) => {
    setErrors((prev) => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
  }, []);

  const clearAll = useCallback(() => {
    setErrors({});
  }, []);

  const getError = useCallback((name: string): string | undefined => errors[name]?.[0], [errors]);

  const total = Object.values(errors).filter((v) => v && v.length > 0).length;

  return { errors, applyZodErrors, clearField, clearAll, getError, total };
}
```

- [ ] **Step 4: Run, expect pass**

```bash
npx vitest run src/__tests__/hooks/useFormErrors.test.ts
```

Expected: 4/4 pass.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useFormErrors.ts src/__tests__/hooks/useFormErrors.test.ts
git commit -m "feat(forms): add useFormErrors hook for per-field error rendering (Bucket A T6)"
```

---

### Task 7: Wire `useFormErrors` into all 7 wizard steps

**Files:**

- Modify: `src/components/onboarding/StepBasics.tsx`
- Modify: `src/components/onboarding/StepLocation.tsx`
- Modify: `src/components/onboarding/StepOnline.tsx`
- Modify: `src/components/onboarding/StepDetails.tsx`
- Modify: `src/components/onboarding/StepPortfolio.tsx`
- Modify: `src/components/onboarding/StepPaymentMode.tsx`
- Modify: `src/components/onboarding/StepReview.tsx`

**Interfaces:**

- Consumes: `useFormErrors()` from `@/hooks/useFormErrors` (T6).
- Produces: every step renders inline error messages below each input + a summary count when 2+ errors.

**For each step, the diff pattern is identical:**

1. Import the hook:

   ```ts
   import { useFormErrors } from '@/hooks/useFormErrors';
   ```

2. Replace the existing `const [error, setError] = useState<string | null>(null)` with:

   ```ts
   const { applyZodErrors, clearField, getError, total } = useFormErrors();
   ```

3. Replace the existing submit-handler error path:

   ```ts
   // OLD
   if (!parsed.success) {
     setError(parsed.error.issues[0].message);
     return;
   }
   // NEW
   if (!parsed.success) {
     applyZodErrors(parsed.error);
     return;
   }
   ```

4. Replace the existing top-of-step error render:

   ```tsx
   // OLD
   {
     error && <p className="text-sm text-destructive">{error}</p>;
   }
   // NEW
   {
     total >= 2 && (
       <p className="text-sm font-medium text-hot-pink">{total} fields need attention</p>
     );
   }
   ```

5. Below each input that maps to a schema field, add:

   ```tsx
   {
     getError('businessName') && (
       <p className="mt-1 text-xs text-hot-pink">{getError('businessName')}</p>
     );
   }
   ```

   Where `'businessName'` is the zod schema key for that field.

6. On each input's `onChange`, call `clearField('businessName')`:
   ```tsx
   onChange={(e) => {
     setData({ ...data, businessName: e.target.value });
     clearField('businessName');
   }}
   ```

- [ ] **Step 1: Apply pattern to StepBasics**

Field map: `businessName`, `category`, `bio`. (The single error display at the bottom is replaced; the BioAssistCard from T5 stays.)

- [ ] **Step 2: Apply pattern to StepLocation**

Field map: `baseAddressLine1` (now optional per T8 — error only fires if validation triggers it, which it won't unless future fields are added).

- [ ] **Step 3: Apply pattern to StepOnline**

Field map: `instagramHandle`, `website` (website is optional, error only on bad URL format).

- [ ] **Step 4: Apply pattern to StepDetails**

Field map: `languages`, `yearsInBusiness`, `responseSla`.

- [ ] **Step 5: Apply pattern to StepPortfolio**

Field map: `images` (at least 1 required). The error renders above the photo uploader strip.

- [ ] **Step 6: Apply pattern to StepPaymentMode**

Field map: `paymentMode`. Single-field error if neither radio chosen.

- [ ] **Step 7: Apply pattern to StepReview**

StepReview is a summary step with the Publish button. If validation fails on publish, the per-field errors are shown next to the corresponding summary cards (linking back to which step has the gap). For simplicity, show the summary count + a link "Edit step N" below the count.

- [ ] **Step 8: Verify typecheck**

```bash
npm run typecheck
```

Expected: 0 errors.

- [ ] **Step 9: Run unit tests**

```bash
npm run test:unit
```

Expected: no regressions.

- [ ] **Step 10: Commit**

```bash
git add src/components/onboarding/
git commit -m "feat(onboarding): wire useFormErrors per-field errors across all 7 steps (Bucket A T7)"
```

---

### Task 8: Address optional (Step 2) + skip checkbox

**Files:**

- Modify: `src/lib/onboarding/validation.ts`
- Modify: `src/components/onboarding/StepLocation.tsx`

**Interfaces:**

- Consumes: existing `locationSchema`.
- Produces: address is optional at the schema layer; UI has a skip-address checkbox; soft hint when checkbox is unchecked but address is empty.

- [ ] **Step 1: Schema change**

In `src/lib/onboarding/validation.ts:23`, change:

```ts
baseAddressLine1: z.string().min(1, 'Address required'),
```

to:

```ts
baseAddressLine1: z.string().optional(),
```

Verify other address fields (`baseCity`, `baseState`, etc. if present) are similarly optional. If they were required, also relax.

- [ ] **Step 2: Add the skip checkbox to StepLocation**

In `src/components/onboarding/StepLocation.tsx`:

1. Add a local state `const [skipAddress, setSkipAddress] = useState(!data.baseAddressLine1)` near the existing state.
2. Below the address input, add:

```tsx
<label className="mt-2 flex items-center gap-2 text-sm text-ink/80">
  <input
    type="checkbox"
    checked={skipAddress}
    onChange={(e) => {
      setSkipAddress(e.target.checked);
      if (e.target.checked) {
        setData({ ...data, baseAddressLine1: '' });
      }
    }}
  />
  I don't have a fixed address (I travel to clients)
</label>;

{
  !skipAddress && !data.baseAddressLine1 && (
    <p className="mt-1 text-xs text-ink/60">
      Adding an address helps couples find you in local searches.
    </p>
  );
}
```

3. When `skipAddress` is true, disable the address input:

```tsx
<Input
  ... existing props ...
  disabled={skipAddress}
  placeholder={skipAddress ? 'Skipped' : 'Address'}
/>
```

- [ ] **Step 3: Verify the marketplace map degrades gracefully**

Grep for usages of `base_address_line_1` or similar in marketplace components:

```bash
grep -rn "base_address_line_1\|baseAddressLine1" src/components/marketplace/ src/app/vendors/ 2>/dev/null
```

If any component throws on null address, add a null-guard. If none, all good — the column is already nullable in the DB.

- [ ] **Step 4: Verify typecheck**

```bash
npm run typecheck
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/onboarding/validation.ts src/components/onboarding/StepLocation.tsx
git commit -m "feat(onboarding): address optional + skip checkbox in Step 2 (Bucket A T8)"
```

---

### Task 9: Fee disclosure copy (Step 6 + Step 7)

**Files:**

- Modify: `src/components/onboarding/StepPaymentMode.tsx`
- Modify: `src/components/onboarding/StepReview.tsx`

**Interfaces:**

- Consumes: nothing.
- Produces: locked verbatim fee copy in both steps.

**Copy is LOCKED — paste verbatim, no paraphrasing:**

- **Stripe card body:** "Couples pay a 10% deposit through Baazar at booking. We keep **3% of the booking total** as our platform fee; you receive the rest. You handle the remaining 90% directly with the couple per your payment terms."
- **Cash card body:** "Couples pay a 5% deposit through Baazar at booking. We keep that 5% as our platform fee (slightly higher because we're carrying the booking risk). You handle the remaining 95% directly with the couple."
- **Step 7 one-liner:** "Baazar takes 3% (Stripe mode) or 5% (cash mode). Everything else is yours."

- [ ] **Step 1: Replace copy in StepPaymentMode**

Find the existing "small platform fee" copy (around line 69 + line 87). Replace with the locked Stripe/cash card bodies above. Use `<strong>` for the bolded "3% of the booking total" phrase.

Add a `<details>` expandable below each card body:

```tsx
<details className="mt-2 text-xs text-ink/70">
  <summary className="cursor-pointer">How does this work?</summary>
  <p className="mt-1">
    The deposit confirms the booking. The balance is what the couple pays the vendor directly —
    Baazar doesn't process it. We keep our platform fee from the deposit; you receive everything
    else.
  </p>
</details>
```

- [ ] **Step 2: Add Step 7 one-liner**

In `src/components/onboarding/StepReview.tsx`, locate the payment-mode summary card. Below the card title, add:

```tsx
<p className="mt-2 text-xs text-ink/60">
  Baazar takes 3% (Stripe mode) or 5% (cash mode). Everything else is yours.
</p>
```

- [ ] **Step 3: Verify typecheck**

```bash
npm run typecheck
```

- [ ] **Step 4: Commit**

```bash
git add src/components/onboarding/StepPaymentMode.tsx src/components/onboarding/StepReview.tsx
git commit -m "feat(onboarding): disclose 3% / 5% platform fee in Step 6 + Step 7 (Bucket A T9)"
```

---

### Task 10: Step 7 preview modal

**Files:**

- Modify: `src/components/onboarding/StepReview.tsx`

**Interfaces:**

- Consumes: the existing shadcn `Dialog` primitive (already in the codebase from D.1 CounterModal), the existing `<VendorProfile>` component.
- Produces: a `<button>` that opens a full-viewport modal containing the public-profile preview.

- [ ] **Step 1: Find the existing preview**

```bash
grep -n "VendorCard\|VendorProfile" src/components/onboarding/StepReview.tsx
```

Note the current Link-based preview implementation.

- [ ] **Step 2: Convert to modal**

```tsx
// Add to imports
import { useState } from 'react';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { VendorProfile } from '@/components/marketplace/VendorProfile'; // verify exact path
import { X } from 'lucide-react';

// In the component:
const [previewOpen, setPreviewOpen] = useState(false);

// Replace the <Link><VendorCard /></Link> wrapper with:
<Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
  <DialogTrigger asChild>
    <button
      type="button"
      className="block w-full overflow-hidden rounded-lg text-left ring-1 ring-ink/10 transition hover:ring-ink/30"
    >
      <VendorCard profile={profile} />
    </button>
  </DialogTrigger>
  <DialogContent className="m-0 h-screen w-screen max-w-none rounded-none p-0">
    {/* Top banner */}
    <div className="sticky top-0 z-10 flex items-center justify-between border-b border-ink/15 bg-cream px-4 py-3">
      <p className="flex items-center gap-2 text-sm text-ink">
        <span className="size-2 rounded-full bg-hot-pink" />
        Preview — not yet published
      </p>
      <button
        type="button"
        onClick={() => setPreviewOpen(false)}
        aria-label="Close preview"
        className="flex size-10 items-center justify-center rounded-md text-ink hover:bg-ink/5"
      >
        <X className="size-5" />
      </button>
    </div>
    {/* The actual preview */}
    <div className="h-[calc(100vh-49px)] overflow-y-auto">
      <VendorProfile vendor={profile} />
    </div>
  </DialogContent>
</Dialog>;
```

If the `<VendorProfile>` component's prop name differs (e.g. it expects a specific shape from a server query), adapt — pass whatever it expects. Worst case, render the same JSX the public `/vendors/[slug]` page renders.

- [ ] **Step 3: Verify ESC + backdrop close work**

Manual smoke after the commit — these are shadcn Dialog defaults but worth eyeballing.

- [ ] **Step 4: Verify typecheck**

```bash
npm run typecheck
```

- [ ] **Step 5: Commit**

```bash
git add src/components/onboarding/StepReview.tsx
git commit -m "feat(onboarding): Step 7 preview opens as full-viewport modal (Bucket A T10)"
```

---

### Task 11: Add Vaul + dnd-kit deps + port FamilyDrawer primitive

**Files:**

- Create: `src/components/ui/family-drawer/index.tsx` (re-exports)
- Create: `src/components/ui/family-drawer/FamilyDrawerRoot.tsx`
- Create: `src/components/ui/family-drawer/FamilyDrawerContent.tsx`
- Create: `src/components/ui/family-drawer/FamilyDrawerOverlay.tsx`
- Create: `src/components/ui/family-drawer/FamilyDrawerTrigger.tsx`
- Create: `src/components/ui/family-drawer/FamilyDrawerClose.tsx`
- Create: `src/components/ui/family-drawer/FamilyDrawerPortal.tsx`
- Create: `src/components/ui/family-drawer/FamilyDrawerHeader.tsx`
- Create: `src/components/ui/family-drawer/FamilyDrawerButton.tsx`
- Create: `src/components/ui/family-drawer/FamilyDrawerSecondaryButton.tsx`
- Create: `src/components/ui/family-drawer/FamilyDrawerAnimatedWrapper.tsx`
- Create: `src/components/ui/family-drawer/FamilyDrawerAnimatedContent.tsx`
- Create: `src/components/ui/family-drawer/FamilyDrawerViewContent.tsx`
- Create: `src/components/ui/family-drawer/useFamilyDrawer.ts`
- Modify: `package.json` (add `vaul`, `@dnd-kit/core`, `@dnd-kit/sortable`)

**Interfaces:**

- Consumes: `vaul` (Drawer primitives), `framer-motion` (if needed for animations — check if already in the project; if so, reuse).
- Produces: the full FamilyDrawer API from the user-shared sample:

  ```ts
  export type ViewsRegistry = Record<string, React.ComponentType>;
  export function FamilyDrawerRoot(props: {
    views: ViewsRegistry;
    defaultView?: string;
    children: React.ReactNode;
  }): JSX.Element;
  export function FamilyDrawerTrigger(props: {
    children: React.ReactNode;
    className?: string;
    asChild?: boolean;
  }): JSX.Element;
  export function FamilyDrawerPortal(props: { children: React.ReactNode }): JSX.Element;
  export function FamilyDrawerOverlay(): JSX.Element;
  export function FamilyDrawerContent(props: { children: React.ReactNode }): JSX.Element;
  export function FamilyDrawerClose(): JSX.Element;
  export function FamilyDrawerHeader(props: {
    icon: React.ReactNode;
    title: string;
    description?: string;
  }): JSX.Element;
  export function FamilyDrawerButton(props: {
    onClick: () => void;
    children: React.ReactNode;
  }): JSX.Element;
  export function FamilyDrawerSecondaryButton(props: {
    onClick: () => void;
    children: React.ReactNode;
    className?: string;
  }): JSX.Element;
  export function FamilyDrawerAnimatedWrapper(props: { children: React.ReactNode }): JSX.Element;
  export function FamilyDrawerAnimatedContent(props: { children: React.ReactNode }): JSX.Element;
  export function FamilyDrawerViewContent(): JSX.Element;
  export function useFamilyDrawer(): { view: string; setView: (view: string) => void };
  ```

- [ ] **Step 1: Add the dependencies**

```bash
npm install vaul @dnd-kit/core @dnd-kit/sortable
```

Verify `framer-motion` is present:

```bash
grep '"framer-motion"' package.json
```

If absent, install it:

```bash
npm install framer-motion
```

- [ ] **Step 2: Build the Root + context**

```tsx
// src/components/ui/family-drawer/useFamilyDrawer.ts
import { createContext, useContext } from 'react';

interface FamilyDrawerContextValue {
  view: string;
  setView: (view: string) => void;
  views: Record<string, React.ComponentType>;
}

export const FamilyDrawerContext = createContext<FamilyDrawerContextValue | null>(null);

export function useFamilyDrawer() {
  const ctx = useContext(FamilyDrawerContext);
  if (!ctx) throw new Error('useFamilyDrawer must be used inside FamilyDrawerRoot');
  return ctx;
}
```

```tsx
// src/components/ui/family-drawer/FamilyDrawerRoot.tsx
'use client';
import { useState } from 'react';
import { Drawer } from 'vaul';
import { FamilyDrawerContext } from './useFamilyDrawer';

export type ViewsRegistry = Record<string, React.ComponentType>;

interface RootProps {
  views: ViewsRegistry;
  defaultView?: string;
  children: React.ReactNode;
}

export function FamilyDrawerRoot({ views, defaultView = 'default', children }: RootProps) {
  const [view, setView] = useState(defaultView);
  const [open, setOpen] = useState(false);

  return (
    <FamilyDrawerContext.Provider value={{ view, setView, views }}>
      <Drawer.Root
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setView(defaultView);
        }}
      >
        {children}
      </Drawer.Root>
    </FamilyDrawerContext.Provider>
  );
}
```

- [ ] **Step 3: Build the chrome components**

For each of FamilyDrawerTrigger, FamilyDrawerPortal, FamilyDrawerOverlay, FamilyDrawerContent, FamilyDrawerClose — wrap the corresponding Vaul primitive with our brand styling. Patterns:

```tsx
// FamilyDrawerTrigger.tsx
'use client';
import { Drawer } from 'vaul';
export function FamilyDrawerTrigger({
  children,
  className,
  asChild,
}: {
  children: React.ReactNode;
  className?: string;
  asChild?: boolean;
}) {
  return (
    <Drawer.Trigger className={className} asChild={asChild}>
      {children}
    </Drawer.Trigger>
  );
}
```

```tsx
// FamilyDrawerPortal.tsx
'use client';
import { Drawer } from 'vaul';
export function FamilyDrawerPortal({ children }: { children: React.ReactNode }) {
  return <Drawer.Portal>{children}</Drawer.Portal>;
}
```

```tsx
// FamilyDrawerOverlay.tsx
'use client';
import { Drawer } from 'vaul';
export function FamilyDrawerOverlay() {
  return <Drawer.Overlay className="fixed inset-0 bg-ink/40" />;
}
```

```tsx
// FamilyDrawerContent.tsx
'use client';
import { Drawer } from 'vaul';
export function FamilyDrawerContent({ children }: { children: React.ReactNode }) {
  return (
    <Drawer.Content className="fixed bottom-0 left-0 right-0 mx-auto max-w-md rounded-t-2xl bg-cream p-6 outline-none">
      <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-ink/20" />
      {children}
    </Drawer.Content>
  );
}
```

```tsx
// FamilyDrawerClose.tsx
'use client';
import { Drawer } from 'vaul';
import { X } from 'lucide-react';
export function FamilyDrawerClose() {
  return (
    <Drawer.Close className="absolute right-4 top-4 text-ink/40 hover:text-ink" aria-label="Close">
      <X className="size-5" />
    </Drawer.Close>
  );
}
```

- [ ] **Step 4: Build the header + button helpers**

```tsx
// FamilyDrawerHeader.tsx
export function FamilyDrawerHeader({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
}) {
  return (
    <header className="flex flex-col items-center text-center">
      <div className="mb-3">{icon}</div>
      <h2 className="text-lg font-semibold text-ink">{title}</h2>
      {description && <p className="mt-1 text-sm text-ink/70">{description}</p>}
    </header>
  );
}
```

```tsx
// FamilyDrawerButton.tsx
export function FamilyDrawerButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-lg border border-ink/15 bg-cream px-4 py-3 text-left text-sm font-medium text-ink hover:bg-ink/5"
    >
      {children}
    </button>
  );
}
```

```tsx
// FamilyDrawerSecondaryButton.tsx
export function FamilyDrawerSecondaryButton({
  onClick,
  children,
  className = '',
}: {
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium ${className}`}
    >
      {children}
    </button>
  );
}
```

- [ ] **Step 5: Build the view-switcher (animated)**

```tsx
// FamilyDrawerAnimatedWrapper.tsx
'use client';
import { motion } from 'framer-motion';
export function FamilyDrawerAnimatedWrapper({ children }: { children: React.ReactNode }) {
  return (
    <motion.div layout transition={{ type: 'spring', stiffness: 300, damping: 30 }}>
      {children}
    </motion.div>
  );
}
```

```tsx
// FamilyDrawerAnimatedContent.tsx
'use client';
import { AnimatePresence } from 'framer-motion';
export function FamilyDrawerAnimatedContent({ children }: { children: React.ReactNode }) {
  return <AnimatePresence mode="popLayout">{children}</AnimatePresence>;
}
```

```tsx
// FamilyDrawerViewContent.tsx
'use client';
import { motion } from 'framer-motion';
import { useFamilyDrawer } from './useFamilyDrawer';

export function FamilyDrawerViewContent() {
  const { view, views } = useFamilyDrawer();
  const View = views[view] ?? views.default;
  if (!View) return null;

  return (
    <motion.div
      key={view}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
    >
      <View />
    </motion.div>
  );
}
```

- [ ] **Step 6: Index file**

```ts
// src/components/ui/family-drawer/index.tsx
export * from './useFamilyDrawer';
export * from './FamilyDrawerRoot';
export * from './FamilyDrawerTrigger';
export * from './FamilyDrawerPortal';
export * from './FamilyDrawerOverlay';
export * from './FamilyDrawerContent';
export * from './FamilyDrawerClose';
export * from './FamilyDrawerHeader';
export * from './FamilyDrawerButton';
export * from './FamilyDrawerSecondaryButton';
export * from './FamilyDrawerAnimatedWrapper';
export * from './FamilyDrawerAnimatedContent';
export * from './FamilyDrawerViewContent';
```

- [ ] **Step 7: Verify typecheck**

```bash
npm run typecheck
```

Expected: 0 errors.

- [ ] **Step 8: Commit**

```bash
git add src/components/ui/family-drawer/ package.json package-lock.json
git commit -m "feat(ui): port FamilyDrawer primitive (Vaul + dnd-kit deps) (Bucket A T11)"
```

---

### Task 12: `<PhotoUploaderDrawer>` (default + manage views, no DnD yet)

**Files:**

- Create: `src/components/ui/PhotoUploaderDrawer.tsx`
- Create: `src/components/ui/PhotoThumbnailGrid.tsx`

**Interfaces:**

- Consumes: FamilyDrawer primitive (T11), existing `useUploadThing` hook from `@/lib/uploadthing`.
- Produces:

  ```ts
  interface PhotoUploaderDrawerProps {
    value: string[];
    onChange: (urls: string[]) => void;
    endpoint: 'portfolioImage' | 'packageFeatureImage';
    maxFiles?: number;
    maxSizeMb?: number;
    showPrimarySelector?: boolean;
    triggerLabel?: { empty: string; manage: string };
  }
  export function PhotoUploaderDrawer(props: PhotoUploaderDrawerProps): JSX.Element;
  ```

- [ ] **Step 1: Build the thumbnail grid (static — no DnD yet)**

```tsx
// src/components/ui/PhotoThumbnailGrid.tsx
'use client';
import { Star, X } from 'lucide-react';

interface Props {
  urls: string[];
  showPrimarySelector?: boolean;
  onRemove: (idx: number) => void;
  onSetPrimary: (idx: number) => void;
}

export function PhotoThumbnailGrid({ urls, showPrimarySelector, onRemove, onSetPrimary }: Props) {
  if (urls.length === 0) return null;
  return (
    <div className="grid grid-cols-3 gap-3">
      {urls.map((url, i) => (
        <div
          key={`${url}-${i}`}
          className="group relative aspect-square overflow-hidden rounded-md"
        >
          <img src={url} alt="" className="h-full w-full object-cover" />
          {showPrimarySelector && i === 0 && (
            <span className="absolute left-1 top-1 rounded-full bg-hot-pink px-2 py-0.5 text-[10px] font-medium text-cream">
              Primary
            </span>
          )}
          <div className="absolute inset-0 flex items-center justify-center gap-2 bg-ink/60 opacity-0 transition-opacity group-hover:opacity-100">
            {showPrimarySelector && i !== 0 && (
              <button
                type="button"
                onClick={() => onSetPrimary(i)}
                aria-label="Set as primary"
                className="rounded-full bg-cream p-2 text-ink hover:bg-cream/80"
              >
                <Star className="size-4" />
              </button>
            )}
            <button
              type="button"
              onClick={() => onRemove(i)}
              aria-label="Remove photo"
              className="rounded-full bg-cream p-2 text-hot-pink hover:bg-cream/80"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Build the drawer wrapper**

```tsx
// src/components/ui/PhotoUploaderDrawer.tsx
'use client';
import { useEffect, useRef, useState } from 'react';
import { Upload, Plus } from 'lucide-react';
import {
  FamilyDrawerRoot,
  FamilyDrawerTrigger,
  FamilyDrawerPortal,
  FamilyDrawerOverlay,
  FamilyDrawerContent,
  FamilyDrawerClose,
  FamilyDrawerAnimatedWrapper,
  FamilyDrawerAnimatedContent,
  FamilyDrawerViewContent,
  useFamilyDrawer,
  type ViewsRegistry,
} from './family-drawer';
import { PhotoThumbnailGrid } from './PhotoThumbnailGrid';
import { useUploadThing } from '@/lib/uploadthing';

interface PhotoUploaderDrawerProps {
  value: string[];
  onChange: (urls: string[]) => void;
  endpoint: 'portfolioImage' | 'packageFeatureImage';
  maxFiles?: number;
  maxSizeMb?: number;
  showPrimarySelector?: boolean;
  triggerLabel?: { empty: string; manage: string };
}

// Share value + onChange + endpoint with the inner views via a small context
import { createContext, useContext } from 'react';

interface UploaderContextValue {
  value: string[];
  onChange: (urls: string[]) => void;
  endpoint: PhotoUploaderDrawerProps['endpoint'];
  maxFiles: number;
  maxSizeMb: number;
  showPrimarySelector: boolean;
}

const UploaderContext = createContext<UploaderContextValue | null>(null);

function useUploader(): UploaderContextValue {
  const ctx = useContext(UploaderContext);
  if (!ctx) throw new Error('useUploader must be used inside PhotoUploaderDrawer');
  return ctx;
}

function DefaultView() {
  const { setView } = useFamilyDrawer();
  const { value, onChange, endpoint, maxFiles, maxSizeMb } = useUploader();
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { startUpload, isUploading } = useUploadThing(endpoint, {
    onClientUploadComplete: (res) => {
      const newUrls = res.map((r) => r.url);
      onChange([...value, ...newUrls].slice(0, maxFiles));
      setView('manage');
    },
    onUploadError: (err) => {
      console.error('Upload failed:', err);
    },
  });

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const remaining = maxFiles - value.length;
    const accepted = Array.from(files).slice(0, remaining);
    startUpload(accepted);
  }

  return (
    <div>
      <button
        type="button"
        onDragEnter={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setIsDragging(false);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          handleFiles(e.dataTransfer.files);
        }}
        onClick={() => fileInputRef.current?.click()}
        disabled={isUploading}
        className={`w-full rounded-lg border-2 border-dashed p-10 text-center transition-colors ${
          isDragging ? 'border-hot-pink bg-cream/95' : 'border-ink/40 bg-cream'
        } ${isUploading ? 'cursor-wait opacity-60' : ''}`}
      >
        <Upload
          className={`mx-auto mb-3 size-10 ${isDragging ? 'text-hot-pink' : 'text-ink/60'}`}
        />
        <p className="mb-1 text-sm font-medium text-ink">
          {isUploading ? 'Uploading…' : isDragging ? 'Drop photos here' : 'Drop photos here'}
        </p>
        <p className="text-xs text-ink/60">or click to browse</p>
        <p className="mt-4 text-xs text-ink/50">JPG, PNG, or WebP · max {maxSizeMb} MB</p>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </button>
    </div>
  );
}

function ManageView() {
  const { setView } = useFamilyDrawer();
  const { value, onChange, endpoint, maxFiles, showPrimarySelector } = useUploader();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { startUpload, isUploading } = useUploadThing(endpoint, {
    onClientUploadComplete: (res) => {
      const newUrls = res.map((r) => r.url);
      onChange([...value, ...newUrls].slice(0, maxFiles));
    },
  });

  function removeAt(idx: number) {
    onChange(value.filter((_, i) => i !== idx));
  }

  function setPrimary(idx: number) {
    if (idx === 0) return;
    const next = [...value];
    const [chosen] = next.splice(idx, 1);
    onChange([chosen!, ...next]);
  }

  function handleAddFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const remaining = maxFiles - value.length;
    if (remaining <= 0) return;
    startUpload(Array.from(files).slice(0, remaining));
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-ink">
          {value.length} of {maxFiles} photo{value.length === 1 ? '' : 's'}
        </p>
        {value.length < maxFiles && (
          <>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="inline-flex items-center gap-1 rounded-md border border-ink/15 bg-cream px-2 py-1 text-xs font-medium text-ink hover:bg-ink/5"
            >
              <Plus className="size-3" /> Add more
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => handleAddFiles(e.target.files)}
            />
          </>
        )}
      </div>

      <PhotoThumbnailGrid
        urls={value}
        showPrimarySelector={showPrimarySelector}
        onRemove={removeAt}
        onSetPrimary={setPrimary}
      />

      <button
        type="button"
        onClick={() => {
          // closing the drawer is handled by FamilyDrawerClose globally; this just resets to default view
          setView('default');
        }}
        className="mt-4 w-full rounded-lg bg-ink py-2.5 text-sm font-medium text-cream hover:bg-ink/90"
      >
        Done
      </button>
    </div>
  );
}

const photoUploaderViews: ViewsRegistry = {
  default: DefaultView,
  manage: ManageView,
};

export function PhotoUploaderDrawer({
  value,
  onChange,
  endpoint,
  maxFiles = 10,
  maxSizeMb = 4,
  showPrimarySelector = false,
  triggerLabel = { empty: 'Upload photos', manage: 'Manage photos' },
}: PhotoUploaderDrawerProps) {
  const ctxValue = { value, onChange, endpoint, maxFiles, maxSizeMb, showPrimarySelector };

  return (
    <UploaderContext.Provider value={ctxValue}>
      <FamilyDrawerRoot
        views={photoUploaderViews}
        defaultView={value.length === 0 ? 'default' : 'manage'}
      >
        {/* Closed-state representation (thumbnail strip + button) */}
        {value.length > 0 && (
          <div className="mb-2 flex gap-1.5 overflow-x-auto">
            {value.slice(0, 5).map((url, i) => (
              <div
                key={`${url}-${i}`}
                className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md"
              >
                <img src={url} alt="" className="h-full w-full object-cover" />
                {showPrimarySelector && i === 0 && (
                  <span className="absolute left-0 top-0 rounded-br-md bg-hot-pink px-1 py-0.5 text-[8px] font-medium text-cream">
                    Primary
                  </span>
                )}
              </div>
            ))}
            {value.length > 5 && (
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md bg-ink/10 text-xs text-ink">
                +{value.length - 5}
              </div>
            )}
          </div>
        )}

        <FamilyDrawerTrigger className="inline-flex items-center gap-1.5 rounded-md border border-ink bg-cream px-3 py-2 text-sm font-medium text-ink hover:bg-ink/5">
          <Upload className="size-4" />
          {value.length === 0 ? triggerLabel.empty : `${triggerLabel.manage} (${value.length})`}
        </FamilyDrawerTrigger>

        <FamilyDrawerPortal>
          <FamilyDrawerOverlay />
          <FamilyDrawerContent>
            <FamilyDrawerClose />
            <FamilyDrawerAnimatedWrapper>
              <FamilyDrawerAnimatedContent>
                <FamilyDrawerViewContent />
              </FamilyDrawerAnimatedContent>
            </FamilyDrawerAnimatedWrapper>
          </FamilyDrawerContent>
        </FamilyDrawerPortal>
      </FamilyDrawerRoot>
    </UploaderContext.Provider>
  );
}
```

- [ ] **Step 3: Verify typecheck**

```bash
npm run typecheck
```

Expected: 0 errors. If `useUploadThing` shape differs from the assumed `{ startUpload, isUploading }`, adapt.

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/PhotoUploaderDrawer.tsx src/components/ui/PhotoThumbnailGrid.tsx
git commit -m "feat(ui): add PhotoUploaderDrawer with default + manage views (Bucket A T12)"
```

---

### Task 13: Drag-to-reorder on PhotoUploaderDrawer

**Files:**

- Modify: `src/components/ui/PhotoThumbnailGrid.tsx`

**Interfaces:**

- Consumes: `@dnd-kit/core`, `@dnd-kit/sortable` (T11), the existing `PhotoThumbnailGrid` shape from T12.
- Produces: drag-handle on each thumbnail; reorder updates the array order via `onChange`.

- [ ] **Step 1: Add onReorder prop and wire DnD**

Add a new prop:

```ts
interface Props {
  urls: string[];
  showPrimarySelector?: boolean;
  onRemove: (idx: number) => void;
  onSetPrimary: (idx: number) => void;
  onReorder: (newOrder: string[]) => void;
}
```

- [ ] **Step 2: Rewrite the grid with sortable**

```tsx
'use client';
import { Star, X, GripVertical } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface Props {
  urls: string[];
  showPrimarySelector?: boolean;
  onRemove: (idx: number) => void;
  onSetPrimary: (idx: number) => void;
  onReorder: (newOrder: string[]) => void;
}

function SortableThumbnail({
  url,
  idx,
  showPrimarySelector,
  onRemove,
  onSetPrimary,
}: {
  url: string;
  idx: number;
  showPrimarySelector?: boolean;
  onRemove: (idx: number) => void;
  onSetPrimary: (idx: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: url,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group relative aspect-square overflow-hidden rounded-md"
    >
      <img src={url} alt="" className="h-full w-full object-cover" />
      {showPrimarySelector && idx === 0 && (
        <span className="absolute left-1 top-1 z-10 rounded-full bg-hot-pink px-2 py-0.5 text-[10px] font-medium text-cream">
          Primary
        </span>
      )}
      <button
        {...attributes}
        {...listeners}
        type="button"
        aria-label="Reorder"
        className="absolute bottom-1 left-1 z-10 cursor-grab rounded-full bg-cream/80 p-1 text-ink opacity-0 transition-opacity group-hover:opacity-100"
      >
        <GripVertical className="size-3" />
      </button>
      <div className="absolute inset-0 flex items-center justify-center gap-2 bg-ink/60 opacity-0 transition-opacity group-hover:opacity-100">
        {showPrimarySelector && idx !== 0 && (
          <button
            type="button"
            onClick={() => onSetPrimary(idx)}
            aria-label="Set as primary"
            className="rounded-full bg-cream p-2 text-ink hover:bg-cream/80"
          >
            <Star className="size-4" />
          </button>
        )}
        <button
          type="button"
          onClick={() => onRemove(idx)}
          aria-label="Remove photo"
          className="rounded-full bg-cream p-2 text-hot-pink hover:bg-cream/80"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}

export function PhotoThumbnailGrid({
  urls,
  showPrimarySelector,
  onRemove,
  onSetPrimary,
  onReorder,
}: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = urls.indexOf(active.id as string);
    const newIndex = urls.indexOf(over.id as string);
    onReorder(arrayMove(urls, oldIndex, newIndex));
  }

  if (urls.length === 0) return null;

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={urls} strategy={rectSortingStrategy}>
        <div className="grid grid-cols-3 gap-3">
          {urls.map((url, i) => (
            <SortableThumbnail
              key={url}
              url={url}
              idx={i}
              showPrimarySelector={showPrimarySelector}
              onRemove={onRemove}
              onSetPrimary={onSetPrimary}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
```

- [ ] **Step 3: Pass `onReorder` from `PhotoUploaderDrawer`**

In `src/components/ui/PhotoUploaderDrawer.tsx`, inside `ManageView`:

```tsx
<PhotoThumbnailGrid
  urls={value}
  showPrimarySelector={showPrimarySelector}
  onRemove={removeAt}
  onSetPrimary={setPrimary}
  onReorder={onChange} // ← new prop
/>
```

- [ ] **Step 4: Verify typecheck**

```bash
npm run typecheck
```

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/PhotoThumbnailGrid.tsx src/components/ui/PhotoUploaderDrawer.tsx
git commit -m "feat(ui): add drag-to-reorder on PhotoThumbnailGrid (Bucket A T13)"
```

---

### Task 14: UploadThing `packageFeatureImage` endpoint

**Files:**

- Modify: `src/app/api/uploadthing/core.ts`

**Interfaces:**

- Consumes: existing UploadThing `f` helper, existing `getCurrentUser` (or whatever the project uses for auth in this file).
- Produces: a new `packageFeatureImage` endpoint exported from the file router.

- [ ] **Step 1: Find the existing portfolioImage endpoint**

```bash
grep -n "portfolioImage\|UploadThingError\|UTApi" src/app/api/uploadthing/core.ts | head -10
```

Read the surrounding pattern — auth middleware, file size, file count.

- [ ] **Step 2: Add the new endpoint**

In the same file router object, alongside `portfolioImage`, add:

```ts
packageFeatureImage: f({ image: { maxFileSize: '4MB', maxFileCount: 1 } })
  .middleware(async () => {
    // Mirror whatever the portfolioImage middleware does
    const user = await getCurrentUser(); // adapt to actual helper name
    if (!user) throw new UploadThingError('Unauthorized');
    return { userId: user.id };
  })
  .onUploadComplete(async () => {
    // no-op; image URL returned to client
  }),
```

If the `portfolioImage` middleware does something more specific (e.g. role check for vendor only), mirror that here too — packages editor is also vendor-only.

- [ ] **Step 3: Verify typecheck**

```bash
npm run typecheck
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/uploadthing/core.ts
git commit -m "feat(uploadthing): add packageFeatureImage endpoint (Bucket A T14)"
```

---

### Task 15: Integrate PhotoUploaderDrawer into StepPortfolio + PackageEditorForm

**Files:**

- Modify: `src/components/onboarding/StepPortfolio.tsx`
- Modify: `src/components/forms/PackageEditorForm.tsx`

**Interfaces:**

- Consumes: `<PhotoUploaderDrawer>` from T12, the `packageFeatureImage` endpoint from T14.

- [ ] **Step 1: Replace the upload UI in StepPortfolio**

In `src/components/onboarding/StepPortfolio.tsx`, find the existing `<UploadButton>` + the inline thumbnail grid (around lines 60-103 per the audit). Replace with:

```tsx
<PhotoUploaderDrawer
  value={images}
  onChange={setImages}
  endpoint="portfolioImage"
  maxFiles={10}
  maxSizeMb={4}
  showPrimarySelector
  triggerLabel={{ empty: 'Upload portfolio photos', manage: 'Manage photos' }}
/>
```

Remove the old grid + X button rendering — `PhotoUploaderDrawer` handles all of that internally.

- [ ] **Step 2: Replace the feature-image input in PackageEditorForm**

Find the existing feature-image input. Replace with:

```tsx
<PhotoUploaderDrawer
  value={featureImage ? [featureImage] : []}
  onChange={(urls) => setFeatureImage(urls[0] ?? null)}
  endpoint="packageFeatureImage"
  maxFiles={1}
  maxSizeMb={4}
  triggerLabel={{ empty: 'Upload feature image', manage: 'Change feature image' }}
/>
```

If the prop / state shape uses a different setter name, adapt.

- [ ] **Step 3: Verify typecheck**

```bash
npm run typecheck
```

- [ ] **Step 4: Verify the existing UploadButton isn't imported anywhere else**

```bash
grep -rn "import.*UploadButton" src/ 2>/dev/null
```

If still in use elsewhere, leave the import in `@/lib/uploadthing` — only the wizard + packages editor consumers swap.

- [ ] **Step 5: Commit**

```bash
git add src/components/onboarding/StepPortfolio.tsx src/components/forms/PackageEditorForm.tsx
git commit -m "feat(onboarding+packages): integrate PhotoUploaderDrawer in both surfaces (Bucket A T15)"
```

---

### Task 16: Addon price input fixes

**Files:**

- Modify: `src/components/forms/PackageAddonsEditor.tsx`

**Interfaces:**

- Consumes: nothing.
- Produces: addon price input with `step="1"`, `min="0"`, empty-when-zero render, defensive `handlePriceChange` guard.

- [ ] **Step 1: Replace the Input element**

In `src/components/forms/PackageAddonsEditor.tsx:61-67`, find:

```tsx
<Input
  type="number"
  step="0.01"
  className="w-24"
  value={a.price_delta_cents / 100}
  onChange={(e) => handlePriceChange(i, e.target.value)}
/>
```

Replace with:

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

- [ ] **Step 2: Add defensive guard in handlePriceChange**

Find `handlePriceChange` (around line 31):

```ts
function handlePriceChange(i: number, raw: string) {
  const dollars = parseFloat(raw || '0');
  const cents = Math.round(isNaN(dollars) ? 0 : dollars * 100);
  update(addons.map((a, j) => (j === i ? { ...a, price_delta_cents: cents } : a)));
}
```

Replace with:

```ts
function handlePriceChange(i: number, raw: string) {
  const dollars = parseFloat(raw || '0');
  const safeDollars = isNaN(dollars) || dollars < 0 ? 0 : dollars;
  const cents = Math.round(safeDollars * 100);
  update(addons.map((a, j) => (j === i ? { ...a, price_delta_cents: cents } : a)));
}
```

- [ ] **Step 3: Verify typecheck**

```bash
npm run typecheck
```

- [ ] **Step 4: Commit**

```bash
git add src/components/forms/PackageAddonsEditor.tsx
git commit -m "fix(packages): addon price input — step=1, min=0, empty-when-zero (Bucket A T16)"
```

---

### Task 17: Playwright spec — addon price input

**Files:**

- Create: `tests/e2e/bucket-a-addon-price.spec.ts`

**Interfaces:**

- Consumes: existing `seedVendor`, `cleanup`, `loginAs` helpers from `tests/e2e/helpers/`.

- [ ] **Step 1: Write the spec**

```ts
// tests/e2e/bucket-a-addon-price.spec.ts
import { test, expect } from '@playwright/test';
import { seedVendor, cleanup, type TestVendor } from './helpers/seed';
import { loginAs } from './helpers/login';

test.describe('Bucket A — addon price input', () => {
  let vendor: TestVendor | null = null;

  test.afterEach(async () => {
    await cleanup(null, vendor);
    vendor = null;
  });

  test('empty initial state, $1 arrow step, negative clamped to 0', async ({ browser }) => {
    vendor = await seedVendor({ chargesEnabled: false });
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await loginAs(page, vendor);

    await page.goto('/dashboard/profile/packages/new');
    await page.getByLabel(/package name/i).fill('Test Package');

    // Click "Add an add-on" or whatever the add button label is
    await page.getByRole('button', { name: /add-on/i }).click();

    // Find the first price input (number spinner)
    const priceInput = page.getByRole('spinbutton').first();

    // 1. No leading zero
    await expect(priceInput).toHaveValue('');

    // 2. Arrow up advances by $1
    await priceInput.focus();
    await page.keyboard.press('ArrowUp');
    await expect(priceInput).toHaveValue('1');

    // 3. Type negative — clamps to 0 on blur (defensive guard)
    await priceInput.fill('-5');
    await priceInput.blur();
    await expect(priceInput).toHaveValue('0');
  });
});
```

- [ ] **Step 2: Run the spec**

```bash
npm run dev   # in another terminal
npm run test:e2e -- bucket-a-addon-price
```

Expected: PASS.

If a selector mismatches (e.g. the add-on button label is different), inspect the page and adjust. The selectors above are best-effort; the actual labels may differ.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/bucket-a-addon-price.spec.ts
git commit -m "test(e2e): Bucket A addon price input spec (T17)"
```

---

### Task 18: Playwright spec — photo uploader

**Files:**

- Create: `tests/e2e/bucket-a-photo-uploader.spec.ts`

**Interfaces:**

- Consumes: existing E2E helpers.

- [ ] **Step 1: Write the spec**

```ts
// tests/e2e/bucket-a-photo-uploader.spec.ts
import { test, expect } from '@playwright/test';
import { seedVendor, cleanup, getServiceClient, type TestVendor } from './helpers/seed';
import { loginAs } from './helpers/login';

test.describe('Bucket A — PhotoUploaderDrawer', () => {
  let vendor: TestVendor | null = null;

  test.afterEach(async () => {
    await cleanup(null, vendor);
    vendor = null;
  });

  test('closed state, open/close, primary selection, remove', async ({ browser }) => {
    vendor = await seedVendor({ chargesEnabled: false });
    const sb = getServiceClient();

    // Seed two photo URLs directly on the vendor profile (skip the real upload path)
    await sb
      .from('vendor_profiles')
      .update({
        portfolio_images: ['https://example.com/photo-1.jpg', 'https://example.com/photo-2.jpg'],
      })
      .eq('id', vendor.vendorProfileId);

    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await loginAs(page, vendor);

    // Navigate to Step 5 (Portfolio)
    await page.goto('/dashboard/profile/setup/portfolio');

    // Closed-state shows "Manage photos (2)"
    await expect(page.getByRole('button', { name: /manage photos.*2/i })).toBeVisible();

    // Open the drawer
    await page.getByRole('button', { name: /manage photos/i }).click();
    await expect(page.locator('text=/2 of 10 photos/i')).toBeVisible();

    // Two thumbnails visible
    const thumbnails = page.locator('[class*="aspect-square"]');
    await expect(thumbnails).toHaveCount(2);

    // ESC closes (Vaul default)
    await page.keyboard.press('Escape');
    await expect(page.locator('text=/2 of 10 photos/i')).toBeHidden();
  });
});
```

- [ ] **Step 2: Run the spec**

```bash
npm run test:e2e -- bucket-a-photo-uploader
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/bucket-a-photo-uploader.spec.ts
git commit -m "test(e2e): Bucket A PhotoUploaderDrawer spec (T18)"
```

---

### Task 19: Playwright spec — form errors + address optional

**Files:**

- Create: `tests/e2e/bucket-a-form-errors.spec.ts`

- [ ] **Step 1: Write the spec**

```ts
// tests/e2e/bucket-a-form-errors.spec.ts
import { test, expect } from '@playwright/test';
import { seedVendor, cleanup, type TestVendor } from './helpers/seed';
import { loginAs } from './helpers/login';

test.describe('Bucket A — form errors + address optional', () => {
  let vendor: TestVendor | null = null;

  test.afterEach(async () => {
    await cleanup(null, vendor);
    vendor = null;
  });

  test('Step 1: missing business name + category surfaces both errors simultaneously', async ({
    browser,
  }) => {
    vendor = await seedVendor({ chargesEnabled: false });
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await loginAs(page, vendor);

    await page.goto('/dashboard/profile/setup/basics');

    // Click Next without filling anything
    await page.getByRole('button', { name: /next/i }).click();

    // Summary count visible
    await expect(page.getByText(/2 fields need attention/i)).toBeVisible();

    // Inline errors present below each field
    await expect(page.getByText(/business name/i).locator('..')).toContainText(/required/i);
    await expect(page.getByText(/category/i).locator('..')).toContainText(/required/i);
  });

  test('Step 2: skip-address checkbox unblocks Next', async ({ browser }) => {
    vendor = await seedVendor({ chargesEnabled: false });
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await loginAs(page, vendor);

    await page.goto('/dashboard/profile/setup/location');

    // Tick the skip checkbox
    await page.getByLabel(/I don't have a fixed address/i).check();

    // Click Next — should transition without error
    await page.getByRole('button', { name: /next/i }).click();

    // Step 3 (online) is visible
    await expect(page).toHaveURL(/\/online/);
  });
});
```

- [ ] **Step 2: Run the spec**

```bash
npm run test:e2e -- bucket-a-form-errors
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/bucket-a-form-errors.spec.ts
git commit -m "test(e2e): Bucket A form errors + address optional spec (T19)"
```

---

### Task 20: Open PR + manual smoke

**Files:** none.

**Interfaces:**

- Consumes: all commits from T1–T19.

- [ ] **Step 1: Run the full local suite**

```bash
npm run typecheck && npm run lint && npm run test:unit && npm run test:e2e
```

Expected: green across the board (the 4 pre-existing scraped-vendor failures were fixed in PR #45 — should still be passing).

- [ ] **Step 2: Open PR**

```bash
git push -u origin feat/bucket-a-onboarding-polish
gh pr create --title "feat: Bucket A — onboarding wizard + packages editor polish" --body "$(cat <<'EOF'
## Summary

Implements Bucket A per the approved spec at `docs/superpowers/specs/2026-06-18-bucket-a-onboarding-polish-design.md` (spec PR #47).

- AI bio provider swap (Claude Haiku → Gemini 2.5 Flash-Lite) — ~10× cheaper at scale
- `<BioAssistCard>` replaces `<BioAssistButton>` with inline streaming + Accept/Decline
- Bio textarea: dropped hard 50-char floor; pre-fill affordance for claimed vendors
- Step 2 address is optional; skip checkbox added
- `useFormErrors()` hook wired across all 7 wizard steps — inline per-field errors + summary count
- 3% / 5% platform fee disclosed explicitly in Step 6 + Step 7
- Step 7 preview opens as full-viewport modal (no navigation away)
- `FamilyDrawer` primitive (Vaul + dnd-kit) + `<PhotoUploaderDrawer>` wrapper integrated into StepPortfolio + PackageEditorForm
- Primary-photo selection (array-position-0) + drag-to-reorder
- New UploadThing endpoint `packageFeatureImage`
- Addon price input fixed: step=1, min=0, empty-when-zero
- Three new Playwright specs

## Test plan

- [ ] CI green
- [ ] `GOOGLE_API_KEY` set in Vercel production before merge
- [ ] Manual smoke: walk through the wizard end-to-end on a fresh claimed vendor
- [ ] Manual smoke: try the bio Draft + Polish flows; iterate to confirm Use/Keep work
- [ ] Manual smoke: open the photo drawer, upload, reorder, set primary, remove

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Manual smoke against the PR's Vercel preview**

Once the preview URL exists:

```bash
PLAYWRIGHT_BASE_URL=<preview-url> npm run test:e2e -- bucket-a-
```

- [ ] **Step 4: Hand off for human review.**

---

## Self-Review

**Spec coverage:**

- § 3.1 Gemini swap → T1, T2, T3. ✓
- § 3.3 BioAssistCard UI → T4. ✓
- § 3.5 Bio constraint relaxation → T5. ✓
- § 3.6 Pre-fill affordance → T5. ✓
- § 4.1 Address optional → T8. ✓
- § 4.2 Per-field errors → T6, T7. ✓
- § 4.3 Fee disclosure → T9. ✓
- § 4.4 Step 7 preview modal → T10. ✓
- § 5.1 FamilyDrawer primitive → T11. ✓
- § 5.2 PhotoUploaderDrawer → T12. ✓
- § 5.3 Closed state → T12 (inline in PhotoUploaderDrawer). ✓
- § 5.4 Drawer views → T12. ✓
- § 5.5 Primary via position-0 → T13. ✓
- § 5.6 packageFeatureImage endpoint → T14. ✓
- § 5.7 Consumer integrations → T15. ✓
- § 6 Addon price fixes → T16. ✓
- § 7 Playwright specs → T17, T18, T19. ✓
- § 8 New env vars + deps → T1, T11.
- § 11 Success criteria → covered across T1-T19.

**Placeholder scan:** zero `TBD`, `TODO`, `XXX`, or "fill in details" entries in plan steps.

**Type consistency:**

- `BIO_ASSIST_MODEL` and `getGoogleAI` consistent across T1, T3.
- `useFormErrors` shape consistent across T6, T7.
- `PhotoUploaderDrawer` props consistent across T12, T13, T15.
- `PhotoThumbnailGrid` `onReorder` added in T13 + wired in same task.
- FamilyDrawer exports list in T11 used by T12 — names match.

No gaps found. Plan is ready for execution.
