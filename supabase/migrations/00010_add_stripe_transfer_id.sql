-- Add stripe_transfer_id to transactions for transfer reversal tracking.
-- Populated by initiatePayout; read by handleChargeRefunded when a post-payout refund lands.

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS stripe_transfer_id TEXT;

CREATE INDEX IF NOT EXISTS idx_transactions_stripe_transfer_id
  ON public.transactions(stripe_transfer_id)
  WHERE stripe_transfer_id IS NOT NULL;
