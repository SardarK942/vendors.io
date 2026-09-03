# Semantic Search Quality — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Baazar's existing semantic vendor search measurably better — first build an evaluation harness so quality is measured not guessed, then enrich what each vendor embeds, then push category filtering into retrieval so relevant vendors aren't lost past the `LIMIT`.

**Architecture:** Three layers, in dependency order. (1) A pure metrics module + a `tsx` runner script that scores `hybridSearch` against a golden query set (recall@k, MRR). (2) A single shared `buildVendorEmbeddingText()` that both embedding writers use, widened from `name + category + bio` to include service area, languages, event types, subcategories, and services — plus a one-shot re-embed script. (3) An optional `p_category` argument on the `search_vendors_semantic` RPC so category is applied in SQL `WHERE` (before `LIMIT`) instead of as a post-`LIMIT` filter in TypeScript.

**Tech Stack:** Next.js (App Router), TypeScript, Supabase/Postgres + pgvector, OpenAI (`text-embedding-3-small`, `gpt-4o-mini`), Vitest, `tsx` scripts.

**Spec:** Inline — see **Background & Spec** below. Derived from the 2026-09-02 session recommendation ("do #6 then #1 and #2 as a single small PR"). This plan is that PR. RAG is explicitly **out of scope** (deferred until real query logs justify it).

## Global Constraints

- **Tests:** Vitest. Unit tests live under `src/__tests__/**`, mirror the source path (AI tests in `src/__tests__/lib/ai/`), and import with the `@/` alias. Run a single file with `npx vitest run <path>`. Follow the existing hand-built-mock style in `src/__tests__/lib/ai/rate-limit.test.ts` (no network in unit tests).
- **Scripts:** Run via `tsx --env-file-if-exists=.env.local <path>` and register as an npm script. Scripts MUST instantiate Supabase with `createClient` from `@supabase/supabase-js` directly — NOT `@/lib/supabase/server` (it imports `next/headers` and throws outside the Next runtime). Pattern reference: `scripts/backfill-payouts.ts`.
- **Migrations:** Next number is `00076`. Policy: Claude applies to **dev** via `psql`; the **user** applies to prod. Never assume prod is migrated.
- **Generated types:** `src/types/database.types.ts` is hand-patched for new columns/RPC args (a clean `supabase gen types` wipes custom aliases — see the `database.types.ts regen pending` memo). Patch by hand.
- **DB reads:** Select only the columns needed — never `select('*')` on `vendor_profiles` (it drags the `searchable_text` blob and calendar columns).
- **Git:** Never commit to `main`. This work goes on a feature branch → PR → squash. Commit trailers required:
  ```
  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01SdPLSr4sE58BATTawutx6B
  ```
- **Cost:** `text-embedding-3-small` ≈ $0.00002 / 1K tokens. Re-embedding the full catalog (~500 vendors) is well under $0.01.

---

## Background & Spec

Current AI search (`src/lib/ai/search.ts`, entry `hybridSearch`):

1. Cache lookup (Upstash, 1h TTL) → `parseSearchQuery` (gpt-4o-mini → `{searchText, category, budgetHint, locationHint}`) → `semanticSearch` (embed `searchText`, pgvector cosine via `search_vendors_semantic` RPC, threshold 0.15, `LIMIT 20`) → full-text fallback if `< 5` results → **soft** category/location post-filters (applied only if they leave ≥1 row).

Three problems this plan fixes:

- **No measurement.** There's no way to tell if a change helped. → **Task 1 + 2** (eval harness).
- **Thin embedding document.** Each vendor embeds only `"{business_name} - {category} - {bio}"` (cron) / `"{business_name} {bio} {category}"` (admin) — two _different_ shapes, and neither includes service area, languages, event types, subcategories, or services. Semantic recall is capped by this. → **Task 3** (unify + enrich + re-embed).
- **Retrieve-then-filter recall loss.** `search_vendors_semantic` does `LIMIT 20` by pure similarity, _then_ TS filters by category. A photographer ranked #21 by raw similarity is never seen for a "photographer" query. → **Task 4** (category filter in the RPC `WHERE`, before `LIMIT`).

