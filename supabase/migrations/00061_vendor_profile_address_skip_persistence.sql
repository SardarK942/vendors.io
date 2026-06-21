ALTER TABLE vendor_profiles ADD COLUMN IF NOT EXISTS base_address_skipped boolean NOT NULL DEFAULT false;
