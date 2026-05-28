# Sub-project K — Vendor Scraper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a multi-source vendor ingestion pipeline (Google Places + Apify Instagram + ScrapeGraphAI + SearchGraph + hand-curated JSON) that seeds `scraped_vendors`, plus a token-based claim flow that promotes scraped rows into `vendor_profiles` when vendors sign up.

**Architecture:** Offline TypeScript scrapers + Python ScrapeGraphAI sidecar communicate via JSON dumps on the filesystem. A single `merge.ts` step is the only writer to `scraped_vendors`. The claim flow is a Next.js route (`/claim/[token]`) + a server-side fuzzy-match helper that the existing onboarding wizard calls on step 1.

**Tech Stack:** Node.js + TypeScript (Next.js 14.2), Python 3.12 with `uv`, Supabase (Postgres + pg_trgm), Apify SDK (`apify-client`), Google Maps Places API (`@googlemaps/google-maps-services-js`), ScrapeGraphAI + Claude Haiku (`claude-haiku-4-5-20251001`), Vitest + Playwright for tests.

**Source spec:** `docs/superpowers/specs/2026-05-27-sub-project-k-vendor-scraper-design.md`

**Sequencing:** This plan implements K. M (e2e) and L (per-type packages) follow per `docs/superpowers/specs/2026-05-27-soft-launch-roadmap.md`.

**Execution branch:** Create `feat/sub-project-k-scraper` off `main` (do NOT commit to `main` per project git workflow rule).

---

## File structure

### New files

```
scripts/scraper/
├── sources/
│   ├── google-maps.ts
│   ├── instagram.ts
│   ├── il-desi-arab-catering.ts
│   ├── hand-curated.ts
│   └── searchgraph.ts
├── python/
│   ├── pyproject.toml
│   ├── uv.lock
│   ├── enrich_website.py
│   ├── catering_signal.py
│   └── search_discover.py
├── lib/
│   ├── rate-limit.ts
│   ├── dedup.ts
│   ├── normalize.ts
│   ├── claim-token.ts
│   ├── manifest.ts
│   └── schemas.ts            # Zod schemas for source dump shape + scraped_vendors
├── merge.ts
└── mint-tokens.ts

data/scraped/
├── hand-curated/
│   └── 2026-05-27-chicago-seed.json  # example/initial file
└── .gitkeep

src/app/claim/[token]/
├── page.tsx                  # claim-by-token route
└── claim-actions.ts          # server action that links scraped row → vendor_profile

src/lib/scraped-vendor/
├── match.ts                  # signup-time fuzzy match
└── promote.ts                # promotes scraped_vendors row → vendor_profiles row

src/components/onboarding/
└── ScrapedVendorMatchPrompt.tsx  # "Is this you?" wizard UI

supabase/migrations/
├── 00045_vendor_categories_add_content_creation.sql
├── 00046_create_scraped_vendors.sql
├── 00047_create_claim_tokens.sql
└── 00048_pg_trgm_indexes.sql

.github/workflows/
└── k-scrape.yml              # manual-trigger orchestration

src/__tests__/
├── lib/scraped-vendor/
│   ├── match.test.ts
│   ├── promote.test.ts
│   └── claim-token.test.ts
└── scripts/scraper/
    ├── normalize.test.ts
    ├── dedup.test.ts
    └── merge.test.ts

tests/e2e/
└── claim-flow.spec.ts
```

### Modified files

- `src/components/onboarding/StepBasics.tsx` — call match API on submit, render `<ScrapedVendorMatchPrompt>` if matches found
- `package.json` — add `apify-client`, `@googlemaps/google-maps-services-js` to deps; add scraper npm scripts
- `.env.example` — document `APIFY_API_TOKEN`, `GOOGLE_MAPS_API_KEY`, `K_CLAIM_TOKEN_SECRET`

### Migration apply policy

Per [[migration-apply-policy]]: Claude applies 00045-00048 to dev via `psql` directly during implementation. User applies to prod manually via Supabase SQL editor before K's outreach phase begins.

---

## Milestone 1 — Schema foundation

### Task 1: Migration 00045 — `content_creation` category

**Files:**

- Create: `supabase/migrations/00045_vendor_categories_add_content_creation.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- Adds `content_creation` to the vendor_profiles category CHECK constraint
-- for TikTok / Reels wedding creators (a distinct deliverable from videography).
-- Tracked in sub-project K spec.

ALTER TABLE vendor_profiles DROP CONSTRAINT IF EXISTS vendor_profiles_category_check;
ALTER TABLE vendor_profiles ADD CONSTRAINT vendor_profiles_category_check
  CHECK (category = ANY (ARRAY[
    'photography'::text,
    'videography'::text,
    'mehndi'::text,
    'hair_makeup'::text,
    'dj'::text,
    'photobooth'::text,
    'catering'::text,
    'venue'::text,
    'decor'::text,
    'invitations'::text,
    'bridal_wear'::text,
    'live_music'::text,
    'carts'::text,
    'content_creation'::text
  ]));
```

- [ ] **Step 2: Apply to dev DB**

Request dev DB password from user (per migration apply policy), then:

```bash
PGPASSWORD='<dev-password>' psql \
  -h db.lquvhjedlzubqusnfaak.supabase.co -p 5432 -U postgres -d postgres \
  -f supabase/migrations/00045_vendor_categories_add_content_creation.sql
```

Expected: `ALTER TABLE` x2, no errors.

- [ ] **Step 3: Verify in dev**

```bash
PGPASSWORD='<dev-password>' psql \
  -h db.lquvhjedlzubqusnfaak.supabase.co -p 5432 -U postgres -d postgres \
  -c "SELECT consrc FROM pg_constraint WHERE conname = 'vendor_profiles_category_check';"
```

Expected: output includes `'content_creation'`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/00045_vendor_categories_add_content_creation.sql
git commit -m "feat(schema): add content_creation vendor category (migration 00045)"
```

---

### Task 2: Migration 00046 — `scraped_vendors` staging table

**Files:**

- Create: `supabase/migrations/00046_create_scraped_vendors.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- Staging table for K's multi-source scraper pipeline.
-- Rows are promoted to vendor_profiles on claim (either via token or organic
-- signup-time fuzzy match). See spec 2026-05-27-sub-project-k-vendor-scraper-design.

CREATE TABLE scraped_vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL CHECK (source IN (
    'google_maps', 'instagram', 'il_desi_arab_catering',
    'hand_curated', 'searchgraph'
  )),
  source_external_id text,
  business_name text NOT NULL,
  category text,
  tags text[] NOT NULL DEFAULT '{}',
  city text,
  state text NOT NULL DEFAULT 'IL',
  postal_code text,
  lat numeric,
  lng numeric,
  phone text,
  email text,
  website text,
  instagram_handle text,
  facebook_url text,
  bio text,
  photos text[] NOT NULL DEFAULT '{}',
  raw jsonb NOT NULL,
  enriched jsonb,
  scraped_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  claimed_vendor_profile_id uuid REFERENCES vendor_profiles(id) ON DELETE SET NULL,
  disputed_at timestamptz,
  review_status text NOT NULL DEFAULT 'pending'
    CHECK (review_status IN ('pending', 'approved', 'rejected', 'duplicate'))
);

CREATE UNIQUE INDEX scraped_vendors_source_external_idx
  ON scraped_vendors (source, source_external_id)
  WHERE source_external_id IS NOT NULL;
CREATE INDEX scraped_vendors_instagram_idx
  ON scraped_vendors (lower(instagram_handle))
  WHERE instagram_handle IS NOT NULL;
CREATE INDEX scraped_vendors_phone_idx
  ON scraped_vendors (phone) WHERE phone IS NOT NULL;
CREATE INDEX scraped_vendors_category_city_idx ON scraped_vendors (category, city);
CREATE INDEX scraped_vendors_unclaimed_idx ON scraped_vendors (claimed_at) WHERE claimed_at IS NULL;

ALTER TABLE scraped_vendors ENABLE ROW LEVEL SECURITY;
-- Default-deny: no SELECT/INSERT/UPDATE/DELETE policy → service-role only.
```

- [ ] **Step 2: Apply to dev DB**

```bash
PGPASSWORD='<dev-password>' psql \
  -h db.lquvhjedlzubqusnfaak.supabase.co -p 5432 -U postgres -d postgres \
  -f supabase/migrations/00046_create_scraped_vendors.sql
```

Expected: `CREATE TABLE`, 5 × `CREATE INDEX`, `ALTER TABLE`.

- [ ] **Step 3: Verify the table + indexes**

```bash
PGPASSWORD='<dev-password>' psql \
  -h db.lquvhjedlzubqusnfaak.supabase.co -p 5432 -U postgres -d postgres \
  -c "\d scraped_vendors" \
  -c "SELECT indexname FROM pg_indexes WHERE tablename = 'scraped_vendors';"
```

Expected: table with 24 columns; 6 indexes including the unique one.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/00046_create_scraped_vendors.sql
git commit -m "feat(schema): create scraped_vendors staging table (migration 00046)"
```

---

### Task 3: Migration 00047 — `claim_tokens` table

**Files:**

- Create: `supabase/migrations/00047_create_claim_tokens.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- Single-use, signed claim tokens minted per outreach batch.
-- Public token = base64url(scraped_vendor_id):base64url(random_64_bytes).
-- We store only the SHA-256 hash; verify by hashing the incoming token.

CREATE TABLE claim_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scraped_vendor_id uuid NOT NULL REFERENCES scraped_vendors(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  issued_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  claimed_at timestamptz,
  claimed_by_user_id uuid REFERENCES users(id),
  revoked_at timestamptz,
  campaign_label text
);

CREATE INDEX claim_tokens_scraped_vendor_idx ON claim_tokens (scraped_vendor_id);
CREATE INDEX claim_tokens_unclaimed_idx ON claim_tokens (claimed_at) WHERE claimed_at IS NULL;

ALTER TABLE claim_tokens ENABLE ROW LEVEL SECURITY;
-- Default-deny: service-role only.
```

- [ ] **Step 2: Apply to dev DB**

```bash
PGPASSWORD='<dev-password>' psql \
  -h db.lquvhjedlzubqusnfaak.supabase.co -p 5432 -U postgres -d postgres \
  -f supabase/migrations/00047_create_claim_tokens.sql
```

Expected: `CREATE TABLE`, 2 × `CREATE INDEX`, `ALTER TABLE`.

- [ ] **Step 3: Verify**

```bash
PGPASSWORD='<dev-password>' psql \
  -h db.lquvhjedlzubqusnfaak.supabase.co -p 5432 -U postgres -d postgres \
  -c "\d claim_tokens"
```

