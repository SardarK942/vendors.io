# Sub-project K — Vendor scraper + claim flow

**Status:** Design approved 2026-05-27. Awaiting implementation plan.
**Sequencing:** K → M → L → outreach. See `2026-05-27-soft-launch-roadmap.md`.

---

## Goal

Populate `vendor_profiles` with real Chicago/Illinois desi & Arab wedding vendors so outreach has a target list and the marketplace has real inventory at soft launch. Today `vendor_profiles` is empty in prod (verified via migration 00044 sanity checks, 2026-05-27).

## Non-goals

- **Sub-project L** — per-vendor-type package templates + tailored onboarding wizard. Tracked separately.
- **Sub-project M** — exhaustive Playwright e2e coverage + CI Supabase test DB env vars. Tracked separately.
- Outreach automation (auto-DM, auto-email). Manual for the first batch.
- Admin review UI in Next.js. SQL editor + JSON manifest files are sufficient for the seed scrape.
- Public unclaimed profile pages. Skipped Day 1; re-evaluate post-launch.
- Instagram OAuth verification. Submitted to Meta in parallel; integration deferred to a follow-up PR once approved.

## Coverage

- **Geography:** Chicago metro + IL desi/Arab enclaves only. Suburbs: Skokie, Niles, Morton Grove, Lincolnwood (N), Schaumburg, Hoffman Estates, Palatine, Mount Prospect (NW), Naperville, Aurora, Lombard, Westmont, Lisle, Oak Brook, Wood Dale, Bartlett (W), Bridgeview, Orland Park, Tinley Park, Burbank, Bolingbrook (SW). Downstate: Champaign-Urbana, Bloomington-Normal, Springfield, Peoria.
- **Categories, in priority order:**
  1. `carts` — pani puri, chai, kulfi, paan, cotton candy, kebab, shawarma stands. IG-first, Instagram is primary source.
  2. `mehndi`
  3. `hair_makeup`
  4. `dj`
  5. `photobooth`
  6. `venue`
  7. `live_music` — includes dhol/dholki, singers, cultural performers (tracked as `tags[]` on the row, not as sub-categories)
  8. `photography`
  9. `videography`
  10. `content_creation` — NEW category (TikTok / Reels wedding creators); requires migration 00045 to add to `vendor_profiles_category_check`.
  11. `decor` — South Asian decor focus
  12. `catering` — Devon Ave (Chicago) + Bridgeview + all IL desi/Arab/Middle-Eastern restaurants with catering signal

## Architecture

K is a one-shot offline ingestion pipeline plus a `/claim/[token]` route in the Next.js app. No admin UI Day 1.

```
scripts/scraper/
├── sources/
│   ├── google-maps.ts            # Places API per category × locale
│   ├── instagram.ts              # Apify IG Hashtag/Location/Profile actors
│   ├── il-desi-arab-catering.ts  # Places API by locale × cuisine, filter for catering
│   ├── hand-curated.ts           # Reads data/scraped/hand-curated/*.json
│   └── searchgraph.ts            # ScrapeGraphAI SearchGraph for long-tail discovery
├── python/
│   ├── pyproject.toml            # uv-managed; ScrapeGraphAI + anthropic + playwright
│   ├── enrich_website.py         # SmartScraperGraph on a vendor website URL
│   ├── catering_signal.py        # Restaurant website → "offers catering?" + details
│   └── search_discover.py        # SearchGraph for vendor discovery
├── lib/
│   ├── rate-limit.ts             # Token bucket + jitter for Places API
│   ├── dedup.ts                  # IG-handle + (name, city) trigram + phone match
│   ├── normalize.ts              # Category mapping, phone E.164, IG canonicalization
│   └── claim-token.ts            # HMAC mint/verify + DB single-use check
├── merge.ts                      # Reads ALL JSON dumps → scraped_vendors
└── mint-tokens.ts                # Generate signed tokens for an outreach batch → CSV

data/scraped/
├── google-maps/<run-date>/<category-or-locale>.json
├── instagram/<run-date>/<actor-run-id>.json
├── il-desi-arab-catering/<run-date>/<locale>.json
├── enriched/<run-date>/<scraped_vendor_id>.json    # ScrapeGraphAI output
├── searchgraph/<run-date>/<query-slug>.json
└── hand-curated/*.json                              # Hand-authored, git-committed

src/app/claim/[token]/page.tsx    # Verifies token → links scraped row → wizard
src/lib/scraped-vendor/match.ts   # Signup-time fuzzy match (used by wizard)
```