Out of scope (deferred, tracked separately): budget filter wiring, RRF fusion, HNSW index, LLM-distilled embedding text, and RAG/generation. Location stays a TS soft-filter (its service-area-array + fuzzy-city matching is awkward in SQL and lower-precision than category).

---

## File Structure

- `src/lib/ai/eval-metrics.ts` **(new)** — pure ranking metrics: `recallAtK`, `reciprocalRank`, `meanReciprocalRank`. No I/O.
- `src/__tests__/lib/ai/eval-metrics.test.ts` **(new)** — unit tests for the above.
- `scripts/ai-eval/golden-queries.json` **(new)** — golden set: `{ query, expectedSlugs }[]`, curated from dev data.
- `scripts/ai-eval/run.ts` **(new)** — loads the golden set, runs `hybridSearch` against dev (cache disabled), prints per-query recall@5/@10 + aggregate MRR.
- `src/lib/ai/embeddings.ts` **(modify)** — add `buildVendorEmbeddingText()` + its input type `VendorEmbeddingInput`.
- `src/__tests__/lib/ai/embeddings.test.ts` **(new)** — unit tests for `buildVendorEmbeddingText`.
- `src/app/api/cron/embed-vendors/route.ts` **(modify)** — select enriched columns; build text via `buildVendorEmbeddingText`.
- `src/app/api/ai/embed/route.ts` **(modify)** — same; unifies the two divergent text shapes.
- `scripts/reembed-vendors.ts` **(new)** — one-shot: re-embed the whole catalog with the enriched text.
- `supabase/migrations/00076_search_vendors_semantic_category_filter.sql` **(new)** — add `p_category TEXT DEFAULT NULL` to the RPC.
- `src/types/database.types.ts` **(modify)** — hand-patch the RPC Args.
- `src/lib/ai/search.ts` **(modify)** — thread `category` into `semanticSearch` → RPC.
- `src/__tests__/lib/ai/search.test.ts` **(new)** — assert the RPC is called with `p_category`.

---

### Task 1: Ranking metrics module

Pure functions, no I/O — the scoring core the runner (Task 2) depends on.

**Files:**

- Create: `src/lib/ai/eval-metrics.ts`
- Test: `src/__tests__/lib/ai/eval-metrics.test.ts`

**Interfaces:**

- Consumes: nothing.
- Produces:
  - `recallAtK(retrievedIds: string[], relevantIds: string[], k: number): number`
  - `reciprocalRank(retrievedIds: string[], relevantIds: string[]): number`
  - `meanReciprocalRank(reciprocalRanks: number[]): number`

- [ ] **Step 1: Write the failing test**

`src/__tests__/lib/ai/eval-metrics.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { recallAtK, reciprocalRank, meanReciprocalRank } from '@/lib/ai/eval-metrics';

describe('recallAtK', () => {
  it('counts relevant ids found within the top k', () => {
    // relevant = [a, c]; top-3 retrieved = [a, x, c] → both found → 1.0
    expect(recallAtK(['a', 'x', 'c', 'd'], ['a', 'c'], 3)).toBe(1);
  });

  it('ignores relevant ids that fall outside k', () => {
    // relevant = [a, c]; top-2 = [a, x] → only a found → 0.5
    expect(recallAtK(['a', 'x', 'c'], ['a', 'c'], 2)).toBe(0.5);
  });

  it('returns 0 when there are no relevant ids (avoids divide-by-zero)', () => {
    expect(recallAtK(['a', 'b'], [], 5)).toBe(0);
  });
});

describe('reciprocalRank', () => {
  it('is 1 divided by the 1-based rank of the first relevant hit', () => {
    // first relevant (c) is at index 2 → rank 3 → 1/3
    expect(reciprocalRank(['a', 'b', 'c'], ['c'])).toBeCloseTo(1 / 3);
  });

  it('is 0 when no relevant id appears', () => {
    expect(reciprocalRank(['a', 'b'], ['z'])).toBe(0);
  });
});

describe('meanReciprocalRank', () => {
  it('averages the per-query reciprocal ranks', () => {
    expect(meanReciprocalRank([1, 0.5, 0])).toBeCloseTo(0.5);
  });

  it('returns 0 for an empty list', () => {
    expect(meanReciprocalRank([])).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/lib/ai/eval-metrics.test.ts`