Expected: table with 9 columns including unique `token_hash`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/00047_create_claim_tokens.sql
git commit -m "feat(schema): create claim_tokens table (migration 00047)"
```

---

### Task 4: Migration 00048 — `pg_trgm` extension + trigram indexes

**Files:**

- Create: `supabase/migrations/00048_pg_trgm_indexes.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- Enables fuzzy business-name matching for signup-time dedup + scraper merge.
-- pg_trgm is bundled with Postgres; CREATE EXTENSION is idempotent.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS scraped_vendors_business_name_trgm_idx
  ON scraped_vendors USING gin (business_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS vendor_profiles_business_name_trgm_idx
  ON vendor_profiles USING gin (business_name gin_trgm_ops);
```

- [ ] **Step 2: Apply to dev**

```bash
PGPASSWORD='<dev-password>' psql \
  -h db.lquvhjedlzubqusnfaak.supabase.co -p 5432 -U postgres -d postgres \
  -f supabase/migrations/00048_pg_trgm_indexes.sql
```

Expected: `CREATE EXTENSION`, 2 × `CREATE INDEX`.

- [ ] **Step 3: Sanity-check trigram operator works**

```bash
PGPASSWORD='<dev-password>' psql \
  -h db.lquvhjedlzubqusnfaak.supabase.co -p 5432 -U postgres -d postgres \
  -c "SELECT 'best chai cart' % 'best chaicart' AS matches;"
```

Expected: `matches | t` (true).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/00048_pg_trgm_indexes.sql
git commit -m "feat(schema): pg_trgm extension + trigram indexes (migration 00048)"
```

---

### Task 5: Regenerate Supabase TypeScript types

**Files:**

- Modify: `src/types/database.types.ts`

- [ ] **Step 1: Regenerate types from the live dev schema**

```bash
npx supabase gen types typescript \
  --project-id lquvhjedlzubqusnfaak \
  > src/types/database.types.ts
```

(May require `SUPABASE_ACCESS_TOKEN` env var. If so, request from user.)

- [ ] **Step 2: Verify new tables present**

```bash
grep -E "scraped_vendors|claim_tokens" src/types/database.types.ts | head
```

Expected: lines for both table types.

- [ ] **Step 3: Type-check the whole project**

```bash
npm run build
```

Expected: build succeeds. Any failures should be in code we'll write later — fix them there, not here.

- [ ] **Step 4: Commit**

```bash
git add src/types/database.types.ts
git commit -m "chore(types): regenerate database types with scraped_vendors + claim_tokens"
```

---

## Milestone 2 — Core libraries (pure TDD)

### Task 6: `lib/normalize.ts` — phone, IG, category normalization

**Files:**

- Create: `scripts/scraper/lib/normalize.ts`
- Test: `src/__tests__/scripts/scraper/normalize.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/__tests__/scripts/scraper/normalize.test.ts
import { describe, expect, it } from 'vitest';
import {
  normalizePhone,
  normalizeInstagramHandle,
  normalizeCategory,
} from '../../../../scripts/scraper/lib/normalize';

describe('normalizePhone', () => {
  it('formats US phones to E.164', () => {
    expect(normalizePhone('(312) 555-1234')).toBe('+13125551234');
    expect(normalizePhone('312.555.1234')).toBe('+13125551234');
    expect(normalizePhone('312-555-1234')).toBe('+13125551234');
    expect(normalizePhone('3125551234')).toBe('+13125551234');
    expect(normalizePhone('+1 312 555 1234')).toBe('+13125551234');
  });

  it('preserves already-E.164 numbers', () => {
    expect(normalizePhone('+13125551234')).toBe('+13125551234');
  });

  it('returns null for unparseable input', () => {
    expect(normalizePhone('')).toBeNull();
    expect(normalizePhone('not a phone')).toBeNull();
    expect(normalizePhone('123')).toBeNull();
  });
});

describe('normalizeInstagramHandle', () => {
  it('strips @ prefix', () => {
    expect(normalizeInstagramHandle('@bestchaicart')).toBe('bestchaicart');
  });

  it('extracts handle from instagram URLs', () => {
    expect(normalizeInstagramHandle('https://www.instagram.com/bestchaicart/')).toBe(
      'bestchaicart'
    );
    expect(normalizeInstagramHandle('https://instagram.com/bestchaicart')).toBe('bestchaicart');
    expect(normalizeInstagramHandle('instagram.com/bestchaicart/?utm=share')).toBe('bestchaicart');
  });

  it('lowercases the handle', () => {
    expect(normalizeInstagramHandle('BestChaiCart')).toBe('bestchaicart');
  });

  it('returns null for invalid input', () => {
    expect(normalizeInstagramHandle('')).toBeNull();
    expect(normalizeInstagramHandle('not a handle!!!')).toBeNull();
  });
});

describe('normalizeCategory', () => {
  it('maps common Places API types to our categories', () => {
    expect(normalizeCategory(['hair_care', 'beauty_salon'])).toBe('hair_makeup');
    expect(normalizeCategory(['photographer'])).toBe('photography');
    expect(normalizeCategory(['caterer', 'meal_delivery'])).toBe('catering');
    expect(normalizeCategory(['restaurant', 'food'])).toBe('catering');
    expect(normalizeCategory(['florist'])).toBe('decor');
  });

  it('returns null when no recognized type present', () => {
    expect(normalizeCategory(['unrelated_type'])).toBeNull();
    expect(normalizeCategory([])).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests, confirm they fail**

```bash
npm test -- --run src/__tests__/scripts/scraper/normalize.test.ts
```

Expected: ALL fail with module-not-found / functions undefined.

- [ ] **Step 3: Implement `normalize.ts`**

```typescript
// scripts/scraper/lib/normalize.ts

/** Strip non-digits, ensure E.164 US format. Returns null if not a valid 10/11-digit US number. */
export function normalizePhone(input: string | null | undefined): string | null {
  if (!input) return null;
  const digits = input.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}

/** Lowercase handle, strip leading @, extract from instagram URLs. */
export function normalizeInstagramHandle(input: string | null | undefined): string | null {
  if (!input) return null;
  let s = input.trim().toLowerCase();
  s = s.replace(/^https?:\/\//, '').replace(/^www\./, '');
  if (s.startsWith('instagram.com/')) {
    s = s.slice('instagram.com/'.length);
  }
  s = s.split(/[/?#]/)[0]; // strip path, query, fragment
  s = s.replace(/^@/, '');
  if (!/^[a-z0-9._]+$/.test(s)) return null;
  return s;
}

/** Map Google Places types[] to our vendor_profiles category enum. First match wins. */
const PLACES_TYPE_TO_CATEGORY: Record<string, string> = {
  photographer: 'photography',
  hair_care: 'hair_makeup',
  beauty_salon: 'hair_makeup',
  caterer: 'catering',
  meal_delivery: 'catering',
  restaurant: 'catering',
  food: 'catering',
  florist: 'decor',
  banquet_hall: 'venue',
  wedding_venue: 'venue',
  event_venue: 'venue',
};

export function normalizeCategory(placesTypes: string[]): string | null {
  for (const t of placesTypes) {
    if (PLACES_TYPE_TO_CATEGORY[t]) return PLACES_TYPE_TO_CATEGORY[t];
  }
  return null;
}
```

- [ ] **Step 4: Re-run tests, all pass**

```bash
npm test -- --run src/__tests__/scripts/scraper/normalize.test.ts
```

Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add scripts/scraper/lib/normalize.ts src/__tests__/scripts/scraper/normalize.test.ts
git commit -m "feat(scraper): add normalize lib (phone E.164, IG, category)"
```

---

### Task 7: `lib/dedup.ts` — IG exact, name trigram, phone exact

**Files:**

- Create: `scripts/scraper/lib/dedup.ts`
- Test: `src/__tests__/scripts/scraper/dedup.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/__tests__/scripts/scraper/dedup.test.ts
import { describe, expect, it } from 'vitest';
import { dedupKey, candidatesEqual } from '../../../../scripts/scraper/lib/dedup';

describe('dedupKey', () => {
  it('prefers normalized IG handle when present', () => {
    expect(dedupKey({ instagram_handle: 'BestChai', business_name: 'X', city: 'Chicago' })).toBe(
      'ig:bestchai'
    );
  });

  it('falls back to phone when no IG', () => {
    expect(dedupKey({ phone: '+13125551234', business_name: 'X', city: 'Chicago' })).toBe(
      'phone:+13125551234'
    );
  });

  it('falls back to (name + city) when no IG, no phone', () => {
    expect(dedupKey({ business_name: 'Best Chai Cart', city: 'Chicago' })).toBe(
      'namecity:best chai cart|chicago'
    );
  });

  it('returns null when no signal present', () => {
    expect(dedupKey({})).toBeNull();
  });
});

describe('candidatesEqual', () => {
  it('treats exact IG match as same', () => {
    expect(
      candidatesEqual({ instagram_handle: 'bestchai' }, { instagram_handle: 'bestchai' })
    ).toBe(true);
  });

  it('rejects different IG handles', () => {
    expect(
      candidatesEqual({ instagram_handle: 'bestchai' }, { instagram_handle: 'worstchai' })
    ).toBe(false);
  });

  it('treats phone match as same when both present', () => {
    expect(candidatesEqual({ phone: '+13125551234' }, { phone: '+13125551234' })).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests, confirm fail**

```bash
npm test -- --run src/__tests__/scripts/scraper/dedup.test.ts
```

Expected: fail.

- [ ] **Step 3: Implement `dedup.ts`**

```typescript
// scripts/scraper/lib/dedup.ts
import { normalizeInstagramHandle, normalizePhone } from './normalize';

export interface DedupCandidate {
  instagram_handle?: string | null;
  phone?: string | null;
  business_name?: string;
  city?: string | null;
}

/** Returns a stable dedup key for a candidate, or null if no signal present. */
export function dedupKey(c: DedupCandidate): string | null {
  const ig = normalizeInstagramHandle(c.instagram_handle ?? null);
  if (ig) return `ig:${ig}`;
  const phone = normalizePhone(c.phone ?? null);
  if (phone) return `phone:${phone}`;
  if (c.business_name && c.city) {
    return `namecity:${c.business_name.toLowerCase().trim()}|${c.city.toLowerCase().trim()}`;
  }
  return null;
}

/** Two candidates are equal if their dedupKey matches (and both are non-null). */
export function candidatesEqual(a: DedupCandidate, b: DedupCandidate): boolean {
  const keyA = dedupKey(a);
  const keyB = dedupKey(b);
  return keyA !== null && keyA === keyB;
}
```

- [ ] **Step 4: Re-run tests**

```bash
npm test -- --run src/__tests__/scripts/scraper/dedup.test.ts
```

Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add scripts/scraper/lib/dedup.ts src/__tests__/scripts/scraper/dedup.test.ts
git commit -m "feat(scraper): add dedup lib (IG + phone + name-city keys)"
```

---

### Task 8: `lib/claim-token.ts` — HMAC mint + verify

**Files:**

- Create: `scripts/scraper/lib/claim-token.ts`
- Test: `src/__tests__/lib/scraped-vendor/claim-token.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/__tests__/lib/scraped-vendor/claim-token.test.ts
import { describe, expect, it } from 'vitest';
import {
  mintTokenString,
  hashTokenString,
  parseTokenString,
} from '../../../../scripts/scraper/lib/claim-token';

const FAKE_VENDOR_ID = '11111111-2222-3333-4444-555555555555';

describe('claim token', () => {
  it('mintTokenString produces a token containing the vendor id', () => {
    const token = mintTokenString(FAKE_VENDOR_ID);
    const parsed = parseTokenString(token);
    expect(parsed?.scrapedVendorId).toBe(FAKE_VENDOR_ID);
  });

  it('mintTokenString embeds 64 random bytes (different each call)', () => {
    const a = mintTokenString(FAKE_VENDOR_ID);
    const b = mintTokenString(FAKE_VENDOR_ID);
    expect(a).not.toBe(b);
  });

  it('hashTokenString returns SHA-256 hex of the token', () => {
    const token = mintTokenString(FAKE_VENDOR_ID);
    const hash = hashTokenString(token);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    // Same token → same hash
    expect(hashTokenString(token)).toBe(hash);
  });

  it('parseTokenString returns null for malformed input', () => {
    expect(parseTokenString('not-a-token')).toBeNull();
    expect(parseTokenString('')).toBeNull();
    expect(parseTokenString('abc:def:ghi')).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests, confirm fail**

```bash
npm test -- --run src/__tests__/lib/scraped-vendor/claim-token.test.ts
```

Expected: fail.

- [ ] **Step 3: Implement `claim-token.ts`**

```typescript
// scripts/scraper/lib/claim-token.ts
import crypto from 'node:crypto';

function base64UrlEncode(input: Buffer): string {
  return input.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(input: string): Buffer {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/') + '=='.slice((input.length + 2) % 4);
  return Buffer.from(padded, 'base64');
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Mints a one-time claim token string of form `<b64url(vendorId)>:<b64url(64-rand-bytes)>`. */
export function mintTokenString(scrapedVendorId: string): string {
  if (!UUID_REGEX.test(scrapedVendorId)) {
    throw new Error(`invalid scrapedVendorId: ${scrapedVendorId}`);
  }
  const idPart = base64UrlEncode(Buffer.from(scrapedVendorId.replace(/-/g, ''), 'hex'));
  const randPart = base64UrlEncode(crypto.randomBytes(64));
  return `${idPart}:${randPart}`;
}

/** Parse a token string back into its components. Null if malformed. */
export function parseTokenString(token: string): { scrapedVendorId: string } | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split(':');
  if (parts.length !== 2) return null;
  try {
    const idBuf = base64UrlDecode(parts[0]);
    if (idBuf.length !== 16) return null;
    const hex = idBuf.toString('hex');
    const scrapedVendorId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    if (!UUID_REGEX.test(scrapedVendorId)) return null;
    return { scrapedVendorId };
  } catch {
    return null;
  }
}

/** SHA-256 hex of a token string. */
export function hashTokenString(token: string): string {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}
```

- [ ] **Step 4: Re-run tests**

```bash
npm test -- --run src/__tests__/lib/scraped-vendor/claim-token.test.ts
```

Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add scripts/scraper/lib/claim-token.ts src/__tests__/lib/scraped-vendor/claim-token.test.ts
git commit -m "feat(scraper): add claim-token lib (mint, parse, hash)"
```

---

### Task 9: `lib/rate-limit.ts` — token bucket with jitter

**Files:**

- Create: `scripts/scraper/lib/rate-limit.ts`
- Test: `src/__tests__/scripts/scraper/rate-limit.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/__tests__/scripts/scraper/rate-limit.test.ts
import { describe, expect, it } from 'vitest';
import { createRateLimiter } from '../../../../scripts/scraper/lib/rate-limit';

describe('createRateLimiter', () => {
  it('allows N calls within the burst budget without delay', async () => {
    const limiter = createRateLimiter({ qps: 10, burst: 5, jitterMs: 0 });
    const start = Date.now();
    for (let i = 0; i < 5; i++) await limiter.acquire();
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(50);
  });

  it('throttles to ~qps after burst is exhausted', async () => {
    const limiter = createRateLimiter({ qps: 10, burst: 1, jitterMs: 0 });
    const start = Date.now();
    // 1 burst + 2 throttled @ 10 QPS = ~200ms
    await limiter.acquire();
    await limiter.acquire();
    await limiter.acquire();
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(180);
    expect(elapsed).toBeLessThanOrEqual(350);
  });
});
```

- [ ] **Step 2: Run, confirm fail**

```bash
npm test -- --run src/__tests__/scripts/scraper/rate-limit.test.ts
```

Expected: fail.

- [ ] **Step 3: Implement**

```typescript
// scripts/scraper/lib/rate-limit.ts

export interface RateLimiter {
  acquire(): Promise<void>;
}

export interface RateLimiterOptions {
  qps: number; // sustained queries per second
  burst: number; // initial burst budget
  jitterMs?: number; // random delay added to each acquire (0–jitterMs)
}

export function createRateLimiter(opts: RateLimiterOptions): RateLimiter {
  const intervalMs = 1000 / opts.qps;
  let nextSlot = Date.now();
  let bursts = opts.burst;
  const jitter = opts.jitterMs ?? 0;

  return {
    async acquire() {
      const now = Date.now();
      if (bursts > 0 && now >= nextSlot) {
        bursts--;
        nextSlot = now + intervalMs;
        if (jitter) await sleep(Math.random() * jitter);
        return;
      }
      const wait = Math.max(0, nextSlot - now);
      nextSlot += intervalMs;
      await sleep(wait + Math.random() * jitter);
    },
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
```

- [ ] **Step 4: Re-run**

```bash
npm test -- --run src/__tests__/scripts/scraper/rate-limit.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/scraper/lib/rate-limit.ts src/__tests__/scripts/scraper/rate-limit.test.ts
git commit -m "feat(scraper): add rate-limit lib (token bucket + jitter)"
```

---

### Task 10: `lib/manifest.ts` — shared manifest writer

**Files:**

- Create: `scripts/scraper/lib/manifest.ts`

(No tests — trivial side-effect-only IO helper. Integration tests come via the source scrapers.)

- [ ] **Step 1: Implement**

```typescript
// scripts/scraper/lib/manifest.ts
import fs from 'node:fs/promises';
import path from 'node:path';

export interface RunManifest {
  source: string;
  run_date: string; // YYYY-MM-DD
  started_at: string; // ISO
  finished_at?: string;
  queries_executed: number;
  records_returned: number;
  errors: Array<{ context: string; code: string; message: string; ts: string }>;
  cost_estimate_usd?: number;
  notes?: string;
}

export function emptyManifest(source: string, runDate: string): RunManifest {
  return {
    source,
    run_date: runDate,
    started_at: new Date().toISOString(),
    queries_executed: 0,
    records_returned: 0,
    errors: [],
  };
}

export function todayRunDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function writeManifest(dumpDir: string, manifest: RunManifest): Promise<void> {
  manifest.finished_at = new Date().toISOString();
  await fs.mkdir(dumpDir, { recursive: true });
  await fs.writeFile(path.join(dumpDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
}
```

- [ ] **Step 2: Smoke check the module compiles**

```bash
npx tsc --noEmit --project tsconfig.json
```

Expected: no errors. (If errors arise from unrelated files, ignore — must be from this file or its imports.)

- [ ] **Step 3: Commit**

```bash
git add scripts/scraper/lib/manifest.ts
git commit -m "feat(scraper): add manifest writer for run observability"
```

---

## Milestone 3 — Hand-curated source + merge

### Task 11: `lib/schemas.ts` — Zod schemas for source dump shape

**Files:**

- Create: `scripts/scraper/lib/schemas.ts`
- Test: `src/__tests__/scripts/scraper/schemas.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/__tests__/scripts/scraper/schemas.test.ts
import { describe, expect, it } from 'vitest';
import { scrapedRowSchema } from '../../../../scripts/scraper/lib/schemas';

describe('scrapedRowSchema', () => {
  it('accepts a minimal valid row', () => {
    const result = scrapedRowSchema.safeParse({
      source: 'hand_curated',
      business_name: 'Best Chai Cart',
      raw: { source: 'hand_curated' },
    });
    expect(result.success).toBe(true);
  });

  it('accepts a full row', () => {
    const result = scrapedRowSchema.safeParse({
      source: 'google_maps',
      source_external_id: 'ChIJ_abc123',
      business_name: 'Test Vendor',
      category: 'photography',
      tags: ['dhol'],
      city: 'Chicago',
      state: 'IL',
      postal_code: '60645',
      lat: 42.0,
      lng: -87.7,
      phone: '+13125551234',
      email: 'a@b.com',
      website: 'https://example.com',
      instagram_handle: 'bestchaicart',
      photos: ['https://cdn.example.com/x.jpg'],
      bio: 'Hello',
      raw: { source: 'google_maps' },
    });
    expect(result.success).toBe(true);
  });

  it('rejects rows missing required fields', () => {
    expect(scrapedRowSchema.safeParse({}).success).toBe(false);
    expect(scrapedRowSchema.safeParse({ source: 'hand_curated' }).success).toBe(false);
  });

  it('rejects rows with invalid source', () => {
    const result = scrapedRowSchema.safeParse({
      source: 'made_up_source',
      business_name: 'X',
      raw: {},
    });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run, confirm fail**

```bash
npm test -- --run src/__tests__/scripts/scraper/schemas.test.ts
```

Expected: fail.

- [ ] **Step 3: Implement schemas**

```typescript
// scripts/scraper/lib/schemas.ts
import { z } from 'zod';

export const SCRAPED_SOURCES = [
  'google_maps',
  'instagram',
  'il_desi_arab_catering',
  'hand_curated',
  'searchgraph',
] as const;

export const scrapedRowSchema = z.object({
  source: z.enum(SCRAPED_SOURCES),
  source_external_id: z.string().optional(),
  business_name: z.string().min(1),
  category: z.string().optional(),
  tags: z.array(z.string()).default([]),
  city: z.string().optional(),
  state: z.string().default('IL'),
  postal_code: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  website: z.string().optional(),
  instagram_handle: z.string().optional(),
  facebook_url: z.string().optional(),
  bio: z.string().optional(),
  photos: z.array(z.string()).default([]),
  raw: z.record(z.unknown()),
  enriched: z.record(z.unknown()).optional(),
});

export type ScrapedRow = z.infer<typeof scrapedRowSchema>;
```

- [ ] **Step 4: Re-run**

```bash
npm test -- --run src/__tests__/scripts/scraper/schemas.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/scraper/lib/schemas.ts src/__tests__/scripts/scraper/schemas.test.ts
git commit -m "feat(scraper): add zod schemas for scraped row shape"
```

---

### Task 12: Hand-curated source — example file + reader

**Files:**

- Create: `data/scraped/hand-curated/2026-05-27-chicago-seed.json`
- Create: `data/scraped/.gitkeep`
- Create: `scripts/scraper/sources/hand-curated.ts`

- [ ] **Step 1: Write a minimal hand-curated example file**

```json
[
  {
    "source": "hand_curated",
    "business_name": "Example Chai Cart",
    "category": "carts",
    "tags": ["chai"],
    "city": "Chicago",
    "state": "IL",
    "instagram_handle": "examplechaicart_seed",
    "phone": "+13125551234",
    "bio": "Seed entry to validate the merge pipeline. Replace before outreach.",
    "raw": { "note": "manually authored 2026-05-27 by Sardar" }
  }
]
```

- [ ] **Step 2: Write `.gitkeep` so the data dir is committable**

```
# placeholder so data/scraped/ is committed
```

- [ ] **Step 3: Implement the source reader**

```typescript
// scripts/scraper/sources/hand-curated.ts
import fs from 'node:fs/promises';
import path from 'node:path';
import { scrapedRowSchema, type ScrapedRow } from '../lib/schemas';
import { emptyManifest, todayRunDate, writeManifest } from '../lib/manifest';

const HAND_CURATED_DIR = path.join(process.cwd(), 'data/scraped/hand-curated');
const OUTPUT_DIR_ROOT = path.join(process.cwd(), 'data/scraped/hand-curated-merged');

export async function runHandCuratedSource(): Promise<void> {
  const runDate = todayRunDate();
  const outDir = path.join(OUTPUT_DIR_ROOT, runDate);
  const manifest = emptyManifest('hand_curated', runDate);

  const files = (await fs.readdir(HAND_CURATED_DIR)).filter((f) => f.endsWith('.json'));
  const rows: ScrapedRow[] = [];

  for (const file of files) {
    manifest.queries_executed += 1;
    const filePath = path.join(HAND_CURATED_DIR, file);
    try {
      const text = await fs.readFile(filePath, 'utf8');
      const data = JSON.parse(text);
      if (!Array.isArray(data)) {
        manifest.errors.push({
          context: file,
          code: 'NOT_ARRAY',
          message: 'file root must be an array',
          ts: new Date().toISOString(),
        });
        continue;
      }
      for (const [i, item] of data.entries()) {
        const parsed = scrapedRowSchema.safeParse(item);
        if (!parsed.success) {
          manifest.errors.push({
            context: `${file}[${i}]`,
            code: 'INVALID_SCHEMA',
            message: parsed.error.message,
            ts: new Date().toISOString(),
          });
          continue;
        }
        rows.push(parsed.data);
      }
    } catch (e) {
      manifest.errors.push({
        context: file,
        code: 'READ_ERROR',
        message: e instanceof Error ? e.message : String(e),
        ts: new Date().toISOString(),
      });
    }
  }

  manifest.records_returned = rows.length;

  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(path.join(outDir, 'rows.json'), JSON.stringify(rows, null, 2));
  await writeManifest(outDir, manifest);

  console.log(`hand-curated: ${rows.length} rows written; ${manifest.errors.length} errors`);
}

if (require.main === module) {
  runHandCuratedSource().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
```

- [ ] **Step 4: Add npm script + run**

Modify `package.json` scripts block, adding:

```json
"scrape:hand-curated": "tsx scripts/scraper/sources/hand-curated.ts",
```

Run:

```bash
npm run scrape:hand-curated
```

Expected: output ends with `hand-curated: 1 rows written; 0 errors`. Check the file:

```bash
ls data/scraped/hand-curated-merged/$(date -u +%Y-%m-%d)/
```

Expected: `manifest.json`, `rows.json`.

- [ ] **Step 5: Commit**

```bash
git add data/scraped/ scripts/scraper/sources/hand-curated.ts package.json
git commit -m "feat(scraper): hand-curated source + example seed entry"
```

---

### Task 13: `merge.ts` — upserts dumps to `scraped_vendors`

**Files:**

- Create: `scripts/scraper/merge.ts`
- Test: `src/__tests__/scripts/scraper/merge.test.ts`

- [ ] **Step 1: Write the failing integration test**

```typescript
// src/__tests__/scripts/scraper/merge.test.ts
// Integration test: writes to dev DB scraped_vendors table.
// Skipped in CI (no env vars). Run locally with .env.local loaded.

import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createServiceRoleClient } from '../../../lib/supabase/server';
import { mergeRowsToScrapedVendors } from '../../../../scripts/scraper/merge';
import type { ScrapedRow } from '../../../../scripts/scraper/lib/schemas';

const skip = !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY;

describe.skipIf(skip)('mergeRowsToScrapedVendors (integration)', () => {
  const TEST_TAG = `__merge_test_${Date.now()}__`;

  afterEach(async () => {
    const supabase = await createServiceRoleClient();
    await supabase.from('scraped_vendors').delete().contains('tags', [TEST_TAG]);
  });

  it('inserts new rows', async () => {
    const row: ScrapedRow = {
      source: 'hand_curated',
      business_name: 'Merge Test Cart',
      category: 'carts',
      tags: [TEST_TAG],
      city: 'Chicago',
      state: 'IL',
      instagram_handle: `mergetest_${Date.now()}`,
      photos: [],
      raw: {},
    };
    const result = await mergeRowsToScrapedVendors([row]);
    expect(result.inserted).toBe(1);
    expect(result.updated).toBe(0);
  });

  it('updates existing rows on IG-handle conflict', async () => {
    const handle = `mergetest_dup_${Date.now()}`;
    const base: ScrapedRow = {
      source: 'hand_curated',
      business_name: 'First Name',
      category: 'carts',
      tags: [TEST_TAG],
      city: 'Chicago',
      state: 'IL',
      instagram_handle: handle,
      photos: [],
      raw: { v: 1 },
    };
    await mergeRowsToScrapedVendors([base]);
    const updated: ScrapedRow = { ...base, business_name: 'Updated Name', raw: { v: 2 } };
    const result = await mergeRowsToScrapedVendors([updated]);
    expect(result.inserted).toBe(0);
    expect(result.updated).toBe(1);

    const supabase = await createServiceRoleClient();
    const { data } = await supabase
      .from('scraped_vendors')
      .select('business_name')
      .eq('instagram_handle', handle)
      .single();
    expect(data?.business_name).toBe('Updated Name');
  });
});
```

- [ ] **Step 2: Run, confirm fail**

```bash
npm test -- --run src/__tests__/scripts/scraper/merge.test.ts
```

Expected: fail (mergeRowsToScrapedVendors doesn't exist).

- [ ] **Step 3: Implement `merge.ts`**

```typescript
// scripts/scraper/merge.ts
import fs from 'node:fs/promises';
import path from 'node:path';
import { createServiceRoleClient } from '../../src/lib/supabase/server';
import { scrapedRowSchema, type ScrapedRow } from './lib/schemas';
import { normalizeInstagramHandle, normalizePhone } from './lib/normalize';

export interface MergeResult {
  inserted: number;
  updated: number;
  errors: number;
}

export async function mergeRowsToScrapedVendors(rows: ScrapedRow[]): Promise<MergeResult> {
  const supabase = await createServiceRoleClient();
  let inserted = 0;
  let updated = 0;
  let errors = 0;

  for (const row of rows) {
    const normalized = {
      ...row,
      instagram_handle: normalizeInstagramHandle(row.instagram_handle ?? null),
      phone: normalizePhone(row.phone ?? null),
    };

    // Try to find existing by source+external_id, then by IG, then by phone
    let existingId: string | null = null;
    if (normalized.source_external_id) {
      const { data } = await supabase
        .from('scraped_vendors')
        .select('id')
        .eq('source', normalized.source)
        .eq('source_external_id', normalized.source_external_id)
        .maybeSingle();
      existingId = data?.id ?? null;
    }
    if (!existingId && normalized.instagram_handle) {
      const { data } = await supabase
        .from('scraped_vendors')
        .select('id')
        .eq('instagram_handle', normalized.instagram_handle)
        .maybeSingle();
      existingId = data?.id ?? null;
    }
    if (!existingId && normalized.phone) {
      const { data } = await supabase
        .from('scraped_vendors')
        .select('id')
        .eq('phone', normalized.phone)
        .maybeSingle();
      existingId = data?.id ?? null;
    }

    if (existingId) {
      const { error } = await supabase
        .from('scraped_vendors')
        .update({
          ...normalized,
          last_seen_at: new Date().toISOString(),
        })
        .eq('id', existingId);
      if (error) errors++;
      else updated++;
    } else {
      const { error } = await supabase.from('scraped_vendors').insert(normalized);
      if (error) errors++;
      else inserted++;
    }
  }

  return { inserted, updated, errors };
}

async function loadAllDumps(rootDir: string): Promise<ScrapedRow[]> {
  const all: ScrapedRow[] = [];
  const sources = await fs.readdir(rootDir).catch(() => []);
  for (const source of sources) {
    const sourceDir = path.join(rootDir, source);
    const stat = await fs.stat(sourceDir).catch(() => null);
    if (!stat?.isDirectory()) continue;
    const dates = await fs.readdir(sourceDir);
    for (const date of dates) {
      const filePath = path.join(sourceDir, date, 'rows.json');
      const text = await fs.readFile(filePath, 'utf8').catch(() => null);
      if (!text) continue;
      const data = JSON.parse(text);
      if (!Array.isArray(data)) continue;
      for (const item of data) {
        const parsed = scrapedRowSchema.safeParse(item);
        if (parsed.success) all.push(parsed.data);
      }
    }
  }
  return all;
}

if (require.main === module) {
  (async () => {
    const rows = await loadAllDumps(path.join(process.cwd(), 'data/scraped'));
    console.log(`merge: loaded ${rows.length} rows from disk`);
    const result = await mergeRowsToScrapedVendors(rows);
    console.log(
      `merge: inserted=${result.inserted} updated=${result.updated} errors=${result.errors}`
    );
  })().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
```

- [ ] **Step 4: Add npm script + run tests**

In `package.json`:

```json
"scrape:merge": "tsx scripts/scraper/merge.ts",
```

```bash
npm test -- --run src/__tests__/scripts/scraper/merge.test.ts
```

Expected: pass.

- [ ] **Step 5: Run end-to-end smoke**

```bash
npm run scrape:hand-curated
npm run scrape:merge
```

Then verify:

```bash
PGPASSWORD='<dev-password>' psql \
  -h db.lquvhjedlzubqusnfaak.supabase.co -p 5432 -U postgres -d postgres \
  -c "SELECT business_name, instagram_handle, source FROM scraped_vendors LIMIT 5;"
```

Expected: `Example Chai Cart` row appears.

- [ ] **Step 6: Commit**

```bash
git add scripts/scraper/merge.ts src/__tests__/scripts/scraper/merge.test.ts package.json
git commit -m "feat(scraper): merge step writes JSON dumps to scraped_vendors"
```

---

## Milestone 4 — Match service (signup-time dedup)

### Task 14: `match.ts` — server-side fuzzy match

**Files:**

- Create: `src/lib/scraped-vendor/match.ts`
- Test: `src/__tests__/lib/scraped-vendor/match.test.ts`

- [ ] **Step 1: Write the failing integration test**

```typescript
// src/__tests__/lib/scraped-vendor/match.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServiceRoleClient } from '../../../lib/supabase/server';
import { findMatches } from '../../../lib/scraped-vendor/match';

const skip = !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY;
const TEST_TAG = `__match_test_${Date.now()}__`;

describe.skipIf(skip)('findMatches (integration)', () => {
  beforeAll(async () => {
    const supabase = await createServiceRoleClient();
    await supabase.from('scraped_vendors').insert([
      {
        source: 'hand_curated',
        business_name: 'Premium Chai Wallah',
        city: 'Chicago',
        state: 'IL',
        instagram_handle: 'premiumchaiwallah',
        tags: [TEST_TAG],
        photos: [],
        raw: {},
      },
      {
        source: 'hand_curated',
        business_name: 'Chai Cart Chicago',
        city: 'Chicago',
        state: 'IL',
        phone: '+13125559999',
        tags: [TEST_TAG],
        photos: [],
        raw: {},
      },
    ]);
  });
  afterAll(async () => {
    const supabase = await createServiceRoleClient();
    await supabase.from('scraped_vendors').delete().contains('tags', [TEST_TAG]);
  });

  it('matches on exact IG handle', async () => {
    const matches = await findMatches({
      businessName: '',
      city: '',
      instagramHandle: 'premiumchaiwallah',
      phone: null,
    });
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(matches[0].business_name).toBe('Premium Chai Wallah');
  });

  it('matches on phone', async () => {
    const matches = await findMatches({
      businessName: '',
      city: '',
      instagramHandle: null,
      phone: '+13125559999',
    });
    expect(matches.find((m) => m.business_name === 'Chai Cart Chicago')).toBeDefined();
  });

  it('matches on fuzzy name+city via trigram', async () => {
    const matches = await findMatches({
      businessName: 'Premium Chai Walla', // missing trailing "h"
      city: 'Chicago',
      instagramHandle: null,
      phone: null,
    });
    expect(matches.find((m) => m.business_name === 'Premium Chai Wallah')).toBeDefined();
  });

  it('returns empty for no signals', async () => {
    const matches = await findMatches({
      businessName: '',
      city: '',
      instagramHandle: null,
      phone: null,
    });
    expect(matches).toEqual([]);
  });

  it('excludes already-claimed rows', async () => {
    const supabase = await createServiceRoleClient();
    await supabase
      .from('scraped_vendors')
      .update({ claimed_at: new Date().toISOString() })
      .eq('instagram_handle', 'premiumchaiwallah');
    const matches = await findMatches({
      businessName: '',
      city: '',
      instagramHandle: 'premiumchaiwallah',
      phone: null,
    });
    expect(matches.length).toBe(0);
  });
});
```

- [ ] **Step 2: Run, confirm fail**

```bash
npm test -- --run src/__tests__/lib/scraped-vendor/match.test.ts
```

Expected: fail.

- [ ] **Step 3: Implement `match.ts`**

```typescript
// src/lib/scraped-vendor/match.ts
import { createServiceRoleClient } from '@/lib/supabase/server';
import { normalizeInstagramHandle, normalizePhone } from '../../../scripts/scraper/lib/normalize';

export interface MatchInput {
  businessName: string;
  city: string;
  instagramHandle: string | null;
  phone: string | null;
}

export interface ScrapedVendorMatch {
  id: string;
  business_name: string;
  category: string | null;
  city: string | null;
  instagram_handle: string | null;
  photos: string[];
  bio: string | null;
  similarity_score: number; // 1.0 for IG/phone exact, 0..1 for name fuzzy
}

const MIN_SIMILARITY = 0.5;
const MAX_RESULTS = 5;

export async function findMatches(input: MatchInput): Promise<ScrapedVendorMatch[]> {
  const supabase = await createServiceRoleClient();
  const matches = new Map<string, ScrapedVendorMatch>();

  const ig = normalizeInstagramHandle(input.instagramHandle);
  const phone = normalizePhone(input.phone);

  if (ig) {
    const { data } = await supabase
      .from('scraped_vendors')
      .select('id, business_name, category, city, instagram_handle, photos, bio')
      .eq('instagram_handle', ig)
      .is('claimed_at', null);
    for (const row of data ?? []) {
      matches.set(row.id, { ...row, similarity_score: 1.0 });
    }
  }

  if (phone) {
    const { data } = await supabase
      .from('scraped_vendors')
      .select('id, business_name, category, city, instagram_handle, photos, bio')
      .eq('phone', phone)
      .is('claimed_at', null);
    for (const row of data ?? []) {
      if (!matches.has(row.id)) matches.set(row.id, { ...row, similarity_score: 1.0 });
    }
  }

  if (input.businessName && input.city) {
    const { data } = await supabase.rpc('match_scraped_vendors_by_name', {
      p_name: input.businessName,
      p_city: input.city,
      p_min_similarity: MIN_SIMILARITY,
      p_limit: MAX_RESULTS,
    });
    for (const row of (data as any[]) ?? []) {
      if (!matches.has(row.id)) {
        matches.set(row.id, {
          id: row.id,
          business_name: row.business_name,
          category: row.category,
          city: row.city,
          instagram_handle: row.instagram_handle,
          photos: row.photos,
          bio: row.bio,
          similarity_score: row.similarity_score,
        });
      }
    }
  }

  return Array.from(matches.values())
    .sort((a, b) => b.similarity_score - a.similarity_score)
    .slice(0, MAX_RESULTS);
}
```

- [ ] **Step 4: Add helper RPC for trigram lookup (migration 00049)**

Create `supabase/migrations/00049_match_scraped_vendors_rpc.sql`:

```sql
-- Trigram-based fuzzy match RPC used by signup-time match.ts.
CREATE OR REPLACE FUNCTION match_scraped_vendors_by_name(
  p_name text,
  p_city text,
  p_min_similarity real DEFAULT 0.5,
  p_limit integer DEFAULT 5
) RETURNS TABLE (
  id uuid, business_name text, category text, city text,
  instagram_handle text, photos text[], bio text, similarity_score real
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT sv.id, sv.business_name, sv.category, sv.city,
         sv.instagram_handle, sv.photos, sv.bio,
         similarity(sv.business_name, p_name) AS similarity_score
  FROM scraped_vendors sv
  WHERE sv.claimed_at IS NULL
    AND lower(sv.city) = lower(p_city)
    AND sv.business_name % p_name
    AND similarity(sv.business_name, p_name) >= p_min_similarity
  ORDER BY similarity(sv.business_name, p_name) DESC
  LIMIT p_limit;
$$;

REVOKE EXECUTE ON FUNCTION match_scraped_vendors_by_name FROM PUBLIC;
GRANT EXECUTE ON FUNCTION match_scraped_vendors_by_name TO authenticated, service_role;
```

Apply to dev:

```bash
PGPASSWORD='<dev-password>' psql \
  -h db.lquvhjedlzubqusnfaak.supabase.co -p 5432 -U postgres -d postgres \
  -f supabase/migrations/00049_match_scraped_vendors_rpc.sql
```

Expected: `CREATE FUNCTION`, `REVOKE`, `GRANT`.

- [ ] **Step 5: Re-run match tests**

```bash
npm test -- --run src/__tests__/lib/scraped-vendor/match.test.ts
```

Expected: all 5 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/scraped-vendor/match.ts src/__tests__/lib/scraped-vendor/match.test.ts \
       supabase/migrations/00049_match_scraped_vendors_rpc.sql
git commit -m "feat(scraped-vendor): findMatches + match_scraped_vendors_by_name RPC"
```

---

### Task 15: `/api/scraped-vendors/match` API route

**Files:**

- Create: `src/app/api/scraped-vendors/match/route.ts`
- Test: `src/__tests__/api/scraped-vendor-match.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/__tests__/api/scraped-vendor-match.test.ts
import { describe, expect, it, vi } from 'vitest';
import { POST } from '../../app/api/scraped-vendors/match/route';
import * as matchLib from '../../lib/scraped-vendor/match';
import * as authLib from '../../lib/api/auth';

describe('POST /api/scraped-vendors/match', () => {
  it('returns 401 when no user', async () => {
    vi.spyOn(authLib, 'requireUser').mockResolvedValueOnce({ ok: false, status: 401 } as any);
    const req = new Request('http://t/', { method: 'POST', body: JSON.stringify({}) });
    const res = await POST(req as any);
    expect(res.status).toBe(401);
  });

  it('returns matches array on valid input', async () => {
    vi.spyOn(authLib, 'requireUser').mockResolvedValueOnce({
      ok: true,
      user: { id: 'u1' },
    } as any);
    vi.spyOn(matchLib, 'findMatches').mockResolvedValueOnce([
      {
        id: 'sv1',
        business_name: 'X',
        category: 'carts',
        city: 'Chicago',
        instagram_handle: 'x',
        photos: [],
        bio: null,
        similarity_score: 1,
      },
    ]);
    const req = new Request('http://t/', {
      method: 'POST',
      body: JSON.stringify({ businessName: 'X', city: 'Chicago' }),
    });
    const res = await POST(req as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.matches).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run, confirm fail**

```bash
npm test -- --run src/__tests__/api/scraped-vendor-match.test.ts
```

Expected: fail (route doesn't exist).

- [ ] **Step 3: Implement the route**

```typescript
// src/app/api/scraped-vendors/match/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/api/auth';
import { findMatches } from '@/lib/scraped-vendor/match';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  businessName: z.string().default(''),
  city: z.string().default(''),
  instagramHandle: z.string().nullable().default(null),
  phone: z.string().nullable().default(null),
});

export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'invalid body' }, { status: 400 });

  const matches = await findMatches({
    businessName: parsed.data.businessName,
    city: parsed.data.city,
    instagramHandle: parsed.data.instagramHandle,
    phone: parsed.data.phone,
  });

  return NextResponse.json({ matches });
}
```

- [ ] **Step 4: Re-run tests**

```bash
npm test -- --run src/__tests__/api/scraped-vendor-match.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/scraped-vendors/match/route.ts src/__tests__/api/scraped-vendor-match.test.ts
git commit -m "feat(api): POST /api/scraped-vendors/match returns fuzzy candidates"
```

---

### Task 16: `promote.ts` — link scraped row → vendor_profiles

**Files:**

- Create: `src/lib/scraped-vendor/promote.ts`
- Test: `src/__tests__/lib/scraped-vendor/promote.test.ts`

- [ ] **Step 1: Write the failing integration test**

```typescript
// src/__tests__/lib/scraped-vendor/promote.test.ts
import { afterEach, describe, expect, it } from 'vitest';
import { createServiceRoleClient } from '../../../lib/supabase/server';
import { promoteScrapedVendor } from '../../../lib/scraped-vendor/promote';

const skip = !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY;
const TEST_TAG = `__promote_test_${Date.now()}__`;

describe.skipIf(skip)('promoteScrapedVendor (integration)', () => {
  afterEach(async () => {
    const supabase = await createServiceRoleClient();
    await supabase.from('scraped_vendors').delete().contains('tags', [TEST_TAG]);
    await supabase.from('vendor_profiles').delete().like('business_name', 'Promote Test%');
  });

  it('copies scraped fields into a new vendor_profile, marks scraped row claimed', async () => {
    const supabase = await createServiceRoleClient();
    // Need a real user to FK the vendor_profile.user_id against.
    const {
      data: { user },
    } = await supabase.auth.admin.createUser({
      email: `promote-test-${Date.now()}@example.com`,
      password: 'TestPwd1!',
      email_confirm: true,
    });
    if (!user) throw new Error('seed failed');

    const { data: scraped } = await supabase
      .from('scraped_vendors')
      .insert({
        source: 'hand_curated',
        business_name: 'Promote Test Cart',
        category: 'carts',
        tags: [TEST_TAG],
        city: 'Chicago',
        state: 'IL',
        instagram_handle: `promote_${Date.now()}`,
        bio: 'A test cart for promotion.',
        photos: ['https://cdn.test/x.jpg'],
        raw: {},
      })
      .select()
      .single();

    const profile = await promoteScrapedVendor(scraped!.id, user.id);

    expect(profile.business_name).toBe('Promote Test Cart');
    expect(profile.category).toBe('carts');
    expect(profile.user_id).toBe(user.id);

    const { data: refreshed } = await supabase
      .from('scraped_vendors')
      .select('claimed_at, claimed_vendor_profile_id')
      .eq('id', scraped!.id)
      .single();
    expect(refreshed?.claimed_at).not.toBeNull();
    expect(refreshed?.claimed_vendor_profile_id).toBe(profile.id);

    await supabase.auth.admin.deleteUser(user.id);
  });
});
```

- [ ] **Step 2: Run, confirm fail**

```bash
npm test -- --run src/__tests__/lib/scraped-vendor/promote.test.ts
```

Expected: fail.

- [ ] **Step 3: Implement `promote.ts`**

```typescript
// src/lib/scraped-vendor/promote.ts
import { createServiceRoleClient } from '@/lib/supabase/server';

export interface PromotedProfile {
  id: string;
  user_id: string;
  business_name: string;
  category: string | null;
}

export async function promoteScrapedVendor(
  scrapedVendorId: string,
  userId: string
): Promise<PromotedProfile> {
  const supabase = await createServiceRoleClient();

  const { data: sv, error: svErr } = await supabase
    .from('scraped_vendors')
    .select('*')
    .eq('id', scrapedVendorId)
    .single();
  if (svErr || !sv) throw new Error(`scraped_vendor not found: ${scrapedVendorId}`);
  if (sv.claimed_at) throw new Error('already claimed');

  const { data: profile, error: profErr } = await supabase
    .from('vendor_profiles')
    .insert({
      user_id: userId,
      business_name: sv.business_name,
      category: sv.category,
      bio: sv.bio,
      instagram_handle: sv.instagram_handle,
      portfolio_images: sv.photos,
      base_city: sv.city,
      base_state: sv.state,
      base_postal_code: sv.postal_code,
      is_active: false,
      onboarding_complete: false,
    })
    .select()
    .single();
  if (profErr || !profile) throw new Error(profErr?.message ?? 'insert failed');

  const { error: updErr } = await supabase
    .from('scraped_vendors')
    .update({
      claimed_at: new Date().toISOString(),
      claimed_vendor_profile_id: profile.id,
    })
    .eq('id', scrapedVendorId);
  if (updErr) throw new Error(updErr.message);

  return {
    id: profile.id,
    user_id: profile.user_id,
    business_name: profile.business_name,
    category: profile.category,
  };
}
```

- [ ] **Step 4: Re-run tests**

```bash
npm test -- --run src/__tests__/lib/scraped-vendor/promote.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/scraped-vendor/promote.ts src/__tests__/lib/scraped-vendor/promote.test.ts
git commit -m "feat(scraped-vendor): promoteScrapedVendor links staging row to vendor_profile"
```

---

### Task 17: Wizard step 1 — "Is this you?" prompt

**Files:**

- Create: `src/components/onboarding/ScrapedVendorMatchPrompt.tsx`
- Modify: `src/components/onboarding/StepBasics.tsx`
- Test: `src/__tests__/components/onboarding/ScrapedVendorMatchPrompt.test.tsx`

- [ ] **Step 1: Read the current StepBasics.tsx to understand its submit flow**

```bash
cat src/components/onboarding/StepBasics.tsx | head -100
```

- [ ] **Step 2: Write the component test**

```typescript
// src/__tests__/components/onboarding/ScrapedVendorMatchPrompt.test.tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ScrapedVendorMatchPrompt } from '../../../components/onboarding/ScrapedVendorMatchPrompt';

const fakeMatch = {
  id: 'sv1', business_name: 'Best Cart', category: 'carts',
  city: 'Chicago', instagram_handle: 'bestcart',
  photos: ['https://cdn.test/x.jpg'], bio: 'A cart',
  similarity_score: 1,
};

describe('<ScrapedVendorMatchPrompt>', () => {
  it('renders one card per match', () => {
    render(<ScrapedVendorMatchPrompt matches={[fakeMatch]} onPick={vi.fn()} onReject={vi.fn()} />);
    expect(screen.getByText(/Best Cart/i)).toBeInTheDocument();
  });

  it('calls onPick(match.id) when a candidate is selected', () => {
    const onPick = vi.fn();
    render(<ScrapedVendorMatchPrompt matches={[fakeMatch]} onPick={onPick} onReject={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /yes.*this/i }));
    expect(onPick).toHaveBeenCalledWith('sv1');
  });

  it('calls onReject() when "none of these" clicked', () => {
    const onReject = vi.fn();
    render(<ScrapedVendorMatchPrompt matches={[fakeMatch]} onPick={vi.fn()} onReject={onReject} />);
    fireEvent.click(screen.getByRole('button', { name: /none of these/i }));
    expect(onReject).toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run, confirm fail**

```bash
npm test -- --run src/__tests__/components/onboarding/ScrapedVendorMatchPrompt.test.tsx
```

Expected: fail.

- [ ] **Step 4: Implement the component**

```tsx
// src/components/onboarding/ScrapedVendorMatchPrompt.tsx
'use client';
import type { ScrapedVendorMatch } from '@/lib/scraped-vendor/match';

interface Props {
  matches: ScrapedVendorMatch[];
  onPick: (id: string) => void;
  onReject: () => void;
}

export function ScrapedVendorMatchPrompt({ matches, onPick, onReject }: Props) {
  return (
    <div className="my-4 rounded-lg border bg-muted/30 p-4">
      <h3 className="mb-2 text-lg font-semibold">We think we already know your business</h3>
      <p className="mb-4 text-sm text-muted-foreground">
        Pick the one that&apos;s yours so we can pre-fill the rest.
      </p>
      <div className="space-y-3">
        {matches.map((m) => (
          <div key={m.id} className="flex gap-3 rounded-md border bg-background p-3">
            {m.photos[0] && (
              <img src={m.photos[0]} alt="" className="h-16 w-16 rounded object-cover" />
            )}
            <div className="flex-1">
              <p className="font-medium">{m.business_name}</p>
              <p className="text-xs text-muted-foreground">
                {m.category ?? 'category unknown'} · {m.city ?? 'unknown city'}
                {m.instagram_handle && ` · @${m.instagram_handle}`}
              </p>
              {m.bio && <p className="mt-1 line-clamp-2 text-sm">{m.bio}</p>}
            </div>
            <button
              type="button"
              onClick={() => onPick(m.id)}
              className="rounded-md bg-ink px-3 py-1 text-sm text-cream hover:opacity-90"
            >
              Yes, this is mine
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={onReject}
        className="mt-4 text-sm text-muted-foreground underline"
      >
        None of these — start fresh
      </button>
    </div>
  );
}
```

- [ ] **Step 5: Wire into StepBasics**

Read current StepBasics.tsx, then modify the submit handler. Add this state + logic before render:

```tsx
// Inside StepBasics
const [pendingMatches, setPendingMatches] = useState<ScrapedVendorMatch[] | null>(null);
const [pendingFormValues, setPendingFormValues] = useState<FormValues | null>(null);

async function handleSubmit(values: FormValues) {
  // Before saving step 1, check for scraped-vendor matches
  const res = await fetch('/api/scraped-vendors/match', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      businessName: values.businessName,
      city: values.city ?? '',
      instagramHandle: values.instagramHandle ?? null,
      phone: null, // step 1 doesn't capture phone
    }),
  });
  const { matches } = (await res.json()) as { matches: ScrapedVendorMatch[] };
  if (matches.length > 0) {
    setPendingMatches(matches);
    setPendingFormValues(values);
    return;
  }
  // No matches → existing submit path
  await saveStepBasics(values);
}

async function onMatchPick(scrapedVendorId: string) {
  await fetch('/api/scraped-vendors/claim', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ scrapedVendorId }),
  });
  // existing post-save navigation to next step
}

async function onMatchReject() {
  // Existing submit path
  if (pendingFormValues) await saveStepBasics(pendingFormValues);
  setPendingMatches(null);
}
```

In render, before the form:

```tsx
{
  pendingMatches && (
    <ScrapedVendorMatchPrompt
      matches={pendingMatches}
      onPick={onMatchPick}
      onReject={onMatchReject}
    />
  );
}
```

- [ ] **Step 6: Add /api/scraped-vendors/claim endpoint for the "yes that's me" case**

Create `src/app/api/scraped-vendors/claim/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/api/auth';
import { promoteScrapedVendor } from '@/lib/scraped-vendor/promote';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({ scrapedVendorId: z.string().uuid() });

export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'invalid body' }, { status: 400 });

  try {
    const profile = await promoteScrapedVendor(parsed.data.scrapedVendorId, auth.user.id);
    return NextResponse.json({ profile });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 400 });
  }
}
```

- [ ] **Step 7: Run all relevant tests**

```bash
npm test -- --run src/__tests__/components/onboarding/ScrapedVendorMatchPrompt.test.tsx
npm test -- --run src/__tests__/lib/scraped-vendor/
```

Expected: all green.

- [ ] **Step 8: Verify in browser**

```bash
npm run dev
```

Open `localhost:3000`, sign up as a new vendor, go through step 1 with `businessName: "Example Chai Cart"`, `instagramHandle: "examplechaicart_seed"`. Confirm "Is this you?" prompt renders with the seeded entry from Task 12.

- [ ] **Step 9: Commit**

```bash
git add src/components/onboarding/ScrapedVendorMatchPrompt.tsx \
       src/components/onboarding/StepBasics.tsx \
       src/app/api/scraped-vendors/claim/route.ts \
       src/__tests__/components/onboarding/ScrapedVendorMatchPrompt.test.tsx
git commit -m "feat(onboarding): wire ScrapedVendorMatchPrompt into wizard step 1"
```

---

## Milestone 5 — Claim flow (token + route)

### Task 18: `mint-tokens.ts` — generate tokens for an outreach batch

**Files:**

- Create: `scripts/scraper/mint-tokens.ts`

- [ ] **Step 1: Implement**

```typescript
// scripts/scraper/mint-tokens.ts
import fs from 'node:fs/promises';
import path from 'node:path';
import { createServiceRoleClient } from '../../src/lib/supabase/server';
import { mintTokenString, hashTokenString } from './lib/claim-token';

interface Args {
  campaign: string;
  filter: string;
  ttlDays: number;
}

function parseArgs(argv: string[]): Args {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) args[argv[i].slice(2)] = argv[i + 1];
  }
  if (!args.campaign) throw new Error('--campaign required');
  if (!args.filter) throw new Error('--filter required (SQL WHERE clause)');
  return {
    campaign: args.campaign,
    filter: args.filter,
    ttlDays: Number(args['ttl-days'] ?? '90'),
  };
}

async function main() {
  const { campaign, filter, ttlDays } = parseArgs(process.argv.slice(2));
  const supabase = await createServiceRoleClient();

  // SECURITY: --filter is a raw SQL fragment we trust the operator with.
  // Run from a controlled CLI shell only; never from user input.
  const { data: vendors, error } = await supabase.rpc('select_scraped_vendors_for_mint', {
    p_where: filter,
  });
  if (error) throw error;
  if (!vendors || vendors.length === 0) {
    console.log('no vendors matched');
    return;
  }

  const expiresAt = new Date(Date.now() + ttlDays * 86400_000).toISOString();
  const csvRows = ['scraped_vendor_id,business_name,instagram_handle,claim_url,campaign'];
  let minted = 0;
  for (const v of vendors as Array<{
    id: string;
    business_name: string;
    instagram_handle: string | null;
  }>) {
    const token = mintTokenString(v.id);
    const hash = hashTokenString(token);
    const { error: insErr } = await supabase.from('claim_tokens').insert({
      scraped_vendor_id: v.id,
      token_hash: hash,
      expires_at: expiresAt,
      campaign_label: campaign,
    });
    if (insErr) {
      console.warn(`skip ${v.id}: ${insErr.message}`);
      continue;
    }
    const claimUrl = `${process.env.NEXT_PUBLIC_APP_URL}/claim/${token}`;
    csvRows.push(
      [v.id, JSON.stringify(v.business_name), v.instagram_handle ?? '', claimUrl, campaign].join(
        ','
      )
    );
    minted++;
  }

  const outFile = path.join(process.cwd(), `mint-tokens-${campaign}.csv`);
  await fs.writeFile(outFile, csvRows.join('\n'));
  console.log(`minted ${minted} tokens; wrote ${outFile}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2: Add the helper RPC (migration 00050)**

Create `supabase/migrations/00050_select_scraped_vendors_for_mint_rpc.sql`:

```sql
-- RPC used by mint-tokens.ts to safely apply an operator-supplied filter.
-- Function body validates the WHERE fragment by only allowing whitelisted column refs.
-- Service-role only.

CREATE OR REPLACE FUNCTION select_scraped_vendors_for_mint(p_where text)
RETURNS TABLE (id uuid, business_name text, instagram_handle text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  q text;
BEGIN
  -- Whitelist columns referenced in p_where: any other identifier rejected.
  IF p_where ~* '\\b(drop|truncate|delete|update|insert|alter|grant|revoke)\\b' THEN
    RAISE EXCEPTION 'forbidden keyword in filter';
  END IF;
  q := 'SELECT id, business_name, instagram_handle FROM scraped_vendors '
       || 'WHERE claimed_at IS NULL AND (' || p_where || ')';
  RETURN QUERY EXECUTE q;
END;
$$;

REVOKE EXECUTE ON FUNCTION select_scraped_vendors_for_mint FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION select_scraped_vendors_for_mint TO service_role;
```

Apply:

```bash
PGPASSWORD='<dev-password>' psql \
  -h db.lquvhjedlzubqusnfaak.supabase.co -p 5432 -U postgres -d postgres \
  -f supabase/migrations/00050_select_scraped_vendors_for_mint_rpc.sql
```

- [ ] **Step 3: Smoke-test the script**

```bash
npx tsx scripts/scraper/mint-tokens.ts \
  --campaign smoke-test \
  --filter "category = 'carts' AND city = 'Chicago'"
```

Expected: `minted 1 tokens` (the hand-curated seed), writes `mint-tokens-smoke-test.csv`.

- [ ] **Step 4: Add npm script**

`package.json`:

```json
"scrape:mint-tokens": "tsx scripts/scraper/mint-tokens.ts",
```

- [ ] **Step 5: Commit**

```bash
git add scripts/scraper/mint-tokens.ts package.json \
       supabase/migrations/00050_select_scraped_vendors_for_mint_rpc.sql
git commit -m "feat(scraper): mint-tokens CLI + filter-RPC for outreach batches"
```

---

### Task 19: `/claim/[token]` route — happy path

**Files:**

- Create: `src/app/claim/[token]/page.tsx`
- Create: `src/app/claim/[token]/claim-actions.ts`

- [ ] **Step 1: Implement the server action**

```typescript
// src/app/claim/[token]/claim-actions.ts
'use server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { hashTokenString, parseTokenString } from '../../../../scripts/scraper/lib/claim-token';
import { promoteScrapedVendor } from '@/lib/scraped-vendor/promote';

export interface ClaimResult {
  ok: boolean;
  reason?: 'invalid' | 'expired' | 'revoked' | 'already_claimed' | 'unknown';
  profileId?: string;
}

export async function verifyAndConsumeToken(token: string, userId: string): Promise<ClaimResult> {
  const parsed = parseTokenString(token);
  if (!parsed) return { ok: false, reason: 'invalid' };

  const supabase = await createServiceRoleClient();
  const hash = hashTokenString(token);
  const { data, error } = await supabase
    .from('claim_tokens')
    .select('id, scraped_vendor_id, expires_at, claimed_at, revoked_at')
    .eq('token_hash', hash)
    .maybeSingle();
  if (error || !data) return { ok: false, reason: 'invalid' };
  if (data.revoked_at) return { ok: false, reason: 'revoked' };
  if (data.claimed_at) return { ok: false, reason: 'already_claimed' };
  if (new Date(data.expires_at).getTime() < Date.now()) return { ok: false, reason: 'expired' };

  try {
    const profile = await promoteScrapedVendor(data.scraped_vendor_id, userId);
    await supabase
      .from('claim_tokens')
      .update({
        claimed_at: new Date().toISOString(),
        claimed_by_user_id: userId,
      })
      .eq('id', data.id);
    return { ok: true, profileId: profile.id };
  } catch {
    return { ok: false, reason: 'unknown' };
  }
}
```

- [ ] **Step 2: Implement the route**

```tsx
// src/app/claim/[token]/page.tsx
import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { verifyAndConsumeToken } from './claim-actions';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ token: string }>;
}

export default async function ClaimPage({ params }: Props) {
  const { token } = await params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/signup?return_to=${encodeURIComponent(`/claim/${token}`)}`);
  }

  const result = await verifyAndConsumeToken(token, user.id);

  if (result.ok) {
    redirect('/dashboard/profile/setup');
  }

  // Error case rendered as a static page
  const reasons: Record<NonNullable<typeof result.reason>, string> = {
    invalid: 'This claim link is not valid. Make sure you used the link from your message.',
    expired: 'This claim link has expired. Reply to the original message and we’ll send a new one.',
    revoked:
      'This claim link has been revoked. Reply to the original message and we’ll send a new one.',
    already_claimed: 'This business has already been claimed. Sign in instead.',
    unknown: 'Something went wrong. Please try again or contact support.',
  };

  return (
    <main className="mx-auto max-w-md p-8 text-center">
      <h1 className="mb-4 text-2xl font-semibold">Couldn’t claim</h1>
      <p>{reasons[result.reason ?? 'unknown']}</p>
    </main>
  );
}
```

- [ ] **Step 3: Smoke-test by hand**

Use the token from `mint-tokens-smoke-test.csv` (the `claim_url` field). Open in browser. Expected: redirect to `/dashboard/profile/setup` with the seed cart prefilled as your profile.

Then verify in DB:

```bash
PGPASSWORD='<dev-password>' psql \
  -h db.lquvhjedlzubqusnfaak.supabase.co -p 5432 -U postgres -d postgres \
  -c "SELECT business_name, claimed_at IS NOT NULL AS claimed FROM scraped_vendors WHERE business_name = 'Example Chai Cart';"
```

Expected: `claimed | t`.

- [ ] **Step 4: Commit**

```bash
git add src/app/claim
git commit -m "feat(claim): /claim/[token] route + verifyAndConsumeToken server action"
```

---

### Task 20: `/claim/[token]` e2e tests

**Files:**

- Create: `tests/e2e/claim-flow.spec.ts`

- [ ] **Step 1: Write the e2e spec**

```typescript
// tests/e2e/claim-flow.spec.ts
import { test, expect } from '@playwright/test';
import { createServiceRoleClient } from '../../src/lib/supabase/server';
import { mintTokenString, hashTokenString } from '../../scripts/scraper/lib/claim-token';
import { seedCouple, cleanup, type TestUser } from './helpers/seed';
import { loginAs } from './helpers/login';

test.describe('claim flow', () => {
  let user: TestUser | null = null;
  let scrapedVendorId: string | null = null;
  let createdToken: string | null = null;

  test.afterEach(async () => {
    if (cleanup) await cleanup(user);
    user = null;
    if (scrapedVendorId) {
      const supabase = await createServiceRoleClient();
      await supabase.from('scraped_vendors').delete().eq('id', scrapedVendorId);
      scrapedVendorId = null;
    }
  });

  async function seedScrapedVendor(): Promise<string> {
    const supabase = await createServiceRoleClient();
    const { data } = await supabase
      .from('scraped_vendors')
      .insert({
        source: 'hand_curated',
        business_name: 'E2E Test Cart',
        category: 'carts',
        tags: ['__e2e__'],
        city: 'Chicago',
        state: 'IL',
        photos: [],
        raw: {},
      })
      .select('id')
      .single();
    return data!.id;
  }

  test('valid token → redirects to setup with profile created', async ({ page }) => {
    scrapedVendorId = await seedScrapedVendor();
    user = await seedCouple();
    const token = mintTokenString(scrapedVendorId);
    const supabase = await createServiceRoleClient();
    await supabase.from('claim_tokens').insert({
      scraped_vendor_id: scrapedVendorId,
      token_hash: hashTokenString(token),
      expires_at: new Date(Date.now() + 86400_000).toISOString(),
    });
    await loginAs(page, user);
    await page.goto(`/claim/${token}`);
    await expect(page).toHaveURL(/\/dashboard\/profile\/setup/);
  });

  test('expired token → renders expired error', async ({ page }) => {
    scrapedVendorId = await seedScrapedVendor();
    user = await seedCouple();
    const token = mintTokenString(scrapedVendorId);
    const supabase = await createServiceRoleClient();
    await supabase.from('claim_tokens').insert({
      scraped_vendor_id: scrapedVendorId,
      token_hash: hashTokenString(token),
      expires_at: new Date(Date.now() - 1000).toISOString(),
    });
    await loginAs(page, user);
    await page.goto(`/claim/${token}`);
    await expect(page.getByText(/expired/i)).toBeVisible();
  });

  test('invalid token → renders invalid error', async ({ page }) => {
    user = await seedCouple();
    await loginAs(page, user);
    await page.goto('/claim/garbage-token-12345');
    await expect(page.getByText(/not valid/i)).toBeVisible();
  });

  test('unauthenticated → redirects to signup with return_to', async ({ page }) => {
    scrapedVendorId = await seedScrapedVendor();
    const token = mintTokenString(scrapedVendorId);
    const supabase = await createServiceRoleClient();
    await supabase.from('claim_tokens').insert({
      scraped_vendor_id: scrapedVendorId,
      token_hash: hashTokenString(token),
      expires_at: new Date(Date.now() + 86400_000).toISOString(),
    });
    await page.goto(`/claim/${token}`);
    await expect(page).toHaveURL(/\/signup\?return_to=/);
  });
});
```

- [ ] **Step 2: Run the e2e suite**

```bash
PLAYWRIGHT_SKIP_WEB_SERVER=1 npx playwright test tests/e2e/claim-flow.spec.ts
```

(Dev server must be running locally on :3000.)

Expected: all 4 specs pass.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/claim-flow.spec.ts
git commit -m "test(e2e): claim-flow happy + expired + invalid + unauth paths"
```

---

## Milestone 6 — Google Places source

### Task 21: `sources/google-maps.ts` — per-category × per-locale queries

**Files:**

- Create: `scripts/scraper/sources/google-maps.ts`
- Create: `scripts/scraper/data/chicago-locales.ts`

- [ ] **Step 1: Install the Places API SDK**

```bash
npm install @googlemaps/google-maps-services-js
```

- [ ] **Step 2: Locale + category catalog**

```typescript
// scripts/scraper/data/chicago-locales.ts
export const CHICAGO_METRO_LOCALES = [
  // Chicago city
  'Devon Avenue Chicago IL',
  'West Ridge Chicago IL',
  'West Loop Chicago IL',
  // North suburbs
  'Skokie IL',
  'Niles IL',
  'Morton Grove IL',
  'Lincolnwood IL',
  // NW suburbs
  'Schaumburg IL',
  'Hoffman Estates IL',
  'Palatine IL',
  'Mount Prospect IL',
  // West suburbs
  'Naperville IL',
  'Aurora IL',
  'Lombard IL',
  'Westmont IL',
  'Lisle IL',
  'Oak Brook IL',
  'Wood Dale IL',
  'Bartlett IL',
  // SW suburbs
  'Bridgeview IL',
  'Orland Park IL',
  'Tinley Park IL',
  'Burbank IL',
  'Bolingbrook IL',
  // Downstate
  'Champaign IL',
  'Urbana IL',
  'Bloomington IL',
  'Normal IL',
  'Springfield IL',
  'Peoria IL',
];

export const CATEGORY_TO_PLACES_QUERY: Record<string, string[]> = {
  photography: ['wedding photographer'],
  videography: ['wedding videographer'],
  mehndi: ['mehndi artist', 'henna artist'],
  hair_makeup: ['bridal makeup artist', 'wedding hair stylist'],
  dj: ['wedding dj'],
  photobooth: ['photo booth rental'],
  venue: ['wedding venue', 'banquet hall'],
  live_music: ['wedding band', 'dhol player'],
  decor: ['wedding decorator', 'event florist'],
  carts: ['chai cart rental', 'pani puri stand'],
};
```

- [ ] **Step 3: Implement the source**

```typescript
// scripts/scraper/sources/google-maps.ts
import fs from 'node:fs/promises';
import path from 'node:path';
import { Client } from '@googlemaps/google-maps-services-js';
import { createRateLimiter } from '../lib/rate-limit';
import { emptyManifest, todayRunDate, writeManifest } from '../lib/manifest';
import { CHICAGO_METRO_LOCALES, CATEGORY_TO_PLACES_QUERY } from '../data/chicago-locales';
import type { ScrapedRow } from '../lib/schemas';

const OUTPUT_ROOT = path.join(process.cwd(), 'data/scraped/google-maps');

export async function runGoogleMapsSource(
  opts: { categories?: string[]; locales?: string[] } = {}
): Promise<void> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_MAPS_API_KEY required');

  const runDate = todayRunDate();
  const outDir = path.join(OUTPUT_ROOT, runDate);
  await fs.mkdir(outDir, { recursive: true });
  const manifest = emptyManifest('google_maps', runDate);

  const client = new Client({});
  const limiter = createRateLimiter({ qps: 10, burst: 5, jitterMs: 50 });

  const categories = opts.categories ?? Object.keys(CATEGORY_TO_PLACES_QUERY);
  const locales = opts.locales ?? CHICAGO_METRO_LOCALES;

  for (const category of categories) {
    const queries = CATEGORY_TO_PLACES_QUERY[category] ?? [];
    const categoryRows: ScrapedRow[] = [];

    for (const locale of locales) {
      for (const baseQuery of queries) {
        const query = `${baseQuery} in ${locale}`;
        await limiter.acquire();
        manifest.queries_executed += 1;
        try {
          const resp = await client.textSearch({
            params: { query, key: apiKey, region: 'us' },
            timeout: 10_000,
          });
          for (const place of resp.data.results) {
            if (!place.place_id) continue;
            await limiter.acquire();
            const details = await client.placeDetails({
              params: {
                place_id: place.place_id,
                key: apiKey,
                fields: [
                  'name',
                  'formatted_address',
                  'formatted_phone_number',
                  'website',
                  'geometry',
                  'photos',
                  'types',
                  'address_components',
                ],
              },
              timeout: 10_000,
            });
            const d = details.data.result;
            categoryRows.push({
              source: 'google_maps',
              source_external_id: place.place_id,
              business_name: d.name ?? place.name ?? 'unknown',
              category,
              tags: [],
              city: extractCity(d.address_components),
              state: 'IL',
              postal_code: extractZip(d.address_components),
              lat: d.geometry?.location?.lat,
              lng: d.geometry?.location?.lng,
              phone: d.formatted_phone_number ?? null,
              website: d.website ?? null,
              photos: (d.photos ?? [])
                .slice(0, 5)
                .map(
                  (p) =>
                    `https://maps.googleapis.com/maps/api/place/photo?maxwidth=1200&photo_reference=${p.photo_reference}&key=${apiKey}`
                ),
              raw: { textSearch: place, details: d },
            });
          }
        } catch (e) {
          manifest.errors.push({
            context: query,
            code: 'PLACES_ERROR',
            message: e instanceof Error ? e.message : String(e),
            ts: new Date().toISOString(),
          });
        }
      }
    }

    const filename = path.join(outDir, `${category}.json`);
    await fs.writeFile(filename, JSON.stringify(categoryRows, null, 2));
    manifest.records_returned += categoryRows.length;
    console.log(`google-maps: category=${category} wrote ${categoryRows.length} rows`);
  }

  // Also write a combined rows.json so merge.ts picks it up
  const allRows: ScrapedRow[] = [];
  for (const category of categories) {
    const file = path.join(outDir, `${category}.json`);
    const text = await fs.readFile(file, 'utf8').catch(() => null);
    if (text) allRows.push(...(JSON.parse(text) as ScrapedRow[]));
  }
  await fs.writeFile(path.join(outDir, 'rows.json'), JSON.stringify(allRows, null, 2));

  await writeManifest(outDir, manifest);
}

