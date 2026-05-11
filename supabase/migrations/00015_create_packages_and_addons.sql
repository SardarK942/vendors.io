-- ============================================================================
-- Sub-project A · Phase A1 · Step 1/7
-- Create packages + package_addons tables
-- ============================================================================
-- Packages are the unit a vendor offers and a couple selects. Each package
-- has a base price, included items, max guests, duration, photos, optional
-- add-ons, and events_count (default 1; supports multi-day bundles for Desi
-- weddings: Mehndi + Shaadi + Walima as a single booking).
--
-- Add-ons are optional toggles couples stack on at booking time; price
-- deltas are snapshotted at booking creation in bookings.selected_addons
-- (jsonb) so vendor renames/repricing don't retroactively affect existing
-- bookings.
--
-- location_mode declares whether the couple supplies the event location
-- (default) or the service happens at the vendor's address (e.g. studio,
-- food cart pickup).
--
-- See docs/superpowers/specs/2026-05-11-sub-project-a-packages-design.md §2.1.

CREATE TABLE packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_profile_id uuid NOT NULL REFERENCES vendor_profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text NOT NULL,
  base_price_cents integer NOT NULL CHECK (base_price_cents > 0),
  included_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  max_guests integer NOT NULL CHECK (max_guests > 0),
  duration_hours numeric(4,1) NOT NULL CHECK (duration_hours > 0),
  events_count integer NOT NULL DEFAULT 1 CHECK (events_count BETWEEN 1 AND 5),
  featured_image_url text NOT NULL,
  gallery_image_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
  vendor_notes_template text,
  location_mode text NOT NULL DEFAULT 'couple_provides'
    CHECK (location_mode IN ('couple_provides', 'at_vendor')),
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX packages_vendor_active_idx ON packages(vendor_profile_id, is_active);

CREATE TABLE package_addons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id uuid NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
  name text NOT NULL,
  price_delta_cents integer NOT NULL,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX package_addons_package_idx ON package_addons(package_id);
