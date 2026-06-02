# Sub-project K-2 — Public unclaimed listings + "I own this business" flow

**Status:** Design 2026-06-01. Bundles into PR #31 (sub-project K).
**Branch:** `feat/sub-project-k-scraper` (same as K — ships as one PR).

---

## Goal

Make scraped vendors visible on the public marketplace so `/vendors` looks populated from Day 1 of soft launch. Give vendors a single in-product action — **"I own this business"** — to either remove their listing or learn how to claim it (claim is team-mediated via Instagram DM token; there's no self-serve claim button).

Unclaimed listings stay browsable but are NOT bookable. Couples can see the vendor's identity (name, photos, IG handle, category, city, bio) but cannot transact through Baazar until the vendor claims and finishes the wizard.

## Context — why this exists

K originally built the claim infrastructure (scraped_vendors table, token mint, /claim route, signup-time fuzzy dedup) but kept scraped vendors private. During post-K design review, the user flipped this decision:

- A directory-style marketplace that's empty at launch hurts conversion when scraped vendors land on the site and see no inventory around them
- Public unclaimed listings put the marketplace in a "real" state immediately and create a forcing function for vendors to claim (they see their own listing live)
- "Backdoor risk" (couples DM the vendor directly instead of booking through Baazar) becomes an opportunity: instrument engagement so high-traffic unclaimed vendors get prioritized outreach with data-backed pitches ("23 couples viewed your profile last month — claim by [date] or be removed")

## Non-goals

- Couple-facing booking on unclaimed listings (deferred until vendor claims + completes wizard)
- Self-serve claim button on unclaimed pages (the Instagram DM channel is the verification gate)
- Newsletter / email capture from unclaimed pages (deferred; the IG-click signal is sufficient Day 1)
- Engagement-based auto-decay (the manual outreach + deadline mechanism handles this; auto-decay deferred to follow-up)
- Removing the `findMatches` API or the `promoteScrapedVendor` library (still used by the token-based `/claim/[token]` route)

## Coverage

- All scraped vendor categories (carts, mehndi, hair_makeup, dj, photobooth, venue, live_music, photography, videography, content_creation, decor, catering)
- Chicago/IL only (matches the K scope)
- All listings, regardless of source (Google Maps, Instagram, hand-curated, SearchGraph)

## Architecture

K-2 adds three concerns to the marketplace:

```
marketplace                                    new public surface
─────────────                                  ──────────────────
/vendors          ◀── renders claimed +  ───▶  read RPC `public_scraped_vendors`
                      unclaimed grid           (safe-fields-only view)
/vendors/[slug]   ◀── routes to either   ───▶  resolves: claimed vendor_profile
                      claimed or                          OR unclaimed scraped_vendors
                      unclaimed renderer
                                               (engagement: views + IG clicks logged)

"I own this business" modal       ──▶  /api/scraped-vendors/[id]/request
   ┌─────────────┐                       (action: 'remove' | 'claim_request')
   │  Remove     │                       → write engagement row
   │  Claim help │                       → notify team via Resend
   └─────────────┘                       → for 'remove', set disputed_at
```

Engagement is intentionally lightweight and cookieless (matches existing pattern at `src/lib/analytics/ip-hash.ts`).

## Components touched

### New files

```
supabase/migrations/
├── 00051_scraped_vendors_slug.sql
├── 00052_public_scraped_vendors_rpc.sql
└── 00053_scraped_vendor_engagement.sql

src/lib/scraped-vendor/
├── public.ts        — public read by slug or list (no PII)
├── engagement.ts    — log view, log IG click
└── slug.ts          — generateScrapedVendorSlug (used by merge.ts + migration backfill)

src/components/marketplace/
├── UnclaimedVendorCard.tsx       — grid card
├── UnclaimedVendorProfile.tsx    — /vendors/[slug] body when row is unclaimed
└── OwnThisBusinessModal.tsx      — overlay modal with Remove / Claim-help paths

src/app/api/scraped-vendors/[id]/request/
└── route.ts         — POST: action in {'remove', 'claim_request'}

src/app/api/scraped-vendors/[id]/track/
└── route.ts         — POST: event in {'view', 'ig_click'} (called from public pages)

src/lib/email/templates/
├── claim-request-team.ts        — operator notification
└── removal-confirmation-vendor.ts — auto-reply to vendor

scripts/scraper/lib/slug.ts        — generateScrapedVendorSlug (TS for the scraper pipeline)
```

### Modified files

```
src/app/(marketplace)/vendors/page.tsx    — fetch + render claimed + unclaimed in unified grid
src/app/(marketplace)/vendors/[slug]/page.tsx
                                          — look up by slug, render claimed or unclaimed renderer
scripts/scraper/merge.ts                  — generate slug when inserting new scraped row
src/components/onboarding/StepBasics.tsx  — convert "Is this you?" prompt to hard-block + CTA
src/components/onboarding/ScrapedVendorMatchPrompt.tsx
                                          — rewrite as block-state UI ("Find this listing on /vendors")
.env.example                              — note RESEND_AUDIENCE_OPS_ID is needed
```

### Removed files

```
src/app/api/scraped-vendors/claim/route.ts  — the organic auto-claim API
                                              (claim is now token-only via /claim/[token])
```

The token-based `/claim/[token]` flow, `promoteScrapedVendor`, the mint-tokens CLI, and the e2e specs for claim flow ALL remain unchanged.

## Schema & migrations

### 00051 — `scraped_vendors.slug` (NOT NULL, UNIQUE)

```sql
ALTER TABLE scraped_vendors
  ADD COLUMN slug text;

-- Backfill: generate slugs for existing rows using a function similar to generateSlug.
-- {business-name slugified}-{first 6 hex chars of id} guarantees uniqueness without
-- collision since uuids are unique.
UPDATE scraped_vendors
SET slug = lower(regexp_replace(business_name, '[^a-zA-Z0-9]+', '-', 'g'))
        || '-' || substring(replace(id::text, '-', '') from 1 for 6)
WHERE slug IS NULL;

-- Normalize: strip leading/trailing dashes the regexp_replace produced
UPDATE scraped_vendors
SET slug = regexp_replace(slug, '(^-+|-+$)', '', 'g')
WHERE slug LIKE '-%' OR slug LIKE '%-';

ALTER TABLE scraped_vendors
  ALTER COLUMN slug SET NOT NULL;

CREATE UNIQUE INDEX scraped_vendors_slug_key ON scraped_vendors (slug);
```

`scripts/scraper/lib/slug.ts` mirrors this in TypeScript for the merge step. New inserts use it.

### 00052 — `public_scraped_vendors` RPC

Safe-field-only view of unclaimed scraped vendors for the public marketplace. Excludes phone, email, raw, enriched, source_external_id.

```sql
CREATE OR REPLACE FUNCTION public_scraped_vendors_by_slug(p_slug text)
RETURNS TABLE (
  id uuid,
  slug text,
  business_name text,
  category text,
  city text,
  state text,
  tags text[],
  instagram_handle text,
  website text,
  bio text,
  photos text[]
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT sv.id, sv.slug, sv.business_name, sv.category, sv.city, sv.state,
         sv.tags, sv.instagram_handle, sv.website, sv.bio, sv.photos
  FROM scraped_vendors sv
  WHERE sv.slug = p_slug
    AND sv.claimed_at IS NULL
    AND sv.disputed_at IS NULL
    AND sv.review_status NOT IN ('rejected', 'duplicate');
$$;

REVOKE EXECUTE ON FUNCTION public_scraped_vendors_by_slug FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public_scraped_vendors_by_slug TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public_scraped_vendors_list(
  p_category text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_limit integer DEFAULT 60
) RETURNS TABLE (
  id uuid,
  slug text,
  business_name text,
  category text,
  city text,
  state text,
  instagram_handle text,
  bio text,
  photos text[]
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT sv.id, sv.slug, sv.business_name, sv.category, sv.city, sv.state,
         sv.instagram_handle, sv.bio, sv.photos
  FROM scraped_vendors sv
  WHERE sv.claimed_at IS NULL
    AND sv.disputed_at IS NULL
    AND sv.review_status NOT IN ('rejected', 'duplicate')
    AND (p_category IS NULL OR sv.category = p_category)
    AND (p_city IS NULL OR lower(sv.city) = lower(p_city))
  ORDER BY sv.scraped_at DESC
  LIMIT p_limit;
$$;

REVOKE EXECUTE ON FUNCTION public_scraped_vendors_list FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public_scraped_vendors_list TO anon, authenticated, service_role;
```

### 00053 — `scraped_vendor_engagement` table + request table

```sql
-- Cookieless engagement: views + IG-handle clicks, IP-hash dedup, no PII.
CREATE TABLE scraped_vendor_engagement (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scraped_vendor_id uuid NOT NULL REFERENCES scraped_vendors(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('view', 'ig_click')),
  ip_hash text NOT NULL,             -- SHA-256 hex of IP+UA, matches src/lib/analytics/ip-hash.ts pattern
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX scraped_vendor_engagement_vendor_idx
  ON scraped_vendor_engagement (scraped_vendor_id, event_type, created_at DESC);

ALTER TABLE scraped_vendor_engagement ENABLE ROW LEVEL SECURITY;
-- Service-role only: writes via API route, reads via admin SQL.

-- Vendor-initiated claim/remove requests.
CREATE TABLE scraped_vendor_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scraped_vendor_id uuid NOT NULL REFERENCES scraped_vendors(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('remove', 'claim_request')),
  requester_name text,
  requester_email text NOT NULL,
  requester_ig text,
  reason text,                       -- optional dropdown value
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'actioned', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  actioned_at timestamptz,
  actioned_by_user_id uuid REFERENCES users(id)
);

CREATE INDEX scraped_vendor_requests_open_idx
  ON scraped_vendor_requests (status, created_at) WHERE status = 'open';

ALTER TABLE scraped_vendor_requests ENABLE ROW LEVEL SECURITY;
```

## Marketplace integration

### `/vendors` page

Today, `/vendors/page.tsx` lists claimed vendor_profiles. K-2:

1. Fetch claimed vendor_profiles (existing query)
2. Fetch unclaimed scraped_vendors via `public_scraped_vendors_list` RPC, applying the same category/city filters
3. Render a unified grid; unclaimed cards use `<UnclaimedVendorCard>` (visually distinct: subtle "Unclaimed" badge, no booking CTA on hover)
4. Sort order: claimed vendors first, then unclaimed by `scraped_at` desc

Claimed vendors continue to display the booking CTA and full hover treatment. Unclaimed cards show photos + name + category + city + the Unclaimed badge.

### `/vendors/[slug]` page

Today, this looks up vendor_profiles by slug. K-2:

1. First try `vendor_profiles.slug` (existing path)
2. If not found, try `public_scraped_vendors_by_slug` RPC
3. If found in scraped_vendors, render `<UnclaimedVendorProfile>` — like the claimed profile but without booking, packages, calendar, reviews; replaced with the "I own this business" CTA at bottom
4. If not found in either, 404

On every render of the unclaimed path, the server fires a fire-and-forget POST to `/api/scraped-vendors/[id]/track` with `event: 'view'`. The IP-hash is computed server-side (same pattern as ip-hash.ts).

### `<UnclaimedVendorCard>`

```
+-----------------------+
|   [main photo]        |
|                       |
|   Best Chai Cart      |
|   Carts · Chicago     |
|   [Unclaimed badge]   |
+-----------------------+
```

No booking CTA. Click navigates to `/vendors/[slug]`. Same dimensions as the claimed card so the grid is uniform.

### `<UnclaimedVendorProfile>`

```
+--------------------------------------------+
| [Unclaimed listing banner]                 |
| "This vendor hasn't joined Baazar yet.    "|
| "Their booking will be available after    "|
| "they claim this listing."                 |
+--------------------------------------------+

| photos | name + category + city + bio    |
|        | [Show on Instagram] (click-gate)|

+--------------------------------------------+
| Are you the owner?                         |
| [I own this business]  ← opens modal       |
+--------------------------------------------+
```

The "Show on Instagram" button is click-gated: clicking it fires the IG-click engagement event AND links out to instagram.com/{handle} in a new tab. Until the click, the handle is not visible (just the button label).

### `<OwnThisBusinessModal>`

Uses the canonical `Dialog` wrapper at `src/components/ui/dialog.tsx` (Radix-backed). The closest in-marketplace reference is `src/components/marketplace/PackageDetailModal.tsx` — same wrapper, same composition. Two views inside one modal:

**Initial view (radio choice)**:

```
+--------------------------------------------+
| I own this business                        |
+--------------------------------------------+
| What would you like to do?                 |
|                                            |
| ( ) Remove my listing                      |
| ( ) Get help claiming this business        |
|                                            |
| [Cancel]    [Continue]                     |
+--------------------------------------------+
```

**Remove view**:

```
+--------------------------------------------+
| Remove this listing                        |
+--------------------------------------------+
| Email             [____________]           |
| Your name         [____________]           |
| Reason (optional) [select ▾   ]            |
| Anything else?    [____________]           |
|                                            |
| [Back]    [Send removal request]           |
+--------------------------------------------+
```

On submit → POST `/api/scraped-vendors/[id]/request` with `{action: 'remove', requester_email, requester_name, reason}`. Server inserts into `scraped_vendor_requests`, sets `scraped_vendors.disputed_at = now()`, sends a Resend email to the ops mailbox + auto-reply to the vendor's email. Modal closes with a success toast.

**Claim-help view**:

```
+--------------------------------------------+
| Claim your business                        |
+--------------------------------------------+
| We verify claims via Instagram DM to       |
| protect against impersonation.             |
|                                            |
| Here's how:                                |
| 1. Confirm your Instagram handle below.    |
| 2. Make sure your IG bio mentions          |
|    your business name.                     |
| 3. We'll DM @yourhandle within 7 days      |
|    with a unique claim link.               |
| 4. Click the link to take ownership.       |
|                                            |
| Instagram handle  [@__________]            |
| Email             [____________]           |
| Your name         [____________]           |
|                                            |
| [Back]    [Request claim link]             |
+--------------------------------------------+
```

On submit → POST `/api/scraped-vendors/[id]/request` with `{action: 'claim_request', requester_email, requester_ig, requester_name}`. Server inserts into `scraped_vendor_requests`, sends a Resend email to ops + confirmation to the requester. Ops then mints a token via the existing CLI and DMs the vendor.

## API routes

### POST `/api/scraped-vendors/[id]/track`

Body: `{ event: 'view' | 'ig_click' }`.

- Authentication: not required (public).
- Rate-limit/dedup: server hashes `req.ip + req.headers['user-agent']` via the existing `src/lib/analytics/ip-hash.ts` pattern; insert into `scraped_vendor_engagement` with `ON CONFLICT DO NOTHING` semantics (single row per (vendor, event, ip_hash, day)).
- Response: `{ ok: true }`. No body shape needed.

### POST `/api/scraped-vendors/[id]/request`

Body: `{ action: 'remove' | 'claim_request', requester_email, requester_name?, requester_ig?, reason? }`.

- Authentication: not required (public).
- Validation: Zod schema.
- Side effects:
  - Insert into `scraped_vendor_requests`
  - For 'remove': also `UPDATE scraped_vendors SET disputed_at = now()`
  - Send Resend email to ops mailbox
  - Send Resend confirmation/auto-reply to the requester
- Response: `{ ok: true, requestId }`.

## Wizard step 1 changes

The existing `ScrapedVendorMatchPrompt` component (auto-link "Is this you?" UI) is repurposed as a **hard-block** view:

```
+--------------------------------------------+
| We already have a listing for your         |
| business on Baazar.                        |
+--------------------------------------------+
| [card with matched vendor preview]         |
|                                            |
| To verify it's yours and take ownership:   |
| 1. Visit your listing                      |
| 2. Click "I own this business"             |
| 3. Choose "Get help claiming"              |
|                                            |
| [Visit my listing] (links to /vendors/...) |
+--------------------------------------------+
```

The wizard's submit button is disabled while this prompt is showing. The vendor is funneled exclusively through the public-listing → "I own this business" flow.

There's no "None of these — start fresh" escape hatch anymore. The match infrastructure (findMatches lib + match API) stays in place; only the UI/UX flips from auto-link to block.

## Engagement model

Read pattern for ops:

```sql
-- "Which unclaimed vendors are getting traction in the last 30 days?"
SELECT
  sv.business_name,
  sv.category,
  sv.city,
  sv.instagram_handle,
  sv.slug,
  count(*) FILTER (WHERE e.event_type = 'view') AS views_30d,
  count(*) FILTER (WHERE e.event_type = 'ig_click') AS ig_clicks_30d,
  count(*) FILTER (WHERE e.event_type = 'view') +
  5 * count(*) FILTER (WHERE e.event_type = 'ig_click') AS engagement_score
FROM scraped_vendors sv
LEFT JOIN scraped_vendor_engagement e
  ON e.scraped_vendor_id = sv.id
  AND e.created_at > now() - interval '30 days'
WHERE sv.claimed_at IS NULL
  AND sv.disputed_at IS NULL
GROUP BY sv.id
HAVING count(*) FILTER (WHERE e.event_type = 'view') > 0
ORDER BY engagement_score DESC
LIMIT 25;
```

This drives the manual outreach mechanic the user designed: top 25 unclaimed vendors with engagement get a DM from ops with the proof + a claim link minted via the existing `mint-tokens.ts` CLI, with a "claim by [date] or be removed" deadline.

## Email templates

### Ops notification (`claim-request-team.ts`)

Subject: `[Claim request] {business_name}`
Body: vendor details + the action + a one-click admin link (future: an `/admin` page; for now just a SQL hint to inspect `scraped_vendor_requests WHERE id = <id>`)

### Ops notification (`removal-request-team.ts`)

Subject: `[Removal request] {business_name}`
Body: same shape as claim, plus the reason.

### Vendor auto-reply (`claim-request-vendor.ts`)

Subject: `We received your Baazar claim request`
Body: "Thanks. We'll DM you on Instagram with a claim link within 7 days. If you don't see it, check your Instagram message requests folder."

### Vendor auto-reply (`removal-confirmation-vendor.ts`)

Subject: `Your Baazar listing will be removed`
Body: "Thanks. We've taken your listing offline. It will not be re-scraped or relisted. Reply to this email if anything else is needed."

## Testing

| Surface                                                                       | Test type                                  |
| ----------------------------------------------------------------------------- | ------------------------------------------ |
| `scripts/scraper/lib/slug.ts` (slug generator)                                | Vitest unit                                |
| `src/lib/scraped-vendor/public.ts` (read by slug + list)                      | Vitest integration against dev DB          |
| `src/lib/scraped-vendor/engagement.ts` (write + dedup)                        | Vitest integration                         |
| `/api/scraped-vendors/[id]/track`                                             | Vitest unit with mocked supabase + IP hash |
| `/api/scraped-vendors/[id]/request`                                           | Vitest unit with mocked supabase + Resend  |
| `<UnclaimedVendorCard>`, `<UnclaimedVendorProfile>`, `<OwnThisBusinessModal>` | Vitest + React Testing Library             |
| `/vendors/[slug]` end-to-end (unclaimed render → "I own this" modal → submit) | Playwright                                 |

## Migrations apply policy

Per [[migration-apply-policy]]: Claude applies 00051-00053 to dev directly. User applies to prod with 00045-00050 in one batch.

## Out of scope (followups)

- Auto-decay cron — manual SQL-driven outreach Day 1; cron after first batch validates the mechanic
- Admin UI for managing requests — SQL editor + Resend inbox is the Day 1 admin surface
- IG OAuth verification — Meta app submission still planned per K spec; integrates separately
- Newsletter/email-list capture on unclaimed pages — deferred
- Multi-photo carousel on unclaimed profile — single hero photo Day 1; gallery on claim