function extractCity(components?: any[]): string | undefined {
  return components?.find((c) => c.types.includes('locality'))?.long_name;
}
function extractZip(components?: any[]): string | undefined {
  return components?.find((c) => c.types.includes('postal_code'))?.long_name;
}

if (require.main === module) {
  runGoogleMapsSource().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
```

- [ ] **Step 4: Add npm script + test with ONE category, ONE locale**

`package.json`:

```json
"scrape:google-maps": "tsx scripts/scraper/sources/google-maps.ts",
```

Smoke-test with a tiny subset:

```bash
GOOGLE_MAPS_API_KEY='<key>' npx tsx -e "
import { runGoogleMapsSource } from './scripts/scraper/sources/google-maps';
runGoogleMapsSource({ categories: ['photography'], locales: ['Skokie IL'] });
"
```

Expected: `data/scraped/google-maps/<date>/photography.json` with a handful of rows.

- [ ] **Step 5: Commit**

```bash
git add scripts/scraper/sources/google-maps.ts scripts/scraper/data/chicago-locales.ts package.json package-lock.json
git commit -m "feat(scraper): google-maps source — Places API per category × locale"
```

---

## Milestone 7 — Apify Instagram source

### Task 22: `sources/instagram.ts` scaffold + hashtag layer

**Files:**

- Create: `scripts/scraper/sources/instagram.ts`
- Create: `scripts/scraper/data/instagram-targets.ts`

- [ ] **Step 1: Install Apify SDK**

```bash
npm install apify-client
```

- [ ] **Step 2: Targets catalog**

```typescript
// scripts/scraper/data/instagram-targets.ts
export const HASHTAGS_BY_CATEGORY: Record<string, string[]> = {
  carts: [
    'chicagocarts',
    'weddingcartchicago',
    'chaicart',
    'chaistand',
    'panipuristand',
    'kulficart',
    'paancart',
    'dessertcartchicago',
    'cottoncandycartchicago',
    'kebabcart',
    'shawarmacart',
  ],
  mehndi: ['chicagomehndi', 'illinoismehndi', 'mehndiartistchicago', 'hennaartistchicago'],
  hair_makeup: ['chicagobridalmua', 'illinoisbridalmua', 'desiweddingmua'],
  dj: ['chicagoshaadidj', 'desiweddingdjchicago'],
  photography: ['chicagoweddingphotographer', 'desiweddingphotographer'],
  videography: ['chicagoweddingvideo', 'desiweddingvideographerchicago'],
  decor: ['chicagoshaadidecor', 'illinoisweddingdecor'],
  content_creation: ['weddingreelschicago', 'shaadicontentcreator'],
  live_music: ['dholplayerchicago', 'chicagodhol', 'singerchicagoshaadi'],
};

// Top desi wedding venues in Chicago metro — for Layer 2 (location-tagged scraping)
export const VENUE_LOCATIONS = [
  'Drury Lane Theatre Oakbrook Terrace',
  'Royal Banquets Chicago',
  'The Cotillion Banquets',
  'Belvedere Banquets Elk Grove Village',
  'Embassy Banquets Hanover Park',
  'Cocoa Banquet Lombard',
  'Carlisle Banquets Lombard',
  'Naperville Country Club',
  'Hotel Arista Naperville',
];
```

- [ ] **Step 3: Implement (hashtag layer first)**

```typescript
// scripts/scraper/sources/instagram.ts
import fs from 'node:fs/promises';
import path from 'node:path';
import { ApifyClient } from 'apify-client';
import { emptyManifest, todayRunDate, writeManifest } from '../lib/manifest';
import { normalizeInstagramHandle } from '../lib/normalize';
import { HASHTAGS_BY_CATEGORY } from '../data/instagram-targets';
import type { ScrapedRow } from '../lib/schemas';

const OUTPUT_ROOT = path.join(process.cwd(), 'data/scraped/instagram');

export async function runInstagramHashtagLayer(opts: { category?: string } = {}): Promise<void> {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) throw new Error('APIFY_API_TOKEN required');

  const runDate = todayRunDate();
  const outDir = path.join(OUTPUT_ROOT, runDate);
  await fs.mkdir(outDir, { recursive: true });
  const manifest = emptyManifest('instagram', runDate);
  const client = new ApifyClient({ token });

  const categories = opts.category ? [opts.category] : Object.keys(HASHTAGS_BY_CATEGORY);
  const rows: ScrapedRow[] = [];

  for (const category of categories) {
    const hashtags = HASHTAGS_BY_CATEGORY[category];
    if (!hashtags) continue;

    manifest.queries_executed += 1;
    try {
      const run = await client.actor('apify/instagram-hashtag-scraper').call({
        hashtags,
        resultsLimit: 50,
      });
      const { items } = await client.dataset(run.defaultDatasetId).listItems();

      for (const item of items as any[]) {
        const handle = normalizeInstagramHandle(item.ownerUsername);
        if (!handle) continue;
        rows.push({
          source: 'instagram',
          source_external_id: handle,
          business_name: item.ownerFullName ?? handle,
          category,
          tags: [`hashtag:${item.hashtag ?? ''}`],
          city: undefined,
          state: 'IL',
          instagram_handle: handle,
          bio: item.caption ?? undefined,
          photos: (item.images ?? [item.displayUrl]).filter(Boolean).slice(0, 5),
          raw: item,
        });
      }
    } catch (e) {
      manifest.errors.push({
        context: `category=${category}`,
        code: 'APIFY_ERROR',
        message: e instanceof Error ? e.message : String(e),
        ts: new Date().toISOString(),
      });
    }
  }

  manifest.records_returned += rows.length;
  await fs.writeFile(path.join(outDir, 'hashtag-layer.json'), JSON.stringify(rows, null, 2));
  await fs.writeFile(path.join(outDir, 'rows.json'), JSON.stringify(rows, null, 2));
  await writeManifest(outDir, manifest);
  console.log(`instagram hashtag layer: ${rows.length} rows`);
}

