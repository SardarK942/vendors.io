-- Portfolio video clips (Cloudflare Stream). Stores Stream video UIDs, not URLs.
ALTER TABLE vendor_profiles
  ADD COLUMN portfolio_videos TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
