'use client';

import { deriveEarningsState, type EarningsSummary } from '@/lib/shop/earnings';
import { formatPrice } from '@/lib/utils';

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(iso));
}

export function EarningsCard({
  summary,
  onSetup,
}: {
  summary: EarningsSummary;
  onSetup: () => void;
}) {
  const state = deriveEarningsState(summary);
  if (state === 'none') return null;

  const eyebrow = state === 'paid_out' ? 'Paid out' : 'Earnings · held';
  const figure = state === 'paid_out' ? summary.transferredCents : summary.heldCents;

  return (
    <section
      aria-label="Earnings"
      className="mb-8 rounded-2xl border border-hairline bg-cream-soft/40 p-6"
    >
      <p className="font-mono text-xs uppercase tracking-widest text-ink/60">{eyebrow}</p>
      <p className="mt-2 font-mono text-4xl text-ink">{formatPrice(figure)}</p>

      {state === 'held_not_ready' ? (
        <>
          <p className="mt-3 max-w-prose text-ink/70">
            Finish payout setup and we will send this to your Stripe account. It stays safely held
            for you until then.
          </p>
          <button
            type="button"
            onClick={onSetup}
            className="mt-4 rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-cream transition-colors hover:bg-hot-pink"
          >
            Set up payouts
          </button>
        </>
      ) : null}

      {state === 'in_flight' ? (
        <p className="mt-3 flex items-center gap-2 text-ink/70">
          <span className="relative flex h-2.5 w-2.5" aria-hidden="true">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-indigo/60 motion-reduce:animate-none" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-indigo" />
          </span>
          <span>Transferring to your account</span>
        </p>
      ) : null}

      {state === 'paid_out' ? (
        <>
          <p className="mt-3 text-ink/70">paid out to your Stripe account</p>
          {summary.lastTransferredAt ? (
            <p className="mt-1 text-sm text-ink/60">
              Most recent payout {formatDate(summary.lastTransferredAt)}
            </p>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