if (require.main === module) {
  runInstagramHashtagLayer().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
```

- [ ] **Step 4: Add npm script + smoke test with one category**

`package.json`:

```json
"scrape:instagram:hashtags": "tsx -e \"import('./scripts/scraper/sources/instagram').then(m => m.runInstagramHashtagLayer({ category: process.env.SCRAPE_CATEGORY || 'carts' }))\"",
```

```bash
APIFY_API_TOKEN='<token>' SCRAPE_CATEGORY=carts npm run scrape:instagram:hashtags
```

Expected: `data/scraped/instagram/<date>/hashtag-layer.json` with a non-empty array.

- [ ] **Step 5: Commit**

```bash
git add scripts/scraper/sources/instagram.ts scripts/scraper/data/instagram-targets.ts \
       package.json package-lock.json
git commit -m "feat(scraper): instagram source — hashtag layer (Apify hashtag scraper)"
```

---

### Task 23: Instagram location-tag layer (Layer 2)

**Files:**

- Modify: `scripts/scraper/sources/instagram.ts`

- [ ] **Step 1: Add a new exported function**

In `scripts/scraper/sources/instagram.ts`, add:

```typescript
import { VENUE_LOCATIONS } from '../data/instagram-targets';

export async function runInstagramLocationLayer(): Promise<void> {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) throw new Error('APIFY_API_TOKEN required');
  const client = new ApifyClient({ token });
  const runDate = todayRunDate();
  const outDir = path.join(OUTPUT_ROOT, runDate);
  await fs.mkdir(outDir, { recursive: true });
  const manifest = emptyManifest('instagram', runDate);
  manifest.notes = 'location layer';
  const rows: ScrapedRow[] = [];

  for (const venue of VENUE_LOCATIONS) {
    manifest.queries_executed += 1;
    try {
      const run = await client.actor('apify/instagram-location-scraper').call({
        searchTerm: venue,
        resultsLimit: 30,
      });
      const { items } = await client.dataset(run.defaultDatasetId).listItems();
      for (const item of items as any[]) {
        const handle = normalizeInstagramHandle(item.ownerUsername);
        if (!handle) continue;
        rows.push({
          source: 'instagram',
          source_external_id: handle,
          business_name: item.ownerFullName ?? handle,
          tags: [`venue:${venue}`],
          state: 'IL',
          instagram_handle: handle,
          bio: item.caption ?? undefined,
          photos: (item.images ?? [item.displayUrl]).filter(Boolean).slice(0, 5),
          raw: item,
        });
      }
    } catch (e) {
      manifest.errors.push({
        context: `venue=${venue}`,
        code: 'APIFY_ERROR',
        message: e instanceof Error ? e.message : String(e),
        ts: new Date().toISOString(),
      });
    }
  }

  manifest.records_returned = rows.length;
  await fs.writeFile(path.join(outDir, 'location-layer.json'), JSON.stringify(rows, null, 2));
  await writeManifest(path.join(outDir, '_location-manifest'), manifest);
  console.log(`instagram location layer: ${rows.length} rows`);
}
```

- [ ] **Step 2: Add npm script**

```json
"scrape:instagram:locations": "tsx -e \"import('./scripts/scraper/sources/instagram').then(m => m.runInstagramLocationLayer())\"",
```

- [ ] **Step 3: Smoke-test**

```bash
APIFY_API_TOKEN='<token>' npm run scrape:instagram:locations
```

Expected: `location-layer.json` populated.

- [ ] **Step 4: Commit**

```bash
git add scripts/scraper/sources/instagram.ts package.json
git commit -m "feat(scraper): instagram location-tag layer (Layer 2)"
```

---

### Task 24: Instagram profile-expansion layer (Layer 3)

**Files:**

- Modify: `scripts/scraper/sources/instagram.ts`

- [ ] **Step 1: Add the function**

Append to `scripts/scraper/sources/instagram.ts`:

```typescript
/** Reads existing Layer 1+2 dumps for the run-date, picks the top 30 most-connected handles,
 * runs the IG profile scraper on each to fetch their followers/following, and adds those
 * handles back as Layer 3 candidates. */