### Why this shape

- **Each source is independently runnable + testable.** Re-scraping a single source doesn't touch the DB.
- **Filesystem is the integration boundary.** Python sidecar writes JSON; TS reads JSON. No subprocess bridges, no IPC.
- **The merge step is the only writer to `scraped_vendors`.** Dedup logic lives in one place.
- **Hand-curated entries are git-committed JSON files** — reviewable in PRs, no special tooling needed.
- **Devon Ave / Bridgeview / IL catering is its own source module** because the query pattern (locale × cuisine, post-filter for catering) differs from generic category-based Places search.

## Data flow

1. **Discovery** — each source scraper queries its target (Places API, Apify actor, hashtag, hand-list, SearchGraph) and writes timestamped JSON dumps to `data/scraped/<source>/<date>/`.
2. **Enrichment** — for every record that contains a website URL, the Python sidecar (`enrich_website.py` or `catering_signal.py`) runs ScrapeGraphAI with Claude Haiku as LLM backend; writes enriched JSON to `data/scraped/enriched/<date>/`.
3. **Merge** — `merge.ts` reads all dumps for the run date, normalizes phone/IG/category, runs dedup (IG handle exact → trigram on `business_name + city` → phone exact), upserts into `scraped_vendors`. Conflicts → `review_status='duplicate'`, surfaced by SQL queries.
4. **Token mint** — `mint-tokens.ts` generates a signed claim token per row in an outreach batch (`campaign_label` parameter), writes the SHA-256 hashed token to `claim_tokens`, emits a CSV of `(business_name, IG handle, token URL)` for the outreach DM tool.
5. **Claim** — vendor clicks DM link → `/claim/[token]` → verify signature + DB → trigger signup-then-link → wizard prefills from scraped row → on wizard completion, promote `scraped_vendors` row into `vendor_profiles` (set `claimed_at`, link `claimed_vendor_profile_id`).
6. **Organic signup-time match** (no token) — wizard step 1 captures IG handle + business name + city. `src/lib/scraped-vendor/match.ts` runs the same dedup; if hits, render "Is this you?" prompt with candidate cards. Vendor picks one → link the row; vendor picks "None of these" → flag candidates with `disputed_at`, create fresh `vendor_profiles`.

## Schema & migrations

Four new migrations. All additive.

### 00045 — Add `content_creation` to vendor categories

```sql
ALTER TABLE vendor_profiles DROP CONSTRAINT IF EXISTS vendor_profiles_category_check;
ALTER TABLE vendor_profiles ADD CONSTRAINT vendor_profiles_category_check
  CHECK (category = ANY (ARRAY[
    'photography'::text, 'videography'::text, 'mehndi'::text,
    'hair_makeup'::text, 'dj'::text, 'photobooth'::text,
    'catering'::text, 'venue'::text, 'decor'::text,
    'invitations'::text, 'bridal_wear'::text, 'live_music'::text,
    'carts'::text, 'content_creation'::text
  ]));
```

### 00046 — `scraped_vendors` staging table

