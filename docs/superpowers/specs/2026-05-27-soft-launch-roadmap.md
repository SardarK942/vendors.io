# Soft-launch roadmap — K → M → L → outreach

**Authored 2026-05-27** by Sardar + Claude during the K brainstorm session.
**Context:** Functional core (A, B, C, D, E, F, G, I) is shipped to prod. Brand foundation + homepage hero are shipped. PR #29 (vendor_profiles schema drift) just landed + applied to prod. `vendor_profiles` is empty in prod. Remaining path to outreach is the three sub-projects below, plus PR #28 (Resend wire-up) which is in flight.

## Sequencing

```
1. K  — Vendor scraper + claim flow      [ design approved, plan pending ]
2. M  — Exhaustive Playwright e2e suite  [ design pending ]
3. L  — Per-type packages + onboarding   [ design pending ]
4.    outreach                            [ manual DMs/emails from K's CSV ]
```

This differs from the original "K is last" rule from [[sub-project-sequencing]] (2026-05-17). At the time, K was deferred because the product wasn't ready. Now the product _is_ ready and prod is empty — K becomes the bottleneck rather than the polish layer.

## Sub-project K — Vendor scraper

**Status:** Design approved 2026-05-27. See `2026-05-27-sub-project-k-vendor-scraper-design.md`.

**One-line:** Multi-source ingestion pipeline (Google Places + Apify Instagram + ScrapeGraphAI for enrichment + SearchGraph for discovery + hand-curated JSON) writes to a `scraped_vendors` staging table; signed claim tokens delivered via outreach DM; signup-time fuzzy match handles organic claims; IG OAuth verification arrives later via Meta app review.

**Categories priority:** carts → mehndi → hair_makeup → dj → photobooth → venue → live_music → photography → videography → content_creation (NEW) → decor → catering (IL-wide desi/Arab restaurants).

**Geography:** Chicago metro + IL desi/Arab enclaves only Day 1.

## Sub-project M — Exhaustive Playwright e2e suite

**Status:** Design pending.

**One-line:** Build out Playwright e2e coverage across every product surface (happy paths + edge cases for couple flow, vendor flow, payment flow, booking adjustment, calendar, notifications, multi-business, claim flow). Wire CI workflow with Supabase test DB env vars so the e2e job actually runs in CI (currently silently failing on env-var miss — surfaced during PR #29).

**Why before outreach:** Once we DM 100+ vendors, every bug in the wizard or the marketplace becomes a conversion loss. Catch them in CI, not in prod under real load.

**Out of scope of M:** load testing, accessibility audits, visual regression. Those are separate concerns if needed.

## Sub-project L — Per-vendor-type packages + tailored onboarding

**Status:** Design pending. User flagged 2026-05-27 with: _"We need to do a little deep dive into each business type and see how the majority of them charge and then we can make a better decision on how we'll onboard each vendor and their package flow and creation flow as well."_

**One-line:** Per-vendor-category research → category-specific package templates (e.g., photographers price per-event-hour vs caterers price per-head vs venues price flat-fee) → wizard step 5 (Packages) renders different UI per category → CRM package editor adapts.

**Why between M and outreach:** Scraped vendors who claim their profile via DM should land on a wizard that already understands their category's pricing model. A photographer shouldn't have to figure out how to express their pricing in a generic per-package field designed for caterers. Better UX = higher conversion = better outreach ROI.

**Dependencies on K:** L can technically run in parallel with K, but the category-specific deep-dive will be informed by patterns spotted in scraped data (e.g., "every cart has a per-event flat-rate; every photographer has per-hour-tier pricing"). Cleaner to sequence K → L.

## Outreach

**Status:** Manual Day 1.

**One-line:** Take the `mint-tokens-<campaign>.csv` output from K, paste into IG DM tool / email tool, send personalized outreach with the claim link. First batch is hand-sent. If conversion is decent, consider sub-project N (outreach automation) — Resend templates for email, IG Graph API for DMs.

## Discovered during this session — followups

- **Migration 00045** — new `content_creation` category. Belongs to K.
- **Vendor-selected thumbnail UX** — already flagged in [[baazar-vendor-thumbnail-selection-requirement]]. Surfaces in L (wizard) and E (CRM) again.
- **CI Supabase test DB env vars** — pre-existing infra gap. Wrapped into M.
- **Local e2e auth login timeout** — surfaced during PR #29 verification. Wrapped into M.
- **Prod `vendor_profiles` is empty** — verified during migration 00044 apply. The literal reason K exists.

## Out of scope for this roadmap

- Sub-project N (outreach automation) — depends on K + L outcomes.
- International expansion (NJ/NYC, Bay Area, Toronto, Houston) — depends on Chicago funnel proving out.
- Bridal-wear flat-fee model — referenced in migration 00042 as a future business-model change.
