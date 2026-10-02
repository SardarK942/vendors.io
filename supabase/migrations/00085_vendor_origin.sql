-- ============================================================================
-- Vendor origin · local vs international fork (two-lane shop model)
-- Add vendor_profiles.vendor_origin + vendor_country + vendor_currency
-- ============================================================================
-- Bridal-wear vendors declare whether they operate LOCALLY (Chicago-area, price
-- in USD, sell through the existing Shop) or INTERNATIONALLY (overseas atelier
-- whose prices need a landed-price conversion before a US buyer sees them).
--
-- This column drives the onboarding fork (StepBasics) and gates the Shop:
-- international bridal vendors get a "coming soon" state while the Phase-2
-- landed-price engine is built. Non-bridal vendors are always 'local'/'usd' —
-- the fork is only surfaced for bridal_wear in the UI, but the columns are
-- generic so the model can extend later.
--
-- vendor_origin: 'local' (default) or 'international'. TEXT + CHECK enum,
-- matching the established category/status pattern (not a Postgres enum type).
--
-- vendor_country: nullable ISO-ish country label for international vendors
-- (India, Pakistan, …). NULL for local vendors. Value set is app-layer, same
-- forgiving convention as subcategories (no CHECK on content).
--
-- vendor_currency: the currency the vendor quotes wholesale prices in. Defaults
-- to 'usd' (local vendors price in USD directly). International vendors pick
-- their home currency (inr/pkr/…); validated app-layer.
--
-- Additive only, no down-migration.
--
-- See docs/superpowers/specs/2026-10-02-vendor-origin-and-landed-pricing.md
-- ============================================================================

ALTER TABLE vendor_profiles ADD COLUMN vendor_origin text NOT NULL DEFAULT 'local' CHECK (vendor_origin IN ('local','international'));
ALTER TABLE vendor_profiles ADD COLUMN vendor_country text;
ALTER TABLE vendor_profiles ADD COLUMN vendor_currency text NOT NULL DEFAULT 'usd';