Expected: FAIL — cannot resolve `@/lib/ai/eval-metrics`.

- [ ] **Step 3: Write minimal implementation**

`src/lib/ai/eval-metrics.ts`:

```ts
/**
 * Pure ranking-quality metrics for the AI search eval harness.
 * `retrievedIds` is the ordered result list; `relevantIds` is the golden set
 * of ids that *should* surface for a query. Ids are matched by identity, so
 * pass the same identifier space for both (this repo uses vendor slugs).
 */

/** Fraction of relevant ids that appear in the top-k retrieved ids. */
export function recallAtK(retrievedIds: string[], relevantIds: string[], k: number): number {
  if (relevantIds.length === 0) return 0;
  const topK = new Set(retrievedIds.slice(0, k));
  const hits = relevantIds.filter((id) => topK.has(id)).length;
  return hits / relevantIds.length;
}

/** 1 / (1-based rank of the first relevant hit), or 0 if none appear. */
export function reciprocalRank(retrievedIds: string[], relevantIds: string[]): number {
  const relevant = new Set(relevantIds);
  for (let i = 0; i < retrievedIds.length; i++) {
    if (relevant.has(retrievedIds[i])) return 1 / (i + 1);
  }
  return 0;
}

/** Mean of per-query reciprocal ranks. */
export function meanReciprocalRank(reciprocalRanks: number[]): number {
  if (reciprocalRanks.length === 0) return 0;
  return reciprocalRanks.reduce((sum, rr) => sum + rr, 0) / reciprocalRanks.length;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/lib/ai/eval-metrics.test.ts`
