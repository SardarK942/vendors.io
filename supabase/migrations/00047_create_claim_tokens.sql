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
