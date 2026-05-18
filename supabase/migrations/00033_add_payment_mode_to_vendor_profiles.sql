-- 00033_add_payment_mode_to_vendor_profiles.sql
-- Sub-project C — cash vendor payment mode
-- See docs/superpowers/specs/2026-05-17-sub-project-c-cash-vendor-design.md
--
-- Nullable on purpose: the wizard's resume logic uses NULL to detect
-- "vendor hasn't explicitly chosen yet." All read sites default to 'stripe'.

ALTER TABLE vendor_profiles
  ADD COLUMN payment_mode text
    CHECK (payment_mode IN ('stripe', 'cash'));