Expected: PASS (8 assertions).

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/eval-metrics.ts src/__tests__/lib/ai/eval-metrics.test.ts
git commit -m "feat(ai-search): add ranking metrics for eval harness"
```

---

### Task 2: Golden set + eval runner, capture baseline

Wires the golden set through `hybridSearch` (cache disabled) and reports quality. Ends with a recorded **baseline** — the number Tasks 3 & 4 must beat.

**Files:**

- Create: `scripts/ai-eval/golden-queries.json`
- Create: `scripts/ai-eval/run.ts`
- Modify: `package.json` (add `ai:eval` script)

**Interfaces:**

- Consumes: `recallAtK`, `reciprocalRank`, `meanReciprocalRank` from `@/lib/ai/eval-metrics`; `hybridSearch(supabase, query)` from `@/lib/ai/search` (returns `{ vendors: { slug: string | null, ... }[] }`).
- Produces: npm script `ai:eval`; a console report. No importable exports.

- [ ] **Step 1: Create the golden query set**

`scripts/ai-eval/golden-queries.json` — start with real dev slugs. Pick 8–12 vendors in dev (`SELECT slug, business_name, category FROM vendor_profiles WHERE is_active AND onboarding_complete LIMIT 20;`) and write queries you'd expect to surface them. Replace the placeholders below with **actual dev slugs** before running:

```json
[
  {
    "query": "south asian wedding photographer in chicago",
    "expectedSlugs": ["REPLACE-with-a-real-photography-slug"]
  },
  { "query": "punjabi dj for a sangeet", "expectedSlugs": ["REPLACE-with-a-real-dj-slug"] },
  { "query": "mehndi artist naperville", "expectedSlugs": ["REPLACE-with-a-real-mehndi-slug"] },
  {
    "query": "halal catering for 300 guests",
    "expectedSlugs": ["REPLACE-with-a-real-catering-slug"]
  },
  {
    "query": "bridal hair and makeup urdu speaking",
    "expectedSlugs": ["REPLACE-with-a-real-hair_makeup-slug"]
  }
]
```

Aim for ≥10 entries covering distinct categories; `expectedSlugs` may list more than one vendor per query.

- [ ] **Step 2: Write the runner**

`scripts/ai-eval/run.ts`:

```ts
/**
 * AI search eval harness. Runs the golden query set through hybridSearch
 * against the configured Supabase DB and reports recall@5, recall@10 and MRR.
 *
 * Cache is force-disabled (Upstash env deleted before importing the search
 * module, which reads those vars at import time) so results reflect live
 * retrieval, not a warm cache.
 *
 * Usage (dev):
 *   npm run ai:eval
 * Requires NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';
import { recallAtK, reciprocalRank, meanReciprocalRank } from '@/lib/ai/eval-metrics';

// Disable the Upstash cache before the search module is loaded.
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;

interface GoldenEntry {
  query: string;
  expectedSlugs: string[];
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  if (!process.env.OPENAI_API_KEY) throw new Error('Missing OPENAI_API_KEY');

  const supabase = createClient<Database>(url, key);
  const { hybridSearch } = await import('@/lib/ai/search'); // dynamic: after cache env deleted

  const golden = JSON.parse(
    readFileSync(join(process.cwd(), 'scripts/ai-eval/golden-queries.json'), 'utf8')
  ) as GoldenEntry[];

  const rrs: number[] = [];
  console.log('query'.padEnd(48), 'r@5', 'r@10', 'rr');
  for (const { query, expectedSlugs } of golden) {
    const { vendors } = await hybridSearch(supabase, query);
    const slugs = vendors.map((v) => v.slug ?? '').filter(Boolean);
    const r5 = recallAtK(slugs, expectedSlugs, 5);
    const r10 = recallAtK(slugs, expectedSlugs, 10);
    const rr = reciprocalRank(slugs, expectedSlugs);
    rrs.push(rr);
    console.log(query.slice(0, 47).padEnd(48), r5.toFixed(2), r10.toFixed(2), rr.toFixed(2));
  }
  console.log('\nMRR:', meanReciprocalRank(rrs).toFixed(3), `over ${golden.length} queries`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 3: Register the npm script**

In `package.json` `scripts`, add:

```json
"ai:eval": "tsx --env-file-if-exists=.env.local scripts/ai-eval/run.ts"
```

- [ ] **Step 4: Run the harness and capture the baseline**

Run: `npm run ai:eval`
Expected: a table plus an `MRR: <n>` line, no crash. Record the MRR and per-query recall numbers in the PR description as the **pre-change baseline**. (If most rows are `0.00`, verify the golden slugs exist in dev and have non-null embeddings: `SELECT slug FROM vendor_profiles WHERE embedding IS NOT NULL;`.)

- [ ] **Step 5: Commit**

```bash
git add scripts/ai-eval/golden-queries.json scripts/ai-eval/run.ts package.json
git commit -m "feat(ai-search): add eval harness with golden query set"
```

---

### Task 3: Unify + enrich the embedding document, re-embed

One shared builder for both embedding writers, widened with structured fields, then a full re-embed so the change takes effect. Re-run the harness to prove the lift.

**Files:**

- Modify: `src/lib/ai/embeddings.ts`
- Test: `src/__tests__/lib/ai/embeddings.test.ts` (new)
- Modify: `src/app/api/cron/embed-vendors/route.ts:34-48`
- Modify: `src/app/api/ai/embed/route.ts` (the `select` + the `text` line inside the loop)
- Create: `scripts/reembed-vendors.ts`
- Modify: `package.json` (add `ai:reembed` script)

**Interfaces:**

- Consumes: nothing new.
- Produces:
  - `VendorEmbeddingInput` — `{ business_name: string; category: string | null; bio?: string | null; subcategories?: string[] | null; services?: string[] | null; service_area?: string[] | null; base_city?: string | null; languages?: string[] | null; served_event_types?: string[] | null; years_in_business?: number | null }`
  - `buildVendorEmbeddingText(vendor: VendorEmbeddingInput): string`

- [ ] **Step 1: Write the failing test**

`src/__tests__/lib/ai/embeddings.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildVendorEmbeddingText } from '@/lib/ai/embeddings';

describe('buildVendorEmbeddingText', () => {
  it('includes all populated structured fields', () => {
    const text = buildVendorEmbeddingText({
      business_name: 'Zara Studio',
      category: 'photography',
      bio: 'Candid documentary weddings.',
      subcategories: ['candid', 'traditional'],
      services: ['photography', 'videography'],
      service_area: ['Chicago', 'Naperville'],
      base_city: 'Chicago',
      languages: ['Hindi', 'Urdu'],
      served_event_types: ['wedding', 'mehndi'],
      years_in_business: 12,
    });
    expect(text).toContain('Zara Studio');
    expect(text).toContain('photography');
    expect(text).toContain('candid');
    expect(text).toContain('videography');
    expect(text).toContain('Naperville');
    expect(text).toContain('Hindi');
    expect(text).toContain('mehndi');
    expect(text).toContain('Candid documentary weddings.');
    expect(text).toContain('12');
  });

  it('omits empty/null fields without leaving stray labels or separators', () => {
    const text = buildVendorEmbeddingText({
      business_name: 'Solo Act',
      category: 'dj',
      bio: null,
      subcategories: [],
      services: null,
      service_area: [],
      base_city: null,
      languages: null,
      served_event_types: [],
      years_in_business: null,
    });
    expect(text).toContain('Solo Act');
    expect(text).toContain('dj');
    expect(text.toLowerCase()).not.toContain('serves:');
    expect(text.toLowerCase()).not.toContain('languages:');
    expect(text).not.toContain('null');
    expect(text).not.toContain('undefined');
    expect(text.trim()).toBe(text); // no leading/trailing whitespace
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/lib/ai/embeddings.test.ts`
Expected: FAIL — `buildVendorEmbeddingText` is not exported.

- [ ] **Step 3: Implement the builder**

Add to `src/lib/ai/embeddings.ts` (above `generateEmbedding`):

```ts
export interface VendorEmbeddingInput {
  business_name: string;
  category: string | null;
  bio?: string | null;
  subcategories?: string[] | null;
  services?: string[] | null;
  service_area?: string[] | null;
  base_city?: string | null;
  languages?: string[] | null;
  served_event_types?: string[] | null;
  years_in_business?: number | null;
}

/**
 * Canonical text a vendor is embedded from. Used by BOTH the hourly cron and
 * the admin embed route so every vendor's vector is built from the same shape.
 * Widened beyond name+category+bio to include the structured facets that user
 * queries actually mention (service area, languages, event types, specialties).
 * Empty/null fields are dropped entirely — no stray labels, no "null".
 */