export async function runInstagramProfileExpansion(runDate: string): Promise<void> {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) throw new Error('APIFY_API_TOKEN required');
  const dir = path.join(OUTPUT_ROOT, runDate);
  const client = new ApifyClient({ token });
  const manifest = emptyManifest('instagram', runDate);
  manifest.notes = 'profile expansion';

  const seedRows: ScrapedRow[] = [];
  for (const file of ['hashtag-layer.json', 'location-layer.json']) {
    const text = await fs.readFile(path.join(dir, file), 'utf8').catch(() => '[]');
    seedRows.push(...JSON.parse(text));
  }
  const handles = Array.from(
    new Set(seedRows.map((r) => r.instagram_handle).filter(Boolean))
  ) as string[];
  const seeds = handles.slice(0, 30);

  const expanded: ScrapedRow[] = [];
  for (const seed of seeds) {
    manifest.queries_executed += 1;
    try {
      const run = await client.actor('apify/instagram-profile-scraper').call({
        usernames: [seed],
        resultsType: 'details',
      });
      const { items } = await client.dataset(run.defaultDatasetId).listItems();
      for (const profile of items as any[]) {
        const related = [...(profile.related ?? []), ...(profile.followings ?? [])];
        for (const r of related) {
          const h = normalizeInstagramHandle(r.username);
          if (!h) continue;
          expanded.push({
            source: 'instagram',
            source_external_id: h,
            business_name: r.fullName ?? h,
            tags: [`seed:${seed}`],
            state: 'IL',
            instagram_handle: h,
            photos: [],
            raw: { from_profile_expansion: r },
          });
        }
      }
    } catch (e) {
      manifest.errors.push({
        context: `seed=${seed}`,
        code: 'APIFY_ERROR',
        message: e instanceof Error ? e.message : String(e),
        ts: new Date().toISOString(),
      });
    }
  }

  manifest.records_returned = expanded.length;
  await fs.writeFile(
    path.join(dir, 'profile-expansion-layer.json'),
    JSON.stringify(expanded, null, 2)
  );
  await writeManifest(path.join(dir, '_profile-expansion-manifest'), manifest);
  console.log(`instagram profile expansion: ${expanded.length} rows`);
}
```

- [ ] **Step 2: Add npm script**

```json
"scrape:instagram:expand": "tsx -e \"import('./scripts/scraper/sources/instagram').then(m => m.runInstagramProfileExpansion(new Date().toISOString().slice(0,10)))\"",
```

- [ ] **Step 3: Smoke-test (requires Layer 1+2 dumps to exist first)**

```bash
APIFY_API_TOKEN='<token>' npm run scrape:instagram:expand
```

Expected: `profile-expansion-layer.json` populated.

- [ ] **Step 4: Commit**

```bash
git add scripts/scraper/sources/instagram.ts package.json
git commit -m "feat(scraper): instagram profile-expansion layer (Layer 3)"
```

---

### Task 25: Instagram bio-search layer (Layer 4) + combine layers

**Files:**

- Modify: `scripts/scraper/sources/instagram.ts`

- [ ] **Step 1: Add bio-search function + combine helper**

Append to `scripts/scraper/sources/instagram.ts`:

```typescript
const BIO_KEYWORDS = [
  'chicago chai',
  'chicago cart',
  'chicago mehndi',
  'illinois mehndi',
  'illinois cart',
  'desi wedding chicago',
];

