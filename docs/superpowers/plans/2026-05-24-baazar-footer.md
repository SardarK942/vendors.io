# Baazar Footer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `src/components/ui/Footer.tsx` with the Direction-C editorial footer per [`2026-05-24-baazar-footer-design.md`](../specs/2026-05-24-baazar-footer-design.md) — full-bleed black hero band with cycling 4-script wordmark + in-hero newsletter signup, sitting above a cream utility band with brand blurb + 2 link columns + legal row with static lang-dots. Add `newsletter_signups` table + `POST /api/newsletter/subscribe` endpoint (stub-only, no Resend).

**Architecture:** New `Footer` server component at `src/components/layout/Footer.tsx` composes 3 sub-components under `src/components/layout/footer/`: `WordmarkCycle` (client; interval timer + IntersectionObserver + `prefers-reduced-motion`), `NewsletterForm` (client; local form state, POSTs to API route), `LangDots` (server; static glyphs). Newsletter persistence uses a new `newsletter_signups` table with insert-only RLS for anon + authenticated; the API route always returns `{ok: true}` (even on unique-violation) to avoid leaking subscription state. Layout integration moves `<Footer />` out of the `max-w-7xl` `<main>` wrapper so its bands span the viewport.

**Tech Stack:** Next.js 14 App Router · React 18 · TypeScript · Tailwind 3.4 · Supabase Postgres · zod · vitest. Wordmark fonts (Tiro Devanagari Hindi, Noto Nastaliq Urdu, Amiri, Markazi Text) added via `next/font/google` to `src/app/layout.tsx`.

**Branch:** `feat/baazar-footer` (already created, spec committed at `f2f14ba`).

**Out of scope (deferred):** Resend integration, locale switching, "Coming Soon" link affordance, footer in dashboard/root layouts, abuse rate-limiting.

---

## File Structure

| File                                                      | Action                 | Responsibility                                                                                                              |
| --------------------------------------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `src/app/layout.tsx`                                      | **Modify**             | Add 4 wordmark fonts (`Tiro Devanagari Hindi`, `Noto Nastaliq Urdu`, `Amiri`, `Markazi Text`) to `next/font` loader.        |
| `supabase/migrations/00039_create_newsletter_signups.sql` | **Create**             | New table + citext extension + insert-only RLS policy. Applied to dev DB during Task 2.                                     |
| `src/lib/newsletter/validation.ts`                        | **Create**             | Zod schema for the API request body. Exported as `newsletterSubscribeSchema`.                                               |
| `src/__tests__/lib/newsletter/validation.test.ts`         | **Create**             | Unit tests for the zod schema (valid/invalid email, default source, allowed source enum).                                   |
| `src/app/api/newsletter/subscribe/route.ts`               | **Create**             | `POST` handler. Validates body, upserts into table, returns `{ok: true}` always (idempotent for privacy).                   |
| `src/__tests__/api/newsletter-subscribe.test.ts`          | **Create**             | Unit tests for the API route (200 + insert on valid, 200 on dup, 400 on invalid, 500 on network).                           |
| `src/components/layout/footer/wordmark-cycle-helpers.ts`  | **Create**             | Pure helper: `WORDMARK_SCRIPTS` constant + `nextScriptIndex(i)` (so component logic is testable without DOM).               |
| `src/__tests__/lib/wordmark-cycle-helpers.test.ts`        | **Create**             | Tests the helper (loops 0→1→2→3→0, returns correct shape for all 4 scripts).                                                |
| `src/components/layout/footer/WordmarkCycle.tsx`          | **Create**             | Client component: renders cycling wordmark with `useEffect` interval, IntersectionObserver pause, reduced-motion guard.     |
| `src/components/layout/footer/NewsletterForm.tsx`         | **Create**             | Client component: email pill + hot-pink arrow orb + 5 visual states (default/submitting/success/error-format/error-server). |
| `src/components/layout/footer/LangDots.tsx`               | **Create**             | Server component: 4 static script glyphs with `title=` attrs, no interactivity.                                             |
| `src/components/layout/Footer.tsx`                        | **Create**             | Top-level server component. Composes HeroBand + BodyBand with all sub-components. Full-bleed (no `max-w` constraint).       |
| `src/components/ui/Footer.tsx`                            | **Delete**             | Old shadcn-baseline footer, no longer used.                                                                                 |
| `src/app/(marketplace)/layout.tsx`                        | **Modify**             | Update import path from `@/components/ui/Footer` → `@/components/layout/Footer`. JSX placement unchanged.                   |
| `DESIGN.md`                                               | **Modify frontmatter** | Add `footer:` entry to `components:` block.                                                                                 |

---

## Task 1: Add wordmark fonts to next/font

**Files:**

- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Add the 4 wordmark font loaders**

Read `src/app/layout.tsx`. After the `DM_Mono` import line, the existing imports look like `import { Spectral, Schibsted_Grotesk, DM_Mono } from 'next/font/google';`. Change the import line to:

```ts
import {
  Spectral,
  Schibsted_Grotesk,
  DM_Mono,
  Tiro_Devanagari_Hindi,
  Noto_Nastaliq_Urdu,
  Amiri,
  Markazi_Text,
} from 'next/font/google';
```

After the existing `dmMono` loader block, add four new loaders:

```ts
// Wordmark cycle fonts (DESIGN.md typography.wordmark-*) — used by the footer
// WordmarkCycle component and any future hero wordmark surfaces.
const tiroDevanagari = Tiro_Devanagari_Hindi({
  subsets: ['latin', 'devanagari'],
  variable: '--font-wordmark-deva',
  weight: ['400'],
  style: ['normal', 'italic'],
  display: 'swap',
});

const notoNastaliqUrdu = Noto_Nastaliq_Urdu({
  subsets: ['arabic'],
  variable: '--font-wordmark-nastaliq',
  weight: ['400', '700'],
  display: 'swap',
});

const amiri = Amiri({
  subsets: ['arabic'],
  variable: '--font-wordmark-naskh',
  weight: ['400', '700'],
  style: ['normal', 'italic'],
  display: 'swap',
});

const markaziText = Markazi_Text({
  subsets: ['arabic'],
  variable: '--font-wordmark-persian',
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});
```

