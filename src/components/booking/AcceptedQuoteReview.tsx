'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DepositDialog } from '@/components/dashboard/DepositDialog';
import { CounterModal } from '@/components/bookings/CounterModal';
import { fmtUSD } from '@/lib/intl';

interface Props {
  bookingId: string;
  /** Agreed total (cents). The deposit is 5% of this. */
  totalPriceCents: number;
  /** Deposit due now (cents) — 5% of the total. */
  depositCents: number;
  vendorName: string;
  /** Number of counter-offers the couple has already sent (0–2). */
  coupleCounterCount?: number;
  /** ?action= value — 'pay-deposit' opens the deposit modal, 'counter' the counter modal. */
  initialAction?: string;
}

/**
 * Prominent "quote accepted → pay deposit" CTA for the couple, mirroring
 * AdjustmentReview. Owns the Pay Deposit + Counter actions (moved out of the
 * generic Actions card) so the next step reads as the clear call to action.
 */
export function AcceptedQuoteReview({
  bookingId,
  totalPriceCents,
  depositCents,
  vendorName,
  coupleCounterCount = 0,
  initialAction,
}: Props) {
  const router = useRouter();
  const [depositOpen, setDepositOpen] = useState(false);
  const [counterOpen, setCounterOpen] = useState(false);

  const countersLeft = Math.max(0, 2 - coupleCounterCount);

  // ── ?action= deep-link handler (pay-deposit / counter) ──────────────────────
  useEffect(() => {
    let opened = false;
    if (initialAction === 'pay-deposit') {
      setDepositOpen(true);
      opened = true;
    } else if (initialAction === 'counter') {
      if (countersLeft > 0) setCounterOpen(true);
      opened = true; // handled regardless of whether the modal opened
    }
    if (opened) {
      const url = new URL(window.location.href);
      url.searchParams.delete('action');
      router.replace(url.pathname + (url.search || ''), { scroll: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once on mount — initialAction is a stable server-rendered prop

  return (
    <div className="space-y-5 rounded-2xl border-2 border-emerald-300 bg-white p-6 shadow-[0_16px_40px_-24px_rgba(16,122,87,0.45)]">
      <div>
        <p className="inline-flex items-center gap-1 font-mono text-[10px] font-bold uppercase tracking-widest text-emerald-700">
          <CheckCircle2 className="size-3.5" aria-hidden="true" /> Quote accepted
        </p>
        <h3 className="mt-1 font-display text-xl text-ink">Pay your deposit to confirm</h3>
        <p className="mt-1 text-sm text-ink-soft">
          The vendor&rsquo;s full address and instructions appear after payment.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 border-t border-hairline pt-4">
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Deposit due now (5%)</p>
          <p className="text-xl font-bold tabular-nums text-ink">{fmtUSD(depositCents)}</p>
        </div>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Agreed total</p>
          <p className="text-lg font-medium tabular-nums text-ink-soft">
            {fmtUSD(totalPriceCents)}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-start gap-3">
        <Button onClick={() => setDepositOpen(true)}>Pay Deposit</Button>

        {countersLeft > 0 && (
          <div className="flex flex-col gap-1">
            <Button variant="outline" onClick={() => setCounterOpen(true)}>
              Counter
            </Button>
            <span className="text-xs tabular-nums text-ink/60">
              {countersLeft} counter-offer{countersLeft === 1 ? '' : 's'} remaining
            </span>
          </div>
        )}
        {countersLeft === 0 && (
          <span className="self-center text-xs text-ink/60">No counter-offers remaining</span>
        )}
      </div>

      <DepositDialog
        bookingId={bookingId}
        quoteAmountCents={totalPriceCents}
        vendorName={vendorName}
        open={depositOpen}
        onOpenChange={setDepositOpen}
      />

      <CounterModal
        open={counterOpen}
        onClose={() => setCounterOpen(false)}
        bookingId={bookingId}
        currentTotalCents={totalPriceCents}
        onSuccess={() => router.refresh()}
      />
    </div>
  );
}

export default AcceptedQuoteReview;