export async function runInstagramBioSearch(): Promise<void> {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) throw new Error('APIFY_API_TOKEN required');
  const client = new ApifyClient({ token });
  const runDate = todayRunDate();
  const outDir = path.join(OUTPUT_ROOT, runDate);
  await fs.mkdir(outDir, { recursive: true });
  const manifest = emptyManifest('instagram', runDate);
  manifest.notes = 'bio search';
  const rows: ScrapedRow[] = [];

  for (const q of BIO_KEYWORDS) {
    manifest.queries_executed += 1;
    try {
      const run = await client.actor('apify/instagram-search-scraper').call({
        searchQueries: [q],
        searchType: 'user',
        resultsLimit: 25,
      });
      const { items } = await client.dataset(run.defaultDatasetId).listItems();
      for (const item of items as any[]) {
        const h = normalizeInstagramHandle(item.username);
        if (!h) continue;
        rows.push({
          source: 'instagram',
          source_external_id: h,
          business_name: item.fullName ?? h,
          tags: [`bio:${q}`],
          state: 'IL',
          instagram_handle: h,
          bio: item.biography ?? undefined,
          photos: [],
          raw: item,
        });
      }
    } catch (e) {
      manifest.errors.push({
        context: q,
        code: 'APIFY_ERROR',
        message: e instanceof Error ? e.message : String(e),
        ts: new Date().toISOString(),
      });
    }
  }
  manifest.records_returned = rows.length;
  await fs.writeFile(path.join(outDir, 'bio-search-layer.json'), JSON.stringify(rows, null, 2));
  await writeManifest(path.join(outDir, '_bio-search-manifest'), manifest);
  console.log(`instagram bio search: ${rows.length} rows`);
}

