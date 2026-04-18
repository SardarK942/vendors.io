-- Observability tables: visibility into cron runs and Stripe webhook events.

-- ── Cron run audit ───────────────────────────────────────────────────────────
-- One row per /api/cron/tick invocation. Lets admins answer "did the cron fire?
-- what did it do?" without digging through Vercel logs.
CREATE TABLE IF NOT EXISTS public.cron_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job             TEXT NOT NULL,            -- e.g. 'tick'
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ,
  duration_ms     INTEGER,
  result          JSONB,                    -- counts + any partial errors
  error           TEXT,                     -- non-null if the job threw
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cron_runs_started_at
  ON public.cron_runs(started_at DESC);

ALTER TABLE public.cron_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only"
  ON public.cron_runs
  FOR ALL
  USING (false);

-- ── Stripe webhook event audit ───────────────────────────────────────────────
-- One row per event delivered. event_id is unique so our webhook can detect and
-- skip replays (Stripe retries on non-2xx). Audit trail answers "did event X
-- arrive? did we handle it? what went wrong?"
CREATE TABLE IF NOT EXISTS public.stripe_events (
  event_id        TEXT PRIMARY KEY,
  event_type      TEXT NOT NULL,
  received_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  handled_at      TIMESTAMPTZ,
  error           TEXT,
  payload         JSONB
);

CREATE INDEX IF NOT EXISTS idx_stripe_events_received_at
  ON public.stripe_events(received_at DESC);

CREATE INDEX IF NOT EXISTS idx_stripe_events_type
  ON public.stripe_events(event_type);

ALTER TABLE public.stripe_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only"
  ON public.stripe_events
  FOR ALL
  USING (false);