export function buildVendorEmbeddingText(vendor: VendorEmbeddingInput): string {
  const lines: string[] = [];
  const list = (arr: string[] | null | undefined) => (arr ?? []).filter(Boolean);

  const specialties = list(vendor.subcategories);
  lines.push([vendor.business_name, vendor.category].filter(Boolean).join(' — '));
  if (specialties.length) lines.push(`Specialties: ${specialties.join(', ')}`);

  const services = list(vendor.services);
  if (services.length) lines.push(`Services: ${services.join(', ')}`);

  const areas = list(vendor.service_area);
  const places = [vendor.base_city, ...areas].filter(Boolean);
  if (places.length) lines.push(`Serves: ${[...new Set(places)].join(', ')}`);

  const languages = list(vendor.languages);
  if (languages.length) lines.push(`Languages: ${languages.join(', ')}`);

  const events = list(vendor.served_event_types);
  if (events.length) lines.push(`Event types: ${events.join(', ')}`);

  if (typeof vendor.years_in_business === 'number' && vendor.years_in_business > 0) {
    lines.push(`${vendor.years_in_business} years in business`);
  }

  if (vendor.bio) lines.push(vendor.bio);

  return lines.join('\n').trim();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/lib/ai/embeddings.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire the cron to the shared builder**

In `src/app/api/cron/embed-vendors/route.ts`:

Replace the select (line ~34-38) so it fetches the enriched columns:

```ts
const { data: vendors, error } = await supabase
  .from('vendor_profiles')
  .select(
    'id, business_name, bio, category, subcategories, services, service_area, base_city, languages, served_event_types, years_in_business'
  )
  .is('embedding', null)
  .limit(BATCH);
```

Replace the `inputs` mapping (line ~46-48) — add the import and use the builder:

```ts
import { generateEmbeddingsBatch, buildVendorEmbeddingText } from '@/lib/ai/embeddings';
```

```ts
const inputs = vendors.map((v) => buildVendorEmbeddingText(v));
```

- [ ] **Step 6: Wire the admin route to the shared builder**

In `src/app/api/ai/embed/route.ts`:

Update the import:

```ts
import { generateEmbedding, buildVendorEmbeddingText } from '@/lib/ai/embeddings';
```

Update the select:

```ts
let query = supabase
  .from('vendor_profiles')
  .select(
    'id, business_name, bio, category, subcategories, services, service_area, base_city, languages, served_event_types, years_in_business'
  );
```

Replace the text line inside the loop:

```ts
const text = buildVendorEmbeddingText(vendor);
```

- [ ] **Step 7: Typecheck the wired routes**

Run: `npx tsc --noEmit`
Expected: no new errors. (Confirms the selected columns satisfy `VendorEmbeddingInput`.)

- [ ] **Step 8: Write the one-shot re-embed script**

`scripts/reembed-vendors.ts`:

```ts
/**
 * Re-embed every active vendor with the enriched embedding text. Run once after
 * buildVendorEmbeddingText changes shape — existing vectors are otherwise stale.
 *
 * Usage (dev):   npm run ai:reembed
 * Usage (prod):  point NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY at
 *                prod and re-run (user does this).
 * Requires OPENAI_API_KEY.
 */
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';
import { generateEmbeddingsBatch, buildVendorEmbeddingText } from '@/lib/ai/embeddings';

const CHUNK = 100;

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env');
  if (!process.env.OPENAI_API_KEY) throw new Error('Missing OPENAI_API_KEY');
  const supabase = createClient<Database>(url, key);

  const { data: vendors, error } = await supabase
    .from('vendor_profiles')
    .select(
      'id, business_name, bio, category, subcategories, services, service_area, base_city, languages, served_event_types, years_in_business'
    )
    .eq('is_active', true);
  if (error) throw error;
  if (!vendors?.length) {
    console.log('No active vendors.');
    return;
  }

  let updated = 0;
  for (let i = 0; i < vendors.length; i += CHUNK) {
    const batch = vendors.slice(i, i + CHUNK);
    const embeddings = await generateEmbeddingsBatch(batch.map((v) => buildVendorEmbeddingText(v)));
    for (let j = 0; j < batch.length; j++) {
      const { error: upErr } = await supabase
        .from('vendor_profiles')
        .update({ embedding: JSON.stringify(embeddings[j]) } as Record<string, unknown>)
        .eq('id', batch[j].id);
      if (upErr) console.error(`  ${batch[j].id}: ${upErr.message}`);
      else updated++;
    }
    console.log(`Re-embedded ${Math.min(i + CHUNK, vendors.length)}/${vendors.length}`);
  }
  console.log(`Done. Updated ${updated}/${vendors.length}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

In `package.json` `scripts`, add:

```json
"ai:reembed": "tsx --env-file-if-exists=.env.local scripts/reembed-vendors.ts"
```

- [ ] **Step 9: Re-embed dev and re-run the eval**

Run: `npm run ai:reembed` (against dev)
Then: `npm run ai:eval`
Expected: MRR / recall ≥ the Task 2 baseline. Record the new numbers in the PR. If a query regressed, note it — enrichment can shift ranking; the aggregate should improve.

- [ ] **Step 10: Commit**

```bash
git add src/lib/ai/embeddings.ts src/__tests__/lib/ai/embeddings.test.ts \
  src/app/api/cron/embed-vendors/route.ts src/app/api/ai/embed/route.ts \
  scripts/reembed-vendors.ts package.json
git commit -m "feat(ai-search): enrich + unify vendor embedding document"
```

---

### Task 4: Push category filtering into retrieval

Category is high-precision; applying it in the RPC `WHERE` (before `LIMIT`) means we retrieve the top-N _in that category_, not the top-N overall then discard. The full-text fallback and the existing TS soft-filters stay as belt-and-suspenders (so an over-strict category can't produce an empty page).

**Files:**

- Create: `supabase/migrations/00076_search_vendors_semantic_category_filter.sql`
- Modify: `src/types/database.types.ts` (RPC Args)
- Modify: `src/lib/ai/search.ts` (`semanticSearch` signature + call, and `hybridSearch` passing category)
- Test: `src/__tests__/lib/ai/search.test.ts` (new)

**Interfaces:**

- Consumes: `search_vendors_semantic(query_embedding, match_count, similarity_threshold, p_category)`.
- Produces: `semanticSearch(supabase, query, matchCount?, category?)` — new optional 4th arg `category?: string`.

- [ ] **Step 1: Write the migration**

`supabase/migrations/00076_search_vendors_semantic_category_filter.sql`:

```sql
-- Add an optional category filter to search_vendors_semantic so category is
-- applied in the WHERE clause (before LIMIT) rather than as a post-LIMIT filter
-- in TypeScript. Previously a relevant vendor ranked just past match_count was
-- unreachable for a category-scoped query. NULL p_category = no filter, so
-- existing callers are unaffected. Recreated (not ALTERed) because the return
-- shape is unchanged but the argument list grows.

DROP FUNCTION IF EXISTS search_vendors_semantic(VECTOR, INT, FLOAT);

CREATE FUNCTION search_vendors_semantic(
  query_embedding VECTOR(1536),
  match_count INT DEFAULT 10,
  similarity_threshold FLOAT DEFAULT 0.5,
  p_category TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  business_name TEXT,
  slug TEXT,
  category TEXT,
  bio TEXT,
  service_area TEXT[],
  portfolio_images TEXT[],
  instagram_handle TEXT,
  website_url TEXT,
  verified BOOLEAN,
  response_sla_hours INT,
  total_bookings INT,
  average_rating NUMERIC(3,2),
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    vp.id,
    vp.business_name,
    vp.slug,
    vp.category,
    vp.bio,
    vp.service_area,
    vp.portfolio_images,
    vp.instagram_handle,
    vp.website_url,
    vp.verified,
    vp.response_sla_hours,
    vp.total_bookings,
    vp.average_rating,
    1 - (vp.embedding <=> query_embedding) AS similarity
  FROM vendor_profiles vp
  WHERE vp.embedding IS NOT NULL
    AND 1 - (vp.embedding <=> query_embedding) > similarity_threshold
    AND (p_category IS NULL OR vp.category = p_category)
  ORDER BY similarity DESC
  LIMIT match_count;
END;
$$;
```

- [ ] **Step 2: Apply the migration to dev**

Run (dev connection per the Supabase-prod-connection memo — dev ref `lquvhjedlzubqusnfaak`):

```bash
psql "$DEV_DATABASE_URL" -f supabase/migrations/00076_search_vendors_semantic_category_filter.sql
```

Expected: `DROP FUNCTION` + `CREATE FUNCTION`, no error. (Prod is applied by the user, not here.)

- [ ] **Step 3: Hand-patch the generated types**

In `src/types/database.types.ts`, find the `search_vendors_semantic` block and change its `Args` line from:

```ts
Args: {
  query_embedding: string;
  match_count: number;
  similarity_threshold: number;
}
```

to:

```ts
        Args: {
          query_embedding: string;
          match_count: number;
          similarity_threshold: number;
          p_category?: string | null;
        };
```

- [ ] **Step 4: Write the failing test**

`src/__tests__/lib/ai/search.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';

// search.ts constructs `new OpenAI(...)` at module scope — mock the SDK so the
// import doesn't throw on a missing OPENAI_API_KEY in the test env.
vi.mock('openai', () => ({
  default: class {
    chat = { completions: { create: vi.fn() } };
    embeddings = { create: vi.fn() };
  },
}));
vi.mock('@/lib/ai/embeddings', () => ({
  generateEmbedding: vi.fn().mockResolvedValue(new Array(1536).fill(0)),
}));

import { semanticSearch } from '@/lib/ai/search';

describe('semanticSearch', () => {
  it('forwards the category to the RPC as p_category', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null });
    const supabase = { rpc } as never;

    await semanticSearch(supabase, 'punjabi dj', 40, 'dj');

    expect(rpc).toHaveBeenCalledWith(
      'search_vendors_semantic',
      expect.objectContaining({ match_count: 40, p_category: 'dj' })
    );
  });

  it('passes p_category undefined when no category is given', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null });
    const supabase = { rpc } as never;

    await semanticSearch(supabase, 'nice photos');

    const args = rpc.mock.calls[0][1] as { p_category?: string };
    expect(args.p_category).toBeUndefined();
  });
});
```

- [ ] **Step 5: Run test to verify it fails**

Run: `npx vitest run src/__tests__/lib/ai/search.test.ts`
Expected: FAIL — `semanticSearch` doesn't accept/forward `category` yet (`p_category` absent from the call).

- [ ] **Step 6: Update `semanticSearch` and `hybridSearch`**

In `src/lib/ai/search.ts`, change the `semanticSearch` signature and RPC call:

```ts
export async function semanticSearch(
  supabase: SupabaseClient<Database>,
  query: string,
  matchCount: number = 20,
  category?: string
): Promise<(VendorRow & { similarity: number })[]> {
  const embedding = await generateEmbedding(query);

  const { data, error } = await supabase.rpc('search_vendors_semantic', {
    query_embedding: JSON.stringify(embedding),
    match_count: matchCount,
    similarity_threshold: 0.15,
    p_category: category,
  });
```

(Leave the rest of `semanticSearch` — the error logging and return — unchanged.)

In `hybridSearch`, pass the parsed category and widen the candidate pool so the soft location filter still has rows to work with. Change:

```ts
let results = await semanticSearch(supabase, parsedQuery.searchText);
```

to:

```ts
let results = await semanticSearch(supabase, parsedQuery.searchText, 40, parsedQuery.category);
```

Leave the full-text fallback and the existing soft category/location filters as-is — they now act as a safety net rather than the primary category gate.

- [ ] **Step 7: Run test to verify it passes**

Run: `npx vitest run src/__tests__/lib/ai/search.test.ts`
Expected: PASS.

- [ ] **Step 8: Full typecheck + AI unit tests**

Run: `npx tsc --noEmit && npx vitest run src/__tests__/lib/ai`
Expected: no type errors; all AI tests green.

- [ ] **Step 9: Re-run the eval against dev**

Run: `npm run ai:eval`
Expected: category-scoped queries improve or hold vs. the Task 3 numbers; MRR ≥ Task 3. Record final numbers in the PR (baseline → after-enrich → after-category-filter).

- [ ] **Step 10: Commit**

```bash
git add supabase/migrations/00076_search_vendors_semantic_category_filter.sql \
  src/types/database.types.ts src/lib/ai/search.ts src/__tests__/lib/ai/search.test.ts
git commit -m "feat(ai-search): apply category filter inside semantic retrieval"
```

---

## Final verification (before PR)

- [ ] `npx vitest run src/__tests__/lib/ai` — all green.
- [ ] `npx tsc --noEmit` — clean.
- [ ] `npm run lint` — clean (matches repo CI).
- [ ] `npm run ai:eval` shows the three-stage progression (baseline → enrich → category filter) — paste the table into the PR body.
- [ ] Migration `00076` applied to **dev**; PR body flags that **prod migration + `ai:reembed` against prod are the user's to run** on merge (migration-apply policy + prod re-embed).
- [ ] PR description ends with:
  ```
  🤖 Generated with [Claude Code](https://claude.com/claude-code)
  ```

## Post-merge (user actions, documented in the PR)

1. Apply `00076` to prod.
2. Run `npm run ai:reembed` pointed at prod env (re-embeds the live catalog with the enriched text). The hourly `embed-vendors` cron only touches `embedding IS NULL` rows, so it will **not** refresh existing vectors — the one-shot script is required.

## Deferred (not in this plan)

Budget-filter wiring (`parsedQuery.budgetCents` → `vendor_packages_price_band`), RRF fusion of semantic + full-text, HNSW index, LLM-distilled embedding text, query logging for the RAG decision, and RAG/generation itself. Revisit RAG only when query logs show multi-constraint intent that ranked search serves poorly.