/** After all 4 layers have written their JSONs, combine into a single rows.json
 *  that merge.ts will pick up. Dedups within the run on instagram_handle. */
export async function combineInstagramLayers(runDate: string): Promise<void> {
  const dir = path.join(OUTPUT_ROOT, runDate);
  const files = [
    'hashtag-layer.json',
    'location-layer.json',
    'profile-expansion-layer.json',
    'bio-search-layer.json',
  ];
  const seen = new Set<string>();
  const combined: ScrapedRow[] = [];
  for (const file of files) {
    const text = await fs.readFile(path.join(dir, file), 'utf8').catch(() => '[]');
    for (const row of JSON.parse(text) as ScrapedRow[]) {
      if (!row.instagram_handle) continue;
      if (seen.has(row.instagram_handle)) continue;
      seen.add(row.instagram_handle);
      combined.push(row);
    }
  }
  await fs.writeFile(path.join(dir, 'rows.json'), JSON.stringify(combined, null, 2));
  console.log(`instagram: combined ${combined.length} unique handles into rows.json`);
}
```

- [ ] **Step 2: Add npm scripts**

```json
"scrape:instagram:bio": "tsx -e \"import('./scripts/scraper/sources/instagram').then(m => m.runInstagramBioSearch())\"",
"scrape:instagram:combine": "tsx -e \"import('./scripts/scraper/sources/instagram').then(m => m.combineInstagramLayers(new Date().toISOString().slice(0,10)))\"",
```

- [ ] **Step 3: Smoke-test**

```bash
APIFY_API_TOKEN='<token>' npm run scrape:instagram:bio
APIFY_API_TOKEN='<token>' npm run scrape:instagram:combine
```

Expected: `rows.json` with unique handles across all 4 layers.

- [ ] **Step 4: Commit**

```bash
git add scripts/scraper/sources/instagram.ts package.json
git commit -m "feat(scraper): instagram bio-search layer + 4-layer combine"
```

---

## Milestone 8 — IL Desi/Arab catering

### Task 26: `sources/il-desi-arab-catering.ts`

**Files:**

- Create: `scripts/scraper/sources/il-desi-arab-catering.ts`
- Create: `scripts/scraper/data/catering-cuisines.ts`

- [ ] **Step 1: Cuisine catalog**

```typescript
// scripts/scraper/data/catering-cuisines.ts
export const DESI_ARAB_CUISINES = [
  'Indian restaurant',
  'Pakistani restaurant',
  'Bangladeshi restaurant',
  'Afghan restaurant',
  'Arab restaurant',
  'Lebanese restaurant',
  'Palestinian restaurant',
  'Syrian restaurant',
  'Yemeni restaurant',
  'Persian restaurant',
  'Middle Eastern restaurant',
];
```

- [ ] **Step 2: Implement source**

```typescript
// scripts/scraper/sources/il-desi-arab-catering.ts
import fs from 'node:fs/promises';
import path from 'node:path';
import { Client } from '@googlemaps/google-maps-services-js';
import { createRateLimiter } from '../lib/rate-limit';
import { emptyManifest, todayRunDate, writeManifest } from '../lib/manifest';
import { CHICAGO_METRO_LOCALES } from '../data/chicago-locales';
import { DESI_ARAB_CUISINES } from '../data/catering-cuisines';
import type { ScrapedRow } from '../lib/schemas';

const OUTPUT_ROOT = path.join(process.cwd(), 'data/scraped/il-desi-arab-catering');

export async function runCateringSource(): Promise<void> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_MAPS_API_KEY required');
  const runDate = todayRunDate();
  const outDir = path.join(OUTPUT_ROOT, runDate);
  await fs.mkdir(outDir, { recursive: true });
  const manifest = emptyManifest('il_desi_arab_catering', runDate);
  const client = new Client({});
  const limiter = createRateLimiter({ qps: 10, burst: 5, jitterMs: 50 });
  const rows: ScrapedRow[] = [];

  for (const cuisine of DESI_ARAB_CUISINES) {
    for (const locale of CHICAGO_METRO_LOCALES) {
      const query = `${cuisine} in ${locale}`;
      await limiter.acquire();
      manifest.queries_executed += 1;
      try {
        const resp = await client.textSearch({
          params: { query, key: apiKey, region: 'us' },
          timeout: 10_000,
        });
        for (const place of resp.data.results) {
          if (!place.place_id) continue;
          await limiter.acquire();
          const details = await client.placeDetails({
            params: {
              place_id: place.place_id,
              key: apiKey,
              fields: [
                'name',
                'formatted_address',
                'formatted_phone_number',
                'website',
                'geometry',
                'photos',
                'types',
                'address_components',
                'serves_breakfast',
                'serves_lunch',
                'serves_dinner',
              ],
            },
            timeout: 10_000,
          });
          const d = details.data.result;
          rows.push({
            source: 'il_desi_arab_catering',
            source_external_id: place.place_id,
            business_name: d.name ?? place.name ?? 'unknown',
            category: 'catering',
            tags: [`cuisine:${cuisine}`],
            city: d.address_components?.find((c: any) => c.types.includes('locality'))?.long_name,
            state: 'IL',
            postal_code: d.address_components?.find((c: any) => c.types.includes('postal_code'))
              ?.long_name,
            lat: d.geometry?.location?.lat,
            lng: d.geometry?.location?.lng,
            phone: d.formatted_phone_number ?? null,
            website: d.website ?? null,
            photos: (d.photos ?? [])
              .slice(0, 5)
              .map(
                (p: any) =>
                  `https://maps.googleapis.com/maps/api/place/photo?maxwidth=1200&photo_reference=${p.photo_reference}&key=${apiKey}`
              ),
            raw: { textSearch: place, details: d, catering_signal_pending: true },
          });
        }
      } catch (e) {
        manifest.errors.push({
          context: query,
          code: 'PLACES_ERROR',
          message: e instanceof Error ? e.message : String(e),
          ts: new Date().toISOString(),
        });
      }
    }
  }
  manifest.records_returned = rows.length;
  await fs.writeFile(path.join(outDir, 'rows.json'), JSON.stringify(rows, null, 2));
  await writeManifest(outDir, manifest);
  console.log(`il-desi-arab-catering: ${rows.length} restaurants found`);
}

if (require.main === module) {
  runCateringSource().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
```

- [ ] **Step 3: npm script + smoke test**

```json
"scrape:catering": "tsx scripts/scraper/sources/il-desi-arab-catering.ts",
```

```bash
GOOGLE_MAPS_API_KEY='<key>' npx tsx -e "
import { runCateringSource } from './scripts/scraper/sources/il-desi-arab-catering';
// Reduce scope for smoke: monkey-patch CHICAGO_METRO_LOCALES to a single entry first
runCateringSource();
"
```

(For full overnight, run unmodified.)

Expected: `data/scraped/il-desi-arab-catering/<date>/rows.json` with restaurant rows.

- [ ] **Step 4: Commit**

```bash
git add scripts/scraper/sources/il-desi-arab-catering.ts scripts/scraper/data/catering-cuisines.ts package.json
git commit -m "feat(scraper): IL desi/Arab restaurant catering source"
```

---

## Milestone 9 — Python sidecar (ScrapeGraphAI)

### Task 27: Python project setup with `uv`

**Files:**

- Create: `scripts/scraper/python/pyproject.toml`
- Create: `scripts/scraper/python/.python-version`

- [ ] **Step 1: Install `uv` if not present**

```bash
which uv || curl -LsSf https://astral.sh/uv/install.sh | sh
```

- [ ] **Step 2: Write `pyproject.toml`**

```toml
[project]
name = "baazar-scraper-sidecar"
version = "0.1.0"
description = "ScrapeGraphAI sidecar for sub-project K"
requires-python = ">=3.12"
dependencies = [
  "scrapegraphai>=1.0.0",
  "anthropic>=0.40.0",
  "playwright>=1.50.0",
  "pydantic>=2.0",
]

[tool.uv]
package = false
```

- [ ] **Step 3: Write `.python-version`**

```
3.12
```

- [ ] **Step 4: Initialize the venv + install deps**

```bash
cd scripts/scraper/python
uv sync
uv run playwright install chromium
cd ../../../
```

Expected: `.venv/` created, `uv.lock` written, Chromium installed.

- [ ] **Step 5: Commit**

```bash
git add scripts/scraper/python/pyproject.toml scripts/scraper/python/uv.lock scripts/scraper/python/.python-version
git commit -m "build(scraper): bootstrap Python sidecar with uv + ScrapeGraphAI"
```

---

### Task 28: `enrich_website.py`

**Files:**

- Create: `scripts/scraper/python/enrich_website.py`

- [ ] **Step 1: Implement**

```python
#!/usr/bin/env python3
"""
Enrich a vendor's website with ScrapeGraphAI + Claude Haiku.

Usage:
  uv run python enrich_website.py --url https://example.com --out path/to/out.json
"""
import argparse, json, os, sys
from pathlib import Path
from scrapegraphai.graphs import SmartScraperGraph

PROMPT = (
    "Extract from this business website: business_name, services (list), "
    "pricing_range (string), contact (phone, email), social_handles "
    "(instagram, facebook, tiktok), and up to 5 sample_photo_urls."
)

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--url", required=True)
    p.add_argument("--out", required=True)
    args = p.parse_args()

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("ANTHROPIC_API_KEY required", file=sys.stderr); sys.exit(1)

    graph_config = {
        "llm": {
            "api_key": api_key,
            "model": "anthropic/claude-haiku-4-5-20251001",
            "model_tokens": 8192,
        },
        "verbose": False,
        "headless": True,
    }

    graph = SmartScraperGraph(prompt=PROMPT, source=args.url, config=graph_config)
    result = graph.run()

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(result, indent=2))
    print(f"wrote {out_path}")

if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Smoke-test on a real URL**