```sql
CREATE TABLE scraped_vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL CHECK (source IN (
    'google_maps', 'instagram', 'il_desi_arab_catering',
    'hand_curated', 'searchgraph'
  )),
  source_external_id text,                -- e.g. google_place_id, IG handle
  business_name text NOT NULL,
  category text,                          -- nullable; normalize later if ambiguous
  tags text[] DEFAULT '{}',               -- e.g. ['dhol', 'singer'] for live_music subtypes
  city text,
  state text DEFAULT 'IL',
  postal_code text,
  lat numeric,
  lng numeric,
  phone text,                             -- E.164
  email text,
  website text,
  instagram_handle text,                  -- canonical (no @, no URL)
  facebook_url text,
  bio text,
  photos text[] DEFAULT '{}',             -- source-side URLs; re-hosted on claim
  raw jsonb NOT NULL,                     -- full source payload for forensics
  enriched jsonb,                         -- ScrapeGraphAI output if available
  scraped_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  claimed_vendor_profile_id uuid REFERENCES vendor_profiles(id) ON DELETE SET NULL,
  disputed_at timestamptz,
  review_status text NOT NULL DEFAULT 'pending'
    CHECK (review_status IN ('pending', 'approved', 'rejected', 'duplicate'))
);

CREATE UNIQUE INDEX scraped_vendors_source_external_idx
  ON scraped_vendors (source, source_external_id) WHERE source_external_id IS NOT NULL;
CREATE INDEX scraped_vendors_instagram_idx
  ON scraped_vendors (lower(instagram_handle)) WHERE instagram_handle IS NOT NULL;
CREATE INDEX scraped_vendors_phone_idx
  ON scraped_vendors (phone) WHERE phone IS NOT NULL;
CREATE INDEX scraped_vendors_category_city_idx ON scraped_vendors (category, city);
CREATE INDEX scraped_vendors_unclaimed_idx ON scraped_vendors (claimed_at) WHERE claimed_at IS NULL;

-- RLS: service-role only. No public read.
ALTER TABLE scraped_vendors ENABLE ROW LEVEL SECURITY;
```

### 00047 — `claim_tokens` table

```sql
CREATE TABLE claim_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scraped_vendor_id uuid NOT NULL REFERENCES scraped_vendors(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,        -- SHA-256 of the public token
  issued_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,        -- typically issued_at + 90 days
  claimed_at timestamptz,
  claimed_by_user_id uuid REFERENCES users(id),
  revoked_at timestamptz,
  campaign_label text                     -- e.g. 'chicago-cart-batch-1'
);

CREATE INDEX claim_tokens_scraped_vendor_idx ON claim_tokens (scraped_vendor_id);
CREATE INDEX claim_tokens_unclaimed_idx ON claim_tokens (claimed_at) WHERE claimed_at IS NULL;

ALTER TABLE claim_tokens ENABLE ROW LEVEL SECURITY;
```

**Token mechanics:**

- Public token format: `base64url(scraped_vendor_id):base64url(random_64_bytes)`. We store only the SHA-256 hash.
- Verify by hashing the incoming token and looking it up.
- Single-use: `claimed_at IS NOT NULL` → reject (idempotent: if same user re-clicks, redirect to their profile).
- Revocable: `revoked_at IS NOT NULL` → reject.
- TTL: 90 days from issuance. Expired → reject (re-mint a new row if needed).

### 00048 — `pg_trgm` for fuzzy dedup

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX scraped_vendors_business_name_trgm_idx
  ON scraped_vendors USING gin (business_name gin_trgm_ops);
CREATE INDEX vendor_profiles_business_name_trgm_idx
  ON vendor_profiles USING gin (business_name gin_trgm_ops);
