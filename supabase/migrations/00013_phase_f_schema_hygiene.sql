-- Phase F — schema hygiene: indexes on hot query paths + PII retention function.
-- RLS re-audit produced no policy changes (see docs/rls_audit_phase_f.md).

-- ──────────────────────────────────────────────────────────────────────────────
-- F1 — Composite indexes on frequent multi-column filters
-- ──────────────────────────────────────────────────────────────────────────────

-- Vendor dashboard + earnings queries filter booking_requests by
-- (vendor_profile_id, status). The existing single-column indexes force a merge
-- or filter-after-scan; a composite keeps it to an index-only lookup.
CREATE INDEX IF NOT EXISTS idx_booking_requests_vendor_status
  ON public.booking_requests(vendor_profile_id, status);

-- Couple dashboard lists bookings by (couple_user_id, status) with recency ordering.
CREATE INDEX IF NOT EXISTS idx_booking_requests_couple_status
  ON public.booking_requests(couple_user_id, status);

-- initiatePayout scans transactions for earnable, not-yet-paid rows. Partial
-- index keeps this tight and avoids bloat on the long-tail of settled rows.
CREATE INDEX IF NOT EXISTS idx_transactions_earned_unpaid
  ON public.transactions(booking_request_id)
  WHERE status = 'earned' AND transferred_at IS NULL;

-- Public vendor profile renders reviews list by recency. idx_reviews_vendor exists
-- on vendor_profile_id alone; composite with created_at DESC lets the sort use the
-- index instead of an external sort.
CREATE INDEX IF NOT EXISTS idx_reviews_vendor_created
  ON public.reviews(vendor_profile_id, created_at DESC);

-- ──────────────────────────────────────────────────────────────────────────────
-- F3 — PII retention: redact couple contact on stale terminal bookings.
-- ──────────────────────────────────────────────────────────────────────────────
-- Contact info is revealed to the vendor only after deposit is paid. Once a
-- booking is in a terminal state (completed / cancelled / expired / rejected /
-- disputed) and has sat there for >90 days, neither party needs access to the
-- couple's phone+email through us. Daily cron calls this via service role; RLS
-- is bypassed but the function uses SECURITY DEFINER for belt-and-suspenders.
CREATE OR REPLACE FUNCTION public.redact_stale_booking_pii(retention_days INT DEFAULT 90)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  redacted_count INT;
  cutoff TIMESTAMPTZ := NOW() - (retention_days || ' days')::interval;
BEGIN
  WITH redacted AS (
    UPDATE public.booking_requests
    SET couple_phone = NULL,
        couple_email = NULL
    WHERE status IN (
        'completed', 'couple_cancelled', 'vendor_cancelled',
        'cancelled_mutual', 'expired', 'rejected', 'disputed'
      )
      AND (couple_phone IS NOT NULL OR couple_email IS NOT NULL)
      -- Use the most recent terminal-transition timestamp; updated_at as fallback
      -- covers expired rows (no dedicated column) and any future status.
      AND COALESCE(completed_at, cancelled_at, disputed_at, updated_at) < cutoff
    RETURNING 1
  )
  SELECT count(*)::int INTO redacted_count FROM redacted;
  RETURN redacted_count;
END;
$$;

-- Lock down: only service role should invoke this.
REVOKE ALL ON FUNCTION public.redact_stale_booking_pii(INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.redact_stale_booking_pii(INT) FROM anon, authenticated;

-- ──────────────────────────────────────────────────────────────────────────────
-- F2 — RLS re-audit fixes
-- ──────────────────────────────────────────────────────────────────────────────
-- The original "Service role can manage …" policies on stripe_accounts and
-- transactions were intended to be no-ops (service role bypasses RLS) but they
-- use `USING (true) WITH CHECK (true)` with no role restriction, which actually
-- grants every authed user read/write access to every row — defeating the
-- accompanying owner-scoped SELECT policies. Drop them; service role bypass
-- continues to work for our server routes + webhooks + cron.

DROP POLICY IF EXISTS "Service role can manage stripe accounts" ON public.stripe_accounts;
DROP POLICY IF EXISTS "Service role can manage transactions" ON public.transactions;