```bash
cd scripts/scraper/python
ANTHROPIC_API_KEY='<key>' uv run python enrich_website.py \
  --url https://baazar.io --out /tmp/baazar-enrich.json
cat /tmp/baazar-enrich.json
cd ../../../
```

Expected: JSON with extracted fields (may be sparse for baazar.io itself, but should not error).

- [ ] **Step 3: Commit**

```bash
git add scripts/scraper/python/enrich_website.py
git commit -m "feat(scraper): enrich_website.py — ScrapeGraphAI + Haiku website extractor"
```

---

### Task 29: `catering_signal.py`

**Files:**

- Create: `scripts/scraper/python/catering_signal.py`

- [ ] **Step 1: Implement**

```python
#!/usr/bin/env python3
"""
Detect whether a restaurant website offers catering.

Usage:
  uv run python catering_signal.py --url https://restaurant.com --out path/to/out.json
"""
import argparse, json, os, sys
from pathlib import Path
from scrapegraphai.graphs import SmartScraperGraph

PROMPT = (
    "Does this restaurant offer catering for events or weddings? "
    "If yes, extract: offers_catering=true, catering_page_url, "
    "minimum_order_dollars (integer), catering_phone, catering_email, "
    "sample_menu_items (list of strings). If no, return offers_catering=false."
)

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--url", required=True)
    p.add_argument("--out", required=True)
    args = p.parse_args()

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("ANTHROPIC_API_KEY required", file=sys.stderr); sys.exit(1)

    graph_config = {
        "llm": {"api_key": api_key, "model": "anthropic/claude-haiku-4-5-20251001", "model_tokens": 4096},
        "headless": True, "verbose": False,
    }
    graph = SmartScraperGraph(prompt=PROMPT, source=args.url, config=graph_config)
    result = graph.run()
    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(result, indent=2))
    print(f"wrote {out_path}")

if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Smoke-test on a known catering restaurant**

```bash
cd scripts/scraper/python
ANTHROPIC_API_KEY='<key>' uv run python catering_signal.py \
  --url https://www.ghareeb-nawaz.com/ --out /tmp/catering.json
cat /tmp/catering.json
cd ../../../
```

Expected: `offers_catering: true` (Ghareeb Nawaz on Devon does cater) with details.

- [ ] **Step 3: Commit**

```bash
git add scripts/scraper/python/catering_signal.py
git commit -m "feat(scraper): catering_signal.py — restaurant catering detector"
```

---

### Task 30: `search_discover.py`

**Files:**

- Create: `scripts/scraper/python/search_discover.py`

- [ ] **Step 1: Implement**

```python
#!/usr/bin/env python3
"""
SearchGraph: search engine query → extract structured vendor data from top results.

Usage:
  uv run python search_discover.py --query "Pakistani caterers Lombard IL" --out path
"""
import argparse, json, os, sys
from pathlib import Path
from scrapegraphai.graphs import SearchGraph

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--query", required=True)
    p.add_argument("--out", required=True)
    p.add_argument("--max-results", type=int, default=5)
    args = p.parse_args()

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("ANTHROPIC_API_KEY required", file=sys.stderr); sys.exit(1)

    config = {
        "llm": {"api_key": api_key, "model": "anthropic/claude-haiku-4-5-20251001", "model_tokens": 4096},
        "max_results": args.max_results, "verbose": False, "headless": True,
    }
    prompt = (
        "Extract for each vendor found: business_name, website, phone, address, "
        "instagram_handle if visible, and a one-sentence description."
    )
    graph = SearchGraph(prompt=prompt, config=config, source=args.query)
    result = graph.run()
    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(result, indent=2))
    print(f"wrote {out_path}")

if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Smoke-test**

```bash
cd scripts/scraper/python
ANTHROPIC_API_KEY='<key>' uv run python search_discover.py \
  --query "Pakistani caterers in Lombard IL" --out /tmp/search.json
cat /tmp/search.json
cd ../../../
```

Expected: JSON with a few vendor entries.

- [ ] **Step 3: Commit**

```bash
git add scripts/scraper/python/search_discover.py
git commit -m "feat(scraper): search_discover.py — SearchGraph for vendor discovery"
```

---

## Milestone 10 — SearchGraph TS wrapper

### Task 31: `sources/searchgraph.ts` — TS orchestrator for the Python sidecar

**Files:**

- Create: `scripts/scraper/sources/searchgraph.ts`

- [ ] **Step 1: Implement**

```typescript
// scripts/scraper/sources/searchgraph.ts
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { emptyManifest, todayRunDate, writeManifest } from '../lib/manifest';
import { CHICAGO_METRO_LOCALES } from '../data/chicago-locales';
import type { ScrapedRow } from '../lib/schemas';

const execFileP = promisify(execFile);
const OUTPUT_ROOT = path.join(process.cwd(), 'data/scraped/searchgraph');
const PYTHON_ROOT = path.join(process.cwd(), 'scripts/scraper/python');

const QUERIES = [
  'Pakistani caterer',
  'Indian caterer',
  'Afghan caterer',
  'Bangladeshi caterer',
  'Arab caterer',
  'desi wedding cart',
  'paan cart',
  'chai cart',
];

export async function runSearchgraphSource(): Promise<void> {
  const runDate = todayRunDate();
  const outDir = path.join(OUTPUT_ROOT, runDate);
  await fs.mkdir(outDir, { recursive: true });
  const manifest = emptyManifest('searchgraph', runDate);
  const rows: ScrapedRow[] = [];

  for (const baseQuery of QUERIES) {
    for (const locale of CHICAGO_METRO_LOCALES.slice(0, 12)) {
      // throttle
      const query = `${baseQuery} ${locale}`;
      const slug = query.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
      const outFile = path.join(outDir, `${slug}.json`);
      manifest.queries_executed += 1;
      try {
        await execFileP(
          'uv',
          [
            'run',
            'python',
            'search_discover.py',
            '--query',
            query,
            '--out',
            outFile,
            '--max-results',
            '5',
          ],
          { cwd: PYTHON_ROOT, env: { ...process.env }, timeout: 180_000 }
        );
        const result = JSON.parse(await fs.readFile(outFile, 'utf8'));
        const vendors = Array.isArray(result) ? result : (result.vendors ?? []);
        for (const v of vendors as any[]) {
          rows.push({
            source: 'searchgraph',
            business_name: v.business_name ?? v.name ?? 'unknown',
            category: inferCategoryFromQuery(baseQuery),
            tags: [`query:${baseQuery}`],
            city: locale.replace(/ IL$/, ''),
            state: 'IL',
            phone: v.phone ?? null,
            website: v.website ?? null,
            instagram_handle: v.instagram_handle ?? null,
            bio: v.description ?? null,
            photos: [],
            raw: v,
          });
        }
      } catch (e) {
        manifest.errors.push({
          context: query,
          code: 'SEARCHGRAPH_ERROR',
          message: e instanceof Error ? e.message : String(e),
          ts: new Date().toISOString(),
        });
      }
    }
  }

  manifest.records_returned = rows.length;
  await fs.writeFile(path.join(outDir, 'rows.json'), JSON.stringify(rows, null, 2));
  await writeManifest(outDir, manifest);
  console.log(`searchgraph: ${rows.length} rows`);
}

function inferCategoryFromQuery(q: string): string {
  if (q.includes('cart')) return 'carts';
  if (q.includes('caterer')) return 'catering';
  return 'catering';
}

if (require.main === module) {
  runSearchgraphSource().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
```

- [ ] **Step 2: Add npm script**

```json
"scrape:searchgraph": "tsx scripts/scraper/sources/searchgraph.ts",
```

- [ ] **Step 3: Smoke-test (small scope)**

Temporarily edit `QUERIES` to one entry + `CHICAGO_METRO_LOCALES.slice(0, 12)` to `slice(0, 2)`, then:

```bash
ANTHROPIC_API_KEY='<key>' npm run scrape:searchgraph
```

Expected: `rows.json` populated. Revert the edits after smoke succeeds.

- [ ] **Step 4: Commit**

```bash
git add scripts/scraper/sources/searchgraph.ts package.json
git commit -m "feat(scraper): searchgraph source — TS wrapper around Python SearchGraph"
```

---

## Milestone 11 — GitHub Actions orchestration

### Task 32: `.github/workflows/k-scrape.yml`

**Files:**

- Create: `.github/workflows/k-scrape.yml`

- [ ] **Step 1: Author the workflow**

```yaml
name: K — Vendor scrape (manual)

on:
  workflow_dispatch:
    inputs:
      sources:
        description: 'Comma-separated sources to run (google-maps,instagram,catering,searchgraph,all)'
        required: true
        default: 'all'

jobs:
  scrape:
    runs-on: ubuntu-latest
    timeout-minutes: 350 # ~6h cap
    env:
      GOOGLE_MAPS_API_KEY: ${{ secrets.GOOGLE_MAPS_API_KEY }}
      APIFY_API_TOKEN: ${{ secrets.APIFY_API_TOKEN }}
      ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
      NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.NEXT_PUBLIC_SUPABASE_URL }}
      SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
      NEXT_PUBLIC_APP_URL: ${{ secrets.NEXT_PUBLIC_APP_URL }}

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci
      - uses: astral-sh/setup-uv@v3
        with: { enable-cache: true }
      - run: |
          cd scripts/scraper/python
          uv sync
          uv run playwright install chromium

      - name: Hand-curated source
        if: contains(inputs.sources, 'all') || contains(inputs.sources, 'hand-curated')
        run: npm run scrape:hand-curated

      - name: Google Maps source
        if: contains(inputs.sources, 'all') || contains(inputs.sources, 'google-maps')
        run: npm run scrape:google-maps

      - name: Instagram hashtag layer
        if: contains(inputs.sources, 'all') || contains(inputs.sources, 'instagram')
        run: npm run scrape:instagram:hashtags

      - name: Instagram location layer
        if: contains(inputs.sources, 'all') || contains(inputs.sources, 'instagram')
        run: npm run scrape:instagram:locations

      - name: Instagram bio-search layer
        if: contains(inputs.sources, 'all') || contains(inputs.sources, 'instagram')
        run: npm run scrape:instagram:bio

      - name: Instagram profile expansion (requires layers 1+2)
        if: contains(inputs.sources, 'all') || contains(inputs.sources, 'instagram')
        run: npm run scrape:instagram:expand

      - name: Instagram combine
        if: contains(inputs.sources, 'all') || contains(inputs.sources, 'instagram')
        run: npm run scrape:instagram:combine

      - name: IL desi/Arab catering source
        if: contains(inputs.sources, 'all') || contains(inputs.sources, 'catering')
        run: npm run scrape:catering

      - name: SearchGraph discovery
        if: contains(inputs.sources, 'all') || contains(inputs.sources, 'searchgraph')
        run: npm run scrape:searchgraph

      - name: Merge to scraped_vendors
        run: npm run scrape:merge

      - name: Upload artifacts
        uses: actions/upload-artifact@v4
        with:
          name: k-scrape-${{ github.run_number }}
          path: data/scraped/
          retention-days: 14
```

- [ ] **Step 2: Verify the workflow syntax**

```bash
gh workflow view k-scrape.yml || echo "workflow not yet pushed — that's fine"
# After push:
# gh workflow run k-scrape.yml -f sources=hand-curated
```

- [ ] **Step 3: Document the secrets users must add**

Modify `.env.example` to add (and add a note in the PR description):

```bash
# Sub-project K — scraper secrets (also required as GitHub Actions repo secrets)
GOOGLE_MAPS_API_KEY=
APIFY_API_TOKEN=
# ANTHROPIC_API_KEY is already required for the wizard bio assist
```

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/k-scrape.yml .env.example
git commit -m "ci(scraper): manual-trigger GitHub Actions workflow for K scrapes"
```

---

## Milestone 12 — PR + handoff

### Task 33: Wrap-up — verify, open PR

- [ ] **Step 1: Run the full test suite**

```bash
npm test -- --run
npm run lint
npm run build
```

Expected: build green, lint warnings only (no errors), all relevant Vitest passes.

- [ ] **Step 2: Smoke-test the e2e claim spec**

```bash
PLAYWRIGHT_SKIP_WEB_SERVER=1 npx playwright test tests/e2e/claim-flow.spec.ts
```

Expected: 4/4 pass against the dev DB.

- [ ] **Step 3: Push branch and open PR**

```bash
git push -u origin feat/sub-project-k-scraper
gh pr create --title "feat: sub-project K — vendor scraper + claim flow" --body "$(cat <<'EOF'
## Summary
Implements sub-project K per `docs/superpowers/specs/2026-05-27-sub-project-k-vendor-scraper-design.md`.

- Multi-source ingestion pipeline (Google Places + Apify Instagram + IL desi/Arab catering + hand-curated JSON + ScrapeGraphAI SearchGraph)
- Python sidecar (uv) with ScrapeGraphAI + Claude Haiku for enrichment + discovery
- `scraped_vendors` staging table + `claim_tokens` table + `pg_trgm` indexes (migrations 00045-00050)
- Signed claim-token flow at `/claim/[token]`
- Signup-time fuzzy match in wizard step 1 ("Is this you?")
- Manual-trigger GitHub Actions workflow for overnight scrapes

## Migrations to apply to prod
- 00045 (content_creation category)
- 00046 (scraped_vendors)
- 00047 (claim_tokens)
- 00048 (pg_trgm indexes)
- 00049 (match RPC)
- 00050 (mint-filter RPC)

## Required new secrets
- `GOOGLE_MAPS_API_KEY` (local + GHA + Vercel)
- `APIFY_API_TOKEN` (local + GHA)
- (`ANTHROPIC_API_KEY` already configured)

## Test plan
- [ ] Unit + integration tests pass locally
- [ ] `tests/e2e/claim-flow.spec.ts` passes
- [ ] Manual smoke: sign up as a new vendor with the seed handle → "Is this you?" prompt renders
- [ ] Manual smoke: open a minted claim URL → redirected to wizard with profile prefilled

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR opened with URL printed.

- [ ] **Step 4: Apply migrations to prod once PR is merged**

After squash-merge, follow [[migration-apply-policy]]: prepare a clear apply block, user runs 00045-00050 in Supabase SQL editor for prod, verifies sanity checks, confirms applied.

---

## Self-review checklist

After completing all tasks above:

1. **Spec coverage:**
   - ✅ All 4 schema migrations (00045-00048) + RPC migrations (00049-00050)
   - ✅ All 5 sources (Google Places, IG via Apify 4 layers, IL catering, hand-curated, SearchGraph)
   - ✅ Python sidecar (3 scripts) with uv + ScrapeGraphAI + Claude Haiku
   - ✅ Merge step + mint-tokens CLI
   - ✅ `/claim/[token]` route with happy + 4 error paths
   - ✅ Signup-time fuzzy match (wizard step 1) + supporting API + match RPC + promote
   - ✅ GitHub Actions overnight orchestration
   - ✅ Tests (unit + integration + e2e)

2. **Placeholders:** none. Every code block is complete.

3. **Type consistency:**
   - `ScrapedRow` defined in `schemas.ts`, used in normalize, dedup, sources, merge, manifest
   - `ScrapedVendorMatch` defined in `match.ts`, exported, imported by API route + component
   - `MatchInput` consistent across `match.ts` ↔ `/api/scraped-vendors/match`
   - `mintTokenString` / `hashTokenString` / `parseTokenString` names consistent across mint-tokens.ts ↔ claim-actions.ts ↔ tests
   - `promoteScrapedVendor(scrapedVendorId, userId)` signature consistent across promote.ts ↔ claim-actions.ts ↔ /api/scraped-vendors/claim route