```

Used by signup-time fuzzy match: `WHERE business_name % $1 AND city = $2 ORDER BY similarity(business_name, $1) DESC LIMIT 5`.

## Per-source playbooks

### Google Places API (primary structured source)

- Library: `@googlemaps/google-maps-services-js`
- Cost: ~$50-150 for the full Chicago + IL desi/Arab restaurant queries (Places Text Search + Place Details)
- Rate limit: 100 QPS theoretical; throttle to 10 QPS with jitter for safety
- Query plan: per-category × per-locale Text Search → for each result, Place Details for full payload
- Output schema: name, address, phone, website, hours, ratings, photos[], place_id, lat/lng, types[]
- Anti-bot risk: zero (official API)

### Instagram via Apify

- Library: `apify-client` npm package
- Actors used:
  - **Instagram Hashtag Scraper** — Layer 1 discovery (hashtags listed in spec section "How carts get found via Instagram")
  - **Instagram Location Scraper** — Layer 2 (top ~30 Chicago metro desi wedding venues)
  - **Instagram Profile Scraper** — Layer 3 (cross-network expansion: followers/following of confirmed cart vendors)
  - **Instagram Search Scraper** — Layer 4 (bio keyword search)
- Cost: ~$5-25 per actor run. Total IG layer: ~$30-80 for Chicago seed
- Anti-bot risk: Apify handles it (residential proxies, account rotation). No local IG login.
- Output: handle, full name, bio, post URLs, post images, location tags, follower/following counts

### IL desi/Arab catering

- Same Places API library as Google Maps source
- Query plan: per-locale × per-cuisine ("Indian restaurant", "Pakistani restaurant", "Bangladeshi restaurant", "Afghan restaurant", "Arab restaurant", "Lebanese restaurant", "Palestinian restaurant", "Syrian restaurant", "Yemeni restaurant", "Persian restaurant", "Middle Eastern restaurant")
- Post-filter for catering signal: check `serves_catering` boolean in Places metadata if present; else queue website for ScrapeGraphAI `catering_signal.py` enrichment.

### ScrapeGraphAI (Python sidecar)

- Python 3.12 via `uv` for dep management. Virtual env at `scripts/scraper/python/.venv`.
- Deps: `scrapegraphai`, `anthropic`, `playwright` (already installed at the OS level for our e2e)
- LLM backend: Claude Haiku (`claude-haiku-4-5-20251001`) via Anthropic API — matches the existing model ID in `src/app/api/ai/bio-assist/route.ts`. Uses existing `ANTHROPIC_API_KEY` env var.
- Three scripts:
  - `enrich_website.py` — SmartScraperGraph on a vendor website. Prompt: _"Extract business_name, services[], pricing_range, contact{phone,email}, social{instagram,facebook,tiktok}, sample_photo_urls[]"_
  - `catering_signal.py` — On a restaurant website: _"Does this restaurant offer catering? If yes, extract catering page URL, minimum order, catering phone/email, sample menu items."_
  - `search_discover.py` — SearchGraph on queries like _"Pakistani caterers in Lombard IL"_. Returns top-N URLs + extracted data.
- Output: JSON to `data/scraped/enriched/<run-date>/<scraped_vendor_id>.json` keyed by the scraped_vendors UUID that originated the URL.
- Cost: ~$5-15 LLM total for the Chicago seed at Haiku rates.

### Hand-curated JSON

- Schema: same as `scraped_vendors` row, source = `'hand_curated'`.
- Authored by hand in `data/scraped/hand-curated/*.json` (one file per batch).
- Reviewed in PRs (the file is committed to git).
- Merge step reads all files in the directory each run.

## Claim & identity model

### Token path (outreach)

1. User runs `mint-tokens.ts --campaign chicago-cart-batch-1 --filter "category=carts AND city='Chicago'"`.
2. Script generates one row in `claim_tokens` per matching `scraped_vendors` row, emits CSV.
3. User pastes CSV into their DM tool (IG DM, email) — each row gets `https://baazar.io/claim/{token}` in the message.
4. Vendor clicks → `/claim/[token]` route:
   - Verify SHA-256 hash exists in `claim_tokens`, not claimed, not revoked, not expired.
   - If user not signed in → redirect to `/signup?return_to=/claim/{token}`.
   - On signup completion, re-enter `/claim/[token]` flow.
   - Atomically: set `claim_tokens.claimed_at`, `claim_tokens.claimed_by_user_id`, `scraped_vendors.claimed_at`, create `vendor_profiles` row pre-filled from scraped data, set `scraped_vendors.claimed_vendor_profile_id`.
   - Redirect to wizard step 2 (or first incomplete step).

### Organic signup-time match (no token)

1. Wizard step 1 (basics) captures IG handle + business name + city as today.
2. On submit, `match.ts` runs three queries against `scraped_vendors WHERE claimed_at IS NULL`:
   - IG handle exact match (highest confidence)
   - Trigram on `business_name` + city exact (medium)
   - Phone exact (medium)
3. If any hit, wizard renders "We think we already know your business" prompt with up to 5 candidate cards (scraped name, IG, city, sample photos).
4. Vendor picks one → server promotes the row to their `vendor_profiles` (overwriting any wizard-input fields with scraped data if richer), flags for soft manual review on first batch.
5. Vendor picks "None of these" → server flags all candidates with `disputed_at`, creates fresh `vendor_profiles` row.

### Imposter prevention

- **Token path:** zero risk after Day 1 — the token IS the proof.
- **Organic path Day 1:** soft manual review of the first 50 organic claims via SQL queries (`SELECT * FROM scraped_vendors WHERE claimed_at > now() - interval '30 days' AND review_status = 'pending'`). User spot-checks; flips `review_status` to `approved`/`rejected`.
- **Organic path post-launch:** swap to Instagram OAuth verification once Meta approves the app. The wizard step 1 will require "Connect Instagram" before showing the candidate-match prompt. Verified IG handle = scraped IG handle = instant link, zero manual review.

## Anti-bot, rate limits, overnight execution

- **Google Places API:** No anti-bot. Throttle to 10 QPS with jitter.
- **Apify IG:** Apify owns the anti-bot problem. Run their actors in their cloud. Local script just polls for results.
- **ScrapeGraphAI website fetches:** Playwright under the hood. Single-page fetches are low-rate (one site at a time, with delay). Anti-bot risk only on sites with aggressive WAFs; acceptable for the long tail of vendor sites.
- **Overnight orchestration:** GitHub Actions workflow `.github/workflows/k-scrape.yml` triggered manually (`gh workflow run k-scrape.yml`). Runs the full pipeline; uploads JSON dumps as workflow artifacts. Caps at 6h per job; shard by category if needed.

## Testing strategy

| Surface                                                                        | Test type                             | Tool                                   |
| ------------------------------------------------------------------------------ | ------------------------------------- | -------------------------------------- |
| `lib/normalize.ts` (phone E.164, IG canonicalization, address normalization)   | Unit                                  | Vitest                                 |
| `lib/dedup.ts` (IG exact + name-trigram + phone match)                         | Unit, fixture-driven                  | Vitest                                 |
| `lib/claim-token.ts` (HMAC mint + verify + single-use + expiry + revocation)   | Unit                                  | Vitest                                 |
| Signup-time match `match.ts`                                                   | Integration against pg_trgm in dev DB | Vitest                                 |
| `/claim/[token]` route (happy + expired + revoked + already-claimed + invalid) | E2E                                   | Playwright (4-5 specs)                 |
| Source scrapers themselves (Places, Apify, ScrapeGraphAI)                      | NOT tested directly                   | Mock at SDK boundary with fixture JSON |

Scrapers themselves are intentionally not unit-tested — they call external services with non-deterministic output. We test the _processing_ of their output.

## Observability

- Each scrape run writes `data/scraped/<source>/<date>/manifest.json`:
  ```json
  {
    "source": "google_maps",
    "run_date": "2026-05-28",
    "queries_executed": 142,
    "records_returned": 487,
    "errors": [{ "query": "...", "code": "RATE_LIMITED", "ts": "..." }],
    "duration_seconds": 1247,
    "cost_estimate_usd": 38.4
  }
  ```
- Merge step logs reconciliation summary: new rows, dups collapsed, conflicts deferred.
- Apify dashboard for IG runs.
- Token-mint outputs CSV to stdout + file: `mint-tokens-<campaign>.csv` with `(scraped_vendor_id, business_name, IG, claim_url, campaign_label)`.

## Open questions / future work

- **Outreach automation** — out of scope for K. First batch is manual DM/email from the CSV. If the funnel proves out, a sub-project N could add Resend templates + IG DM API integration.
- **Admin review UI** — deferred. SQL editor handles the seed scrape volume.
- **Re-scrape cadence** — Day 1 is one-shot. If we want freshness (new vendors appearing on IG), a monthly GitHub Action re-run is the obvious next step.
- **Public unclaimed pages** — explicitly skipped Day 1 per imposter-prevention model. Revisit after IG OAuth is live.
- **Geographic expansion** — Chicago/IL only Day 1. NJ/NYC, Bay Area, Toronto, Houston are obvious next markets once Chicago funnel is validated.

## Migrations apply policy

Per [[migration-apply-policy]]:

- Claude applies 00045-00048 to dev via `psql` directly during implementation.
- User applies 00045-00048 to prod manually via Supabase SQL editor before K's outreach phase begins.

## Pending dependencies before implementation can start

- **Meta IG OAuth submission** — submit the Facebook App for review in parallel with K implementation. Not a blocker for shipping K Day 1 (token + manual review path works without it).
- **ANTHROPIC_API_KEY** — already in env for the wizard's AI bio assist. ScrapeGraphAI Python sidecar reuses it.
- **APIFY_API_TOKEN** — new env var. Sign up for Apify, get token, add to `.env.local` + Vercel + GitHub Actions secrets.
- **GOOGLE_MAPS_API_KEY** — new env var. Enable Places API in GCP, get key, add to secrets.
