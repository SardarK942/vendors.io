-- ============================================================================
-- Sub-project A · Phase A1 · Step 5/7
-- Add vendor base_address columns + visibility toggle
-- ============================================================================
-- Vendors with at_vendor-mode packages need a default base address (studio,
-- food cart pickup point, etc.) that pre-fills the booking form. The
-- base_address_public flag controls whether the full address is shown
-- pre-booking; city + state are always public, full address reveals when
-- the booking reaches deposit_paid status (mirroring how couple_contact is
-- revealed to the vendor at the same milestone).
--
-- All base_address_* columns are nullable at the DB layer. Application-side
-- validation enforces "required when vendor has any package with
-- location_mode='at_vendor'" — keeps the DB flexible while the rule lives
-- close to the editor that needs it.
--
-- See docs/superpowers/specs/2026-05-11-sub-project-a-packages-design.md §2.3.

ALTER TABLE vendor_profiles ADD COLUMN base_address_line_1 text;
ALTER TABLE vendor_profiles ADD COLUMN base_city text;
ALTER TABLE vendor_profiles ADD COLUMN base_state text;
ALTER TABLE vendor_profiles ADD COLUMN base_postal_code text;
ALTER TABLE vendor_profiles ADD COLUMN base_google_place_id text;
ALTER TABLE vendor_profiles ADD COLUMN base_address_public boolean NOT NULL DEFAULT false;
