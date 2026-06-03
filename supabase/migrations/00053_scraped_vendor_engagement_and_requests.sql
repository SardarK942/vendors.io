-- Cookieless engagement on unclaimed vendor pages.
-- IP-hash matches src/lib/analytics/ip-hash.ts pattern (SHA-256 of ip::day),
-- so identical IP on the same UTC day collapses into one row per event_type.

CREATE TABLE scraped_vendor_engagement (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scraped_vendor_id uuid NOT NULL REFERENCES scraped_vendors(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('view', 'ig_click')),
  ip_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX scraped_vendor_engagement_vendor_idx
  ON scraped_vendor_engagement (scraped_vendor_id, event_type, created_at DESC);

CREATE UNIQUE INDEX scraped_vendor_engagement_daily_dedup_idx
  ON scraped_vendor_engagement (
    scraped_vendor_id,
    event_type,
    ip_hash,
    (date_trunc('day', created_at AT TIME ZONE 'UTC'))
  );

ALTER TABLE scraped_vendor_engagement ENABLE ROW LEVEL SECURITY;

-- Vendor-initiated remove / claim-help requests via "I own this business" modal.

CREATE TABLE scraped_vendor_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scraped_vendor_id uuid NOT NULL REFERENCES scraped_vendors(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('remove', 'claim_request')),
  requester_name text,
  requester_email text NOT NULL,
  requester_ig text,
  reason text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'actioned', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  actioned_at timestamptz,
  actioned_by_user_id uuid REFERENCES users(id)
);

CREATE INDEX scraped_vendor_requests_open_idx
  ON scraped_vendor_requests (status, created_at)
  WHERE status = 'open';

ALTER TABLE scraped_vendor_requests ENABLE ROW LEVEL SECURITY;