Then update the `<body>` className to include the new font variables. Find the existing line:

```tsx
<body
  className={`${spectral.variable} ${schibstedGrotesk.variable} ${dmMono.variable} antialiased`}
>
```

Replace with:

```tsx
<body
  className={`${spectral.variable} ${schibstedGrotesk.variable} ${dmMono.variable} ${tiroDevanagari.variable} ${notoNastaliqUrdu.variable} ${amiri.variable} ${markaziText.variable} antialiased`}
>
```

- [ ] **Step 2: Add Tailwind font-family aliases for the wordmark fonts**

Read `tailwind.config.ts`. Find the `fontFamily:` block (under `theme.extend`). After the existing `serif:` line, add four new entries:

```ts
'wordmark-deva': ['var(--font-wordmark-deva)', 'serif'],
'wordmark-nastaliq': ['var(--font-wordmark-nastaliq)', 'serif'],
'wordmark-naskh': ['var(--font-wordmark-naskh)', 'serif'],
'wordmark-persian': ['var(--font-wordmark-persian)', 'serif'],
```

- [ ] **Step 3: Verify build still types**

```bash
npm run typecheck
```

Expected: no new errors beyond the pre-existing `.next/types/.../setup/layout.ts` error.

- [ ] **Step 4: Commit**

```bash
git add src/app/layout.tsx tailwind.config.ts
git commit -m "feat(footer): load wordmark cycle fonts via next/font"
```

---

## Task 2: Create migration 00039 and apply to dev DB

**Files:**

- Create: `supabase/migrations/00039_create_newsletter_signups.sql`

- [ ] **Step 1: Write the migration**

Write to `supabase/migrations/00039_create_newsletter_signups.sql`:

```sql
-- newsletter_signups: capture-only table for "The Bazaar Letter" footer form
-- and any future signup surfaces (homepage hero, post-booking, etc.). Idempotent
-- on email (UNIQUE constraint). RLS allows INSERT for anon + authenticated;
-- SELECT/UPDATE/DELETE are service-role only so the table never reveals which
-- emails are subscribed (privacy + anti-enumeration).

CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE newsletter_signups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email citext NOT NULL UNIQUE,
  source text NOT NULL DEFAULT 'footer',
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX newsletter_signups_created_at_idx ON newsletter_signups (created_at DESC);

ALTER TABLE newsletter_signups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone can subscribe"
  ON newsletter_signups
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);
```

- [ ] **Step 2: Apply to dev DB**

Ask the controller for the dev DB password if not present in env. Run:

```bash
PGPASSWORD='<dev-password>' psql \
  -h db.lquvhjedlzubqusnfaak.supabase.co \
  -p 5432 -U postgres -d postgres \
  -v ON_ERROR_STOP=1 \
  -f supabase/migrations/00039_create_newsletter_signups.sql
```

Expected output:

```
CREATE EXTENSION
CREATE TABLE
CREATE INDEX
ALTER TABLE
CREATE POLICY
```

- [ ] **Step 3: Sanity check the table + RLS**

```bash
PGPASSWORD='<dev-password>' psql \
  -h db.lquvhjedlzubqusnfaak.supabase.co \
  -p 5432 -U postgres -d postgres \
  -c "\d newsletter_signups" \
  -c "SELECT polname, polcmd FROM pg_policy WHERE polrelid = 'newsletter_signups'::regclass;"
```

Expected: table description shows `id/email/source/user_id/created_at` columns; one INSERT policy named `anyone can subscribe`.

- [ ] **Step 4: Regenerate Supabase types so newsletter_signups appears in `Database` type**

```bash
npx supabase gen types typescript --project-id lquvhjedlzubqusnfaak > src/types/database.types.ts
```

If the CLI is not installed or auth is missing, append the type manually to `src/types/database.types.ts`. Inside the `public.Tables` object (alphabetically after `match_signals` or wherever it belongs), add:

```ts
newsletter_signups: {
  Row: {
    id: string;
    email: string;
    source: string;
    user_id: string | null;
    created_at: string;
  };
  Insert: {
    id?: string;
    email: string;
    source?: string;
    user_id?: string | null;
    created_at?: string;
  };
  Update: {
    id?: string;
    email?: string;
    source?: string;
    user_id?: string | null;
    created_at?: string;
  };
  Relationships: [
    {
      foreignKeyName: 'newsletter_signups_user_id_fkey';
      columns: ['user_id'];
      isOneToOne: false;
      referencedRelation: 'users';
      referencedColumns: ['id'];
    }
  ];
};
```

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/00039_create_newsletter_signups.sql src/types/database.types.ts
git commit -m "feat(footer): newsletter_signups table + insert-only RLS"
```

---

## Task 3: Newsletter validation schema + tests

**Files:**

- Create: `src/lib/newsletter/validation.ts`
- Create: `src/__tests__/lib/newsletter/validation.test.ts`

- [ ] **Step 1: Write the failing tests**

Write to `src/__tests__/lib/newsletter/validation.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { newsletterSubscribeSchema, type NewsletterSource } from '@/lib/newsletter/validation';

describe('newsletterSubscribeSchema', () => {
  it('accepts a valid email with default source', () => {
    const r = newsletterSubscribeSchema.safeParse({ email: 'jane@example.com' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.source).toBe('footer');
  });

  it('accepts a valid email with explicit allowed source', () => {
    const r = newsletterSubscribeSchema.safeParse({ email: 'jane@example.com', source: 'hero' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.source).toBe('hero');
  });

  it('rejects an invalid email', () => {
    const r = newsletterSubscribeSchema.safeParse({ email: 'not-an-email' });
    expect(r.success).toBe(false);
  });

  it('rejects an empty email', () => {
    const r = newsletterSubscribeSchema.safeParse({ email: '' });
    expect(r.success).toBe(false);
  });

  it('rejects email longer than 254 chars', () => {
    const long = 'a'.repeat(250) + '@x.io'; // 255 chars
    const r = newsletterSubscribeSchema.safeParse({ email: long });
    expect(r.success).toBe(false);
  });

  it('rejects a source not in the allowlist', () => {
    const r = newsletterSubscribeSchema.safeParse({
      email: 'jane@example.com',
      source: 'random-source',
    });
    expect(r.success).toBe(false);
  });

  it('exports NewsletterSource union', () => {
    // Compile-time check via assignment
    const sources: NewsletterSource[] = ['footer', 'hero', 'post-booking'];
    expect(sources).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- src/__tests__/lib/newsletter/validation.test.ts
```

Expected: FAIL with `Cannot find module '@/lib/newsletter/validation'`.

- [ ] **Step 3: Write the validation module**

Write to `src/lib/newsletter/validation.ts`:

```ts
import { z } from 'zod';

const SOURCE_ALLOWLIST = ['footer', 'hero', 'post-booking'] as const;

export type NewsletterSource = (typeof SOURCE_ALLOWLIST)[number];

export const newsletterSubscribeSchema = z.object({
  email: z.string().min(1).email().max(254),
  source: z.enum(SOURCE_ALLOWLIST).default('footer'),
});

export type NewsletterSubscribeInput = z.infer<typeof newsletterSubscribeSchema>;
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- src/__tests__/lib/newsletter/validation.test.ts
```

Expected: 7/7 passing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/newsletter/validation.ts src/__tests__/lib/newsletter/validation.test.ts
git commit -m "feat(footer): newsletter zod schema + unit tests"
```

---

## Task 4: Newsletter API route + tests

**Files:**

- Create: `src/app/api/newsletter/subscribe/route.ts`
- Create: `src/__tests__/api/newsletter-subscribe.test.ts`

- [ ] **Step 1: Write the failing tests**

Write to `src/__tests__/api/newsletter-subscribe.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(),
}));

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { POST } from '@/app/api/newsletter/subscribe/route';

function makePostRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/newsletter/subscribe', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

function buildSupabase(opts: {
  user?: { id: string } | null;
  insertError?: { code: string; message: string } | null;
}) {
  const insert = vi.fn().mockResolvedValue({ data: null, error: opts.insertError ?? null });
  return {
    insert,
    client: {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: opts.user ?? null }, error: null }),
      },
      from: vi.fn(() => ({ insert })),
    },
  };
}

describe('POST /api/newsletter/subscribe', () => {
  const mockCreateClient = createServerSupabaseClient as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 + inserts on valid anonymous submission', async () => {
    const sb = buildSupabase({ user: null, insertError: null });
    mockCreateClient.mockResolvedValueOnce(sb.client);

    const res = await POST(makePostRequest({ email: 'jane@example.com' }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ ok: true });
    expect(sb.insert).toHaveBeenCalledWith({
      email: 'jane@example.com',
      source: 'footer',
      user_id: null,
    });
  });

  it('returns 200 + sets user_id when authenticated', async () => {
    const sb = buildSupabase({ user: { id: 'u-1' }, insertError: null });
    mockCreateClient.mockResolvedValueOnce(sb.client);

    const res = await POST(makePostRequest({ email: 'jane@example.com', source: 'hero' }));
    expect(res.status).toBe(200);
    expect(sb.insert).toHaveBeenCalledWith({
      email: 'jane@example.com',
      source: 'hero',
      user_id: 'u-1',
    });
  });

  it('returns 200 (idempotent) on unique-violation', async () => {
    const sb = buildSupabase({
      user: null,
      insertError: { code: '23505', message: 'duplicate key value violates unique constraint' },
    });
    mockCreateClient.mockResolvedValueOnce(sb.client);

    const res = await POST(makePostRequest({ email: 'jane@example.com' }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ ok: true });
  });

  it('returns 400 on invalid email', async () => {
    const res = await POST(makePostRequest({ email: 'not-an-email' }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.ok).toBe(false);
  });

  it('returns 400 on missing body', async () => {
    const res = await POST(makePostRequest({}));
    expect(res.status).toBe(400);
  });

  it('returns 500 on non-unique-violation DB error', async () => {
    const sb = buildSupabase({
      user: null,
      insertError: { code: '42P01', message: 'relation does not exist' },
    });
    mockCreateClient.mockResolvedValueOnce(sb.client);

    const res = await POST(makePostRequest({ email: 'jane@example.com' }));
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json).toEqual({ ok: false });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- src/__tests__/api/newsletter-subscribe.test.ts
```

Expected: FAIL with `Cannot find module '@/app/api/newsletter/subscribe/route'`.

- [ ] **Step 3: Write the API route**

Write to `src/app/api/newsletter/subscribe/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import { newsletterSubscribeSchema } from '@/lib/newsletter/validation';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 });
  }

  const parsed = newsletterSubscribeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 });
  }

  const { email, source } = parsed.data;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from('newsletter_signups').insert({
    email,
    source,
    user_id: user?.id ?? null,
  });

  // Idempotent: treat unique-violation as success so we never leak
  // which addresses are already subscribed.
  if (error && error.code !== '23505') {
    logger.error('newsletter signup failed', error, { source, email_domain: email.split('@')[1] });
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  logger.info('newsletter_signup_submitted', { source, was_duplicate: error?.code === '23505' });
  return NextResponse.json({ ok: true }, { status: 200 });
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- src/__tests__/api/newsletter-subscribe.test.ts
```

Expected: 6/6 passing.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/newsletter/subscribe/route.ts src/__tests__/api/newsletter-subscribe.test.ts
git commit -m "feat(footer): POST /api/newsletter/subscribe (idempotent)"
```

---

## Task 5: WordmarkCycle pure helpers + tests

**Files:**

- Create: `src/components/layout/footer/wordmark-cycle-helpers.ts`
- Create: `src/__tests__/lib/wordmark-cycle-helpers.test.ts`

- [ ] **Step 1: Write the failing tests**

Write to `src/__tests__/lib/wordmark-cycle-helpers.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  WORDMARK_SCRIPTS,
  nextScriptIndex,
} from '@/components/layout/footer/wordmark-cycle-helpers';

describe('WORDMARK_SCRIPTS', () => {
  it('has four scripts in fixed order: deva → nastaliq → naskh → persian', () => {
    expect(WORDMARK_SCRIPTS.map((s) => s.key)).toEqual(['deva', 'nastaliq', 'naskh', 'persian']);
  });

  it('each script has glyph + cssFamily + a11yLabel', () => {
    for (const s of WORDMARK_SCRIPTS) {
      expect(typeof s.glyph).toBe('string');
      expect(s.glyph.length).toBeGreaterThan(0);
      expect(typeof s.cssFamily).toBe('string');
      expect(typeof s.a11yLabel).toBe('string');
    }
  });

  it('uses the Devanagari font variable for deva', () => {
    const deva = WORDMARK_SCRIPTS.find((s) => s.key === 'deva');
    expect(deva?.cssFamily).toContain('--font-wordmark-deva');
  });
});

describe('nextScriptIndex', () => {
  it('loops 0 → 1 → 2 → 3 → 0', () => {
    expect(nextScriptIndex(0)).toBe(1);
    expect(nextScriptIndex(1)).toBe(2);
    expect(nextScriptIndex(2)).toBe(3);
    expect(nextScriptIndex(3)).toBe(0);
  });

  it('handles out-of-range index gracefully (modulo)', () => {
    expect(nextScriptIndex(4)).toBe(1);
    expect(nextScriptIndex(7)).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- src/__tests__/lib/wordmark-cycle-helpers.test.ts
```

Expected: FAIL with `Cannot find module '@/components/layout/footer/wordmark-cycle-helpers'`.

- [ ] **Step 3: Write the helpers**

First, ensure the directory exists. Then write to `src/components/layout/footer/wordmark-cycle-helpers.ts`:

```ts
/**
 * Pure helpers for the WordmarkCycle component. Kept isolated from the React
 * component so the rotation order + script metadata are testable without DOM
 * or React internals.
 */

export type WordmarkScriptKey = 'deva' | 'nastaliq' | 'naskh' | 'persian';

export interface WordmarkScript {
  key: WordmarkScriptKey;
  /** The word "baazar" rendered in this script's native glyphs. */
  glyph: string;
  /** CSS font-family stack referencing the next/font variable from src/app/layout.tsx. */
  cssFamily: string;
  /** Screen-reader description for the script (currently unused — outer h2 carries the label). */
  a11yLabel: string;
  /** Per-script font-size multiplier vs the base wordmark size. Nastaliq is shorter so renders bigger visually at the same size. */
  scaleMultiplier: number;
}

export const WORDMARK_SCRIPTS: readonly WordmarkScript[] = [
  {
    key: 'deva',
    glyph: 'बाज़ार',
    cssFamily: 'var(--font-wordmark-deva), serif',
    a11yLabel: 'Hindi (Devanagari)',
    scaleMultiplier: 1,
  },
  {
    key: 'nastaliq',
    glyph: 'بازار',
    cssFamily: 'var(--font-wordmark-nastaliq), serif',
    a11yLabel: 'Urdu (Nastaliq)',
    scaleMultiplier: 0.85,
  },
  {
    key: 'naskh',
    glyph: 'بازار',
    cssFamily: 'var(--font-wordmark-naskh), serif',
    a11yLabel: 'Arabic (Naskh)',
    scaleMultiplier: 1,
  },
  {
    key: 'persian',
    glyph: 'بازار',
    cssFamily: 'var(--font-wordmark-persian), serif',
    a11yLabel: 'Persian / Farsi',
    scaleMultiplier: 1,
  },
];

export function nextScriptIndex(current: number): number {
  return (current + 1) % WORDMARK_SCRIPTS.length;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- src/__tests__/lib/wordmark-cycle-helpers.test.ts
```

Expected: 5/5 passing.

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/footer/wordmark-cycle-helpers.ts src/__tests__/lib/wordmark-cycle-helpers.test.ts
git commit -m "feat(footer): wordmark cycle script constants + index helper"
```

---

## Task 6: WordmarkCycle client component

**Files:**

- Create: `src/components/layout/footer/WordmarkCycle.tsx`

This component has no unit tests (DOM-heavy, IntersectionObserver-based). Visual verification in Task 11 covers it.

- [ ] **Step 1: Write the component**

Write to `src/components/layout/footer/WordmarkCycle.tsx`:

```tsx
'use client';

import * as React from 'react';
import { WORDMARK_SCRIPTS, nextScriptIndex } from './wordmark-cycle-helpers';

const HOLD_MS = 3500; // motion.cycle-hold
const FADE_MS = 400; // motion.cycle-fade

export interface WordmarkCycleProps {
  /** Tailwind sizing classes for the outer wrapper. Defaults to footer-band scale. */
  className?: string;
}

/**
 * Cycles "baazar" through Devanagari → Nastaliq → Naskh → Persian on a
 * 3.5s hold + 400ms crossfade. Pauses when offscreen (IntersectionObserver)
 * and when prefers-reduced-motion is set (stays on Devanagari).
 *
 * Renders Devanagari statically on the server; the cycle starts after hydration.
 */
export function WordmarkCycle({ className }: WordmarkCycleProps) {
  const [index, setIndex] = React.useState(0);
  const [opacity, setOpacity] = React.useState(1);
  const wrapperRef = React.useRef<HTMLHeadingElement | null>(null);
  const visibleRef = React.useRef(false);
  const indexRef = React.useRef(0);

  React.useEffect(() => {
    indexRef.current = index;
  }, [index]);

  React.useEffect(() => {
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return;

    const el = wrapperRef.current;
    if (!el) return;

    let interval: ReturnType<typeof setInterval> | null = null;
    let fadeTimeout: ReturnType<typeof setTimeout> | null = null;

    const tick = () => {
      if (!visibleRef.current) return;
      setOpacity(0);
      fadeTimeout = setTimeout(() => {
        const next = nextScriptIndex(indexRef.current);
        setIndex(next);
        setOpacity(1);
      }, FADE_MS);
    };

    const start = () => {
      if (interval) return;
      interval = setInterval(tick, HOLD_MS + FADE_MS);
    };
    const stop = () => {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
      if (fadeTimeout) {
        clearTimeout(fadeTimeout);
        fadeTimeout = null;
      }
    };

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          visibleRef.current = e.isIntersecting;
          if (e.isIntersecting) start();
          else stop();
        });
      },
      { threshold: 0.1 }
    );
    io.observe(el);

    return () => {
      io.disconnect();
      stop();
    };
  }, []);

  const script = WORDMARK_SCRIPTS[index];

  return (
    <h2
      ref={wrapperRef}
      aria-label="Baazar"
      className={
        className ??
        'm-0 text-[clamp(60px,16vw,200px)] font-normal leading-[0.85] tracking-[-0.03em] text-cream'
      }
    >
      <span
        aria-hidden="true"
        className="inline-block transition-opacity"
        style={{
          opacity,
          transitionDuration: `${FADE_MS}ms`,
          transitionTimingFunction: 'cubic-bezier(.22,1,.36,1)',
          fontFamily: script.cssFamily,
          fontSize: `${script.scaleMultiplier}em`,
        }}
      >
        {script.glyph}
        <span className="text-hot-pink">.</span>
      </span>
    </h2>
  );
}
```

- [ ] **Step 2: Verify typecheck**

```bash
npm run typecheck
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/footer/WordmarkCycle.tsx
git commit -m "feat(footer): WordmarkCycle client component"
```

---

## Task 7: NewsletterForm client component

**Files:**

- Create: `src/components/layout/footer/NewsletterForm.tsx`

- [ ] **Step 1: Write the component**

Write to `src/components/layout/footer/NewsletterForm.tsx`:

```tsx
'use client';

import * as React from 'react';
import { ArrowRight, Check, Loader2 } from 'lucide-react';
import { newsletterSubscribeSchema } from '@/lib/newsletter/validation';

type FormState =
  | { kind: 'default' }
  | { kind: 'submitting' }
  | { kind: 'success' }
  | { kind: 'error-format'; message: string }
  | { kind: 'error-server'; message: string };

const SUCCESS_RESET_MS = 5000;

export function NewsletterForm() {
  const [email, setEmail] = React.useState('');
  const [state, setState] = React.useState<FormState>({ kind: 'default' });
  const resetTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    return () => {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (state.kind === 'submitting' || state.kind === 'success') return;

    const parsed = newsletterSubscribeSchema.safeParse({ email: email.trim() });
    if (!parsed.success) {
      setState({ kind: 'error-format', message: "Doesn't look right — try again." });
      return;
    }

    setState({ kind: 'submitting' });
    try {
      const res = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: parsed.data.email, source: 'footer' }),
      });
      if (!res.ok) {
        setState({ kind: 'error-server', message: 'Something glitched — try once more.' });
        return;
      }
      setState({ kind: 'success' });
      resetTimerRef.current = setTimeout(() => {
        setEmail('');
        setState({ kind: 'default' });
      }, SUCCESS_RESET_MS);
    } catch {
      setState({ kind: 'error-server', message: 'Something glitched — try once more.' });
    }
  };

  const submitting = state.kind === 'submitting';
  const success = state.kind === 'success';
  const isError = state.kind === 'error-format' || state.kind === 'error-server';
  const errorMessage = isError ? state.message : '';

  return (
    <form
      className="relative flex max-w-[480px] flex-1 items-center gap-2.5 md:ml-auto"
      onSubmit={handleSubmit}
    >
      <label htmlFor="footer-newsletter-email" className="sr-only">
        Email address
      </label>
      <input
        id="footer-newsletter-email"
        type="email"
        autoComplete="email"
        placeholder={success ? 'Subscribed — keep an eye out.' : 'you@email.com'}
        value={success ? '' : email}
        onChange={(e) => {
          setEmail(e.target.value);
          if (isError) setState({ kind: 'default' });
        }}
        disabled={submitting || success}
        aria-invalid={isError || undefined}
        aria-describedby={isError ? 'footer-newsletter-error' : undefined}
        className={[
          'flex-1 rounded-full border bg-cream/[0.06] px-4 py-3 text-sm text-cream',
          'transition-colors duration-200 placeholder:text-cream/45 focus:outline-none',
          'focus-visible:ring-2 focus-visible:ring-hot-pink focus-visible:ring-offset-2 focus-visible:ring-offset-ink',
          isError ? 'border-haldi/60' : 'border-cream/[0.16] focus:border-hot-pink',
          submitting ? 'opacity-60' : '',
          success ? 'text-haldi placeholder:text-haldi' : '',
        ].join(' ')}
      />
      <button
        type="submit"
        aria-label="Subscribe to The Bazaar Letter"
        disabled={submitting || success}
        className={[
          'flex h-10 w-10 flex-none items-center justify-center rounded-full bg-hot-pink text-cream',
          'ease-[cubic-bezier(.22,1,.36,1)] transition-transform duration-200',
          'hover:scale-[1.06] active:scale-[0.96] motion-reduce:hover:scale-100',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hot-pink focus-visible:ring-offset-2 focus-visible:ring-offset-ink',
        ].join(' ')}
      >
        {submitting ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : success ? (
          <Check className="h-4 w-4" aria-hidden="true" />
        ) : (
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        )}
      </button>
      <p
        id="footer-newsletter-error"
        role={isError ? 'alert' : undefined}
        aria-live="polite"
        className={[
          'absolute left-4 top-full mt-1.5 text-xs text-haldi transition-opacity duration-200',
          isError ? 'opacity-100' : 'opacity-0',
        ].join(' ')}
      >
        {errorMessage}
      </p>
    </form>
  );
}
```

- [ ] **Step 2: Verify typecheck**

```bash
npm run typecheck
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/footer/NewsletterForm.tsx
git commit -m "feat(footer): NewsletterForm client component with 5 states"
```

---

## Task 8: LangDots server component + Footer composition

**Files:**

- Create: `src/components/layout/footer/LangDots.tsx`
- Create: `src/components/layout/Footer.tsx`

- [ ] **Step 1: Write LangDots**

Write to `src/components/layout/footer/LangDots.tsx`:

```tsx
import { WORDMARK_SCRIPTS } from './wordmark-cycle-helpers';

/**
 * Four static script glyphs in the footer legal row. Passive cultural
 * signature — no interactivity, no hover, no locale switching. Devanagari
 * is rendered as "active" (ink + bold).
 */
export function LangDots() {
  return (
    <div className="flex items-center gap-[18px]" aria-label="Scripts">
      {WORDMARK_SCRIPTS.map((s) => {
        const isActive = s.key === 'deva';
        // Nastaliq has more vertical density — render slightly smaller for visual parity.
        const sizeClass =
          s.key === 'nastaliq' ? 'text-xs' : s.key === 'persian' ? 'text-base' : 'text-sm';
        return (
          <span
            key={s.key}
            title={s.a11yLabel}
            className={`leading-none ${sizeClass} ${
              isActive ? 'font-semibold text-ink' : 'text-ink-soft'
            }`}
            style={{ fontFamily: s.cssFamily }}
          >
            {s.glyph}
          </span>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Write Footer composition**

Write to `src/components/layout/Footer.tsx`:

```tsx
import { WordmarkCycle } from './footer/WordmarkCycle';
import { NewsletterForm } from './footer/NewsletterForm';
import { LangDots } from './footer/LangDots';

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="bg-cream text-ink">
      {/* === Black hero band === */}
      <div className="bg-ink text-cream">
        <div className="relative mx-auto max-w-7xl px-6 pb-8 pt-12 md:px-14 md:pb-12 md:pt-24">
          <p className="static mb-4 text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-soft md:absolute md:right-14 md:top-12 md:mb-0">
            Made in <span className="text-haldi">Chicago</span>
          </p>

          <WordmarkCycle />

          <div className="mt-8 flex flex-col items-stretch gap-4 border-t border-cream/[0.12] pt-6 md:flex-row md:items-center md:gap-6">
            <div className="flex items-baseline gap-3 whitespace-nowrap">
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-soft">
                The Bazaar Letter
              </span>
              <em className="font-serif text-[15px] font-medium italic text-cream">
                monthly, no noise
              </em>
            </div>
            <NewsletterForm />
          </div>
        </div>
      </div>

      {/* === Cream body band === */}
      <div className="bg-cream">
        <div className="mx-auto max-w-7xl px-6 pb-6 pt-12 md:px-14 md:pb-8 md:pt-16">
          <div className="grid grid-cols-1 gap-8 pb-10 lg:grid-cols-[1.5fr_1fr_1fr] lg:gap-14">
            <div>
              <h4 className="m-0 mb-3 font-serif text-2xl font-extrabold tracking-[-0.01em] text-ink">
                baazar<span className="text-hot-pink">.</span>
              </h4>
              <p className="m-0 max-w-[320px] text-sm leading-[1.55] text-ink-muted">
                Chicago&rsquo;s marketplace for South Asian wedding vendors. Discover, compare, and
                book with confidence.
              </p>
            </div>
            <div>
              <h5 className="mb-3.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo">
                For vendors
              </h5>
              <a
                href="/signup"
                className="block py-[5px] text-sm text-ink transition-colors duration-150 hover:text-indigo"
              >
                List your business
              </a>
              <a
                href="/dashboard"
                className="block py-[5px] text-sm text-ink transition-colors duration-150 hover:text-indigo"
              >
                Vendor dashboard
              </a>
            </div>
            <div>
              <h5 className="mb-3.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo">
                Company
              </h5>
              <a
                href="/terms"
                className="block py-[5px] text-sm text-ink transition-colors duration-150 hover:text-indigo"
              >
                Terms
              </a>
              <a
                href="/privacy"
                className="block py-[5px] text-sm text-ink transition-colors duration-150 hover:text-indigo"
              >
                Privacy
              </a>
              <a
                href="mailto:hello@baazar.io"
                className="block py-[5px] text-sm text-ink transition-colors duration-150 hover:text-indigo"
              >
                Contact
              </a>
            </div>
          </div>

          {/* Legal band */}
          <div className="flex flex-col items-start justify-between gap-4 border-t border-hairline pt-6 md:flex-row md:items-center">
            <div className="flex flex-wrap items-center gap-[18px] text-xs text-ink-soft">
              <span>&copy; {year} Baazar Marketplace</span>
              <a
                href="/terms"
                className="text-ink-soft transition-colors duration-150 hover:text-ink"
              >
                Terms
              </a>
              <a
                href="/privacy"
                className="text-ink-soft transition-colors duration-150 hover:text-ink"
              >
                Privacy
              </a>
              <a
                href="mailto:hello@baazar.io"
                className="text-ink-soft transition-colors duration-150 hover:text-ink"
              >
                Contact
              </a>
            </div>
            <LangDots />
          </div>
        </div>
      </div>
    </footer>
  );
}
```

- [ ] **Step 3: Verify typecheck**

```bash
npm run typecheck
```

Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/footer/LangDots.tsx src/components/layout/Footer.tsx
git commit -m "feat(footer): LangDots + Footer composition (cream + black bands)"
```

---

## Task 9: Layout integration + delete old footer

**Files:**

- Modify: `src/app/(marketplace)/layout.tsx`
- Delete: `src/components/ui/Footer.tsx`

- [ ] **Step 1: Update the marketplace layout import**

Read `src/app/(marketplace)/layout.tsx`. The current file is:

```tsx
import { Navbar } from '@/components/ui/Navbar';
import { Footer } from '@/components/ui/Footer';

export default function MarketplaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 sm:px-6 lg:px-8">{children}</main>
      <Footer />
    </div>
  );
}
```

Change the Footer import only. The new file is:

```tsx
import { Navbar } from '@/components/ui/Navbar';
import { Footer } from '@/components/layout/Footer';

export default function MarketplaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 sm:px-6 lg:px-8">{children}</main>
      <Footer />
    </div>
  );
}
```

- [ ] **Step 2: Verify no other call sites import the old Footer**

```bash
grep -rn "from '@/components/ui/Footer'" src/ || echo "No remaining imports"
grep -rn "from \"@/components/ui/Footer\"" src/ || echo "No remaining imports"
```

Expected: both grep commands print "No remaining imports".

- [ ] **Step 3: Delete the old Footer file**

```bash
git rm src/components/ui/Footer.tsx
```

- [ ] **Step 4: Run typecheck + lint + tests**

```bash
npm run typecheck && npm run lint && npm test
```

Expected: typecheck clean (only pre-existing setup/layout error), lint clean (only pre-existing warnings), all newsletter tests pass, pre-existing failures unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/app/(marketplace)/layout.tsx
git commit -m "feat(footer): wire new Footer into marketplace layout, remove old"
```

---

## Task 10: Visual verification (manual)

**Files:** none (browser-only)

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```

Wait for `Ready in <time>` line. Visit `http://localhost:3000/vendors`.

- [ ] **Step 2: Scroll to footer and verify**

Confirm all of the following:

1. **Black hero band** spans full viewport width (no max-width pinch). Background is `#1B1414`.
2. **Tagline** "MADE IN CHICAGO" appears top-right of the hero band on desktop, with "CHICAGO" in haldi yellow.
3. **Wordmark cycle:** giant `बाज़ार.` renders initially. After ~3.5s, fades to `بازار.` (Nastaliq). Cycles through 4 scripts: Devanagari → Nastaliq → Naskh → Persian → loop. The trailing dot `.` is always hot-pink.
4. **Newsletter row** below the wordmark, separated by a thin hairline. Label reads "THE BAZAAR LETTER monthly, no noise" with "monthly, no noise" in Spectral italic.
5. **Email input:** pill shape, dark cream-tinted background, placeholder cream/45.
6. **Arrow orb:** 40px hot-pink circle. Hover: scales slightly (1.06x). Focus shows pink ring.

- [ ] **Step 3: Test newsletter states**

In the dev browser:

1. Submit empty form → error helper text appears below input ("Doesn't look right — try again."), border turns haldi-tinted.
2. Type `notanemail` and submit → same error state.
3. Type `test@example.com` and submit → orb shows spinner briefly, then check icon. Input value becomes "Subscribed — keep an eye out." in haldi color. After 5s, resets to default.
4. Submit `test@example.com` AGAIN → same success path (idempotent — even though the row already exists in `newsletter_signups`).
5. Verify in dev DB:
   ```bash
   PGPASSWORD='<dev-password>' psql -h db.lquvhjedlzubqusnfaak.supabase.co -p 5432 -U postgres -d postgres -c "SELECT email, source, created_at FROM newsletter_signups ORDER BY created_at DESC LIMIT 5;"
   ```
   Expected: `test@example.com` row exists (only once, despite multiple submits).

- [ ] **Step 4: Verify body band + legal row**

1. **Cream body band** with 3 columns at desktop: brand blurb (left, wider) · For vendors · Company.
2. **Column kickers** ("FOR VENDORS", "COMPANY") in indigo, uppercase, letter-spaced.
3. **Links** clickable, hover color changes from ink to indigo.
4. **Legal row** at bottom: `© 2026 Baazar Marketplace · Terms · Privacy · Contact` on left, 4-script lang-dots on right. Devanagari (first dot) is ink/bold, others are ink-soft.
5. Hover a lang-dot → no interactivity (no hover state, just `title` tooltip on browser hover).

- [ ] **Step 5: Test mobile (under 720px)**

Resize browser to 375px wide:

1. Tagline moves above wordmark (no longer absolute top-right).
2. Wordmark scales down (~60px).
3. Newsletter row stacks: label on top, form below full-width.
4. Body columns stack to 1 column.
5. Legal row stacks: links row first, lang-dots row second.

- [ ] **Step 6: Test prefers-reduced-motion**

In Chrome DevTools → Rendering tab → "Emulate CSS media feature prefers-reduced-motion" → "reduce". Reload `/vendors`. Wordmark should NOT cycle — stays on Devanagari permanently.

- [ ] **Step 7: Document any issues**

If any step above fails, fix the underlying issue before continuing. Re-run the step and update the commit history.

If everything passes, no commit needed for this task — just proceed to Task 11.

---

## Task 11: DESIGN.md frontmatter update

**Files:**

- Modify: `DESIGN.md`

- [ ] **Step 1: Add the footer entry**

Read the `components:` block in `DESIGN.md` frontmatter. Find an existing component entry like `filter-sheet:` or `vendor-card:` to match the indent and style. After the last component entry, add:

```yaml
  footer:
    pattern:      "Direction C — full-bleed editorial. Black hero band carries the 4-script cycling wordmark + in-hero newsletter signup; cream body band has 3 columns (brand blurb + For vendors + Company) and a legal row with static 4-script lang-dots."
    hero-band:    "bg-ink, py-section. Tagline 'MADE IN CHICAGO' top-right (Chicago in haldi — counts as one of the page's two haldi appearances). Wordmark cycles Devanagari → Nastaliq → Naskh → Persian on motion.cycle-hold + motion.cycle-fade, paused offscreen and under prefers-reduced-motion. Trailing dot always hot-pink."
    newsletter:   "In-hero, below wordmark + hairline. Label 'THE BAZAAR LETTER' kicker + Spectral italic 'monthly, no noise'. Email pill + 40px hot-pink arrow orb. POSTs to /api/newsletter/subscribe (idempotent — always returns {ok:true}). 5 states: default / submitting / success / error-format / error-server. Stub-only Day-1; Resend wire-up deferred."
    body-band:    "bg-cream, py-xxl. 3 cols at lg: brand blurb (1.5fr) + For vendors + Company. Column kickers indigo, links ink → indigo on hover. Mobile stacks to 1-col."
    legal-band:   "border-t hairline. Left: © Baazar 2026 + Terms/Privacy/Contact text-links (ink-soft → ink on hover). Right: 4 static lang-dots (Devanagari active, others ink-soft). No interactivity; title= attrs for AT."
    integration:  "Full-bleed; placed outside main's max-w-7xl wrapper in (marketplace)/layout.tsx. Each band has its own max-w-7xl inner wrapper for gutter alignment."
    accessibility:"WordmarkCycle h2 has stable aria-label='Baazar' (cycling glyphs aria-hidden). Newsletter form has visually-hidden label, aria-invalid + role='alert' on error. LangDots wrapper has aria-label='Scripts'. All focus-visible rings use hot-pink + ink offset on dark, cream offset on light."
```

- [ ] **Step 2: Commit**

```bash
git add DESIGN.md
git commit -m "docs(design): add footer to M+ frontmatter"
```

---

## Task 12: Plan doc commit + push + PR

**Files:** none — git operations only.

- [ ] **Step 1: Commit the plan doc if untracked**

```bash
git status --short docs/superpowers/plans/2026-05-24-baazar-footer.md
```

If listed as untracked (`??`), commit it:

```bash
git add docs/superpowers/plans/2026-05-24-baazar-footer.md
git commit -m "docs(plan): Baazar footer implementation plan"
```

- [ ] **Step 2: Final verification**

```bash
npm run typecheck
npm run lint
npm test
```

Expected results match Task 9 step 4: typecheck clean, lint clean, all new tests pass, pre-existing failures unchanged.

- [ ] **Step 3: Push branch**

```bash
git push -u origin feat/baazar-footer
```

Expected: pushed successfully, upstream tracking set.

- [ ] **Step 4: Open the PR**

```bash
gh pr create --title "feat(footer): Baazar editorial footer + cycling 4-script wordmark + stub newsletter" --body "$(cat <<'EOF'
## Summary

Replaces the shadcn-baseline `src/components/ui/Footer.tsx` with the Direction C editorial footer per [the spec](docs/superpowers/specs/2026-05-24-baazar-footer-design.md). Adds a 4-script cycling wordmark (Hindi → Urdu → Arabic → Persian) + in-hero newsletter signup in the black hero band, sitting above a cream utility band with brand blurb + 2 link columns + legal row with static lang-dots.

Newsletter is stub-only Day-1 — emails persist to a new `newsletter_signups` table via `POST /api/newsletter/subscribe` (idempotent, always returns `{ok:true}` to avoid leaking subscription state). No Resend wire-up yet.

## What's in this PR

- **`Footer.tsx`** — new server component at `src/components/layout/Footer.tsx`, full-bleed (each band has its own max-w-7xl inner wrapper)
- **`WordmarkCycle.tsx`** — client component, 3.5s hold + 400ms crossfade. Pauses offscreen (IntersectionObserver) + under `prefers-reduced-motion`. Pure cycle logic extracted to `wordmark-cycle-helpers.ts` for unit testing.
- **`NewsletterForm.tsx`** — client component, 5 visual states (default / submitting / success / error-format / error-server)
- **`LangDots.tsx`** — server component, 4 static glyphs in legal row
- **`POST /api/newsletter/subscribe`** — zod-validated, idempotent on unique-violation, derives `user_id` from session
- **Migration 00039** — `newsletter_signups` table with `citext` UNIQUE email, insert-only RLS for anon + authenticated
- **`src/app/layout.tsx`** — adds 4 wordmark fonts (Tiro Devanagari Hindi, Noto Nastaliq Urdu, Amiri, Markazi Text) via `next/font/google`
- **`tailwind.config.ts`** — adds `font-wordmark-*` family aliases
- **`(marketplace)/layout.tsx`** — swap import path, JSX unchanged
- **DESIGN.md** — adds `footer:` component entry

## Out of scope (deferred)

- Resend integration (actual sending + double-opt-in + unsubscribe)
- Locale switching (the lang-dots and wordmark cycle are passive cultural signatures only)
- "Coming Soon" link affordance for routes that don't exist yet
- Footer in dashboard + root layouts
- Abuse rate-limiting on the newsletter endpoint

## Test plan

- [ ] `/vendors` renders the new footer full-bleed; old shadcn footer is gone
- [ ] Wordmark cycles through 4 scripts on a 3.5s + 400ms cadence
- [ ] Cycle pauses when footer is offscreen, resumes on scroll back
- [ ] Cycle is disabled under DevTools' "Emulate prefers-reduced-motion: reduce"
- [ ] Newsletter form: invalid email shows haldi error message
- [ ] Newsletter form: valid email shows spinner → check → "Subscribed" haldi text, resets after 5s
- [ ] Same email submitted twice = both succeed; DB has single row
- [ ] Mobile (375px): tagline moves above wordmark, columns stack, newsletter wraps
- [ ] Lang-dots: Devanagari is ink/bold, others ink-soft; `title=` attr on hover

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Capture the PR URL from output and report it.

- [ ] **Step 5: Report**

Report:

- **Status:** DONE | DONE_WITH_CONCERNS | BLOCKED
- Final test results
- PR URL
- Any concerns (e.g., visual quirks deferred for follow-up, type-generation gotchas)
