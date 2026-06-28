'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { CounterModal } from '@/components/bookings/CounterModal';
import { fmtUSD } from '@/lib/intl';

const REASON_LABELS: Record<string, string> = {
  travel: 'Travel distance',
  guest_count: 'Guest count over package limit',
  peak_date: 'Peak-season date',
  custom: 'Custom requirements',
  setup_complexity: 'Setup complexity',
  discount: 'Discount applied',
  other: 'Other',
};

interface Props {
  bookingId: string;
  /** package base + selected addons (before any adjustment) */
  originalSubtotalCents: number;
  adjustmentCents: number;
  reason: string;
  explanation?: string | null;
  /** Total booking price in cents (used as pre-fill for counter modal). */
  totalPriceCents: number;
  /** T12: number of counter-offers the couple has already sent (0–2). */
  coupleCounterCount?: number;
  /** Value of ?action= query param. Auto-opens the counter modal on mount when
   *  value is 'counter'. Strips the query from history so refresh does not re-open. */
  initialAction?: string;
}

export function AdjustmentReview({
  bookingId,
  originalSubtotalCents,
  adjustmentCents,
  reason,
  explanation,
  totalPriceCents,
  coupleCounterCount = 0,
  initialAction,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [counterOpen, setCounterOpen] = useState(false);
  const [declineConfirmOpen, setDeclineConfirmOpen] = useState(false);

  // T18: Remaining counter-offers for this couple (cap is 2)
  const countersLeft = Math.max(0, 2 - coupleCounterCount);
  // Couple can counter when status is adjusted_quote_sent (this component only
  // renders in that status, so canCounter is always true here, but kept
  // explicit for clarity).
  const canCounter = true;

  // ── ?action=counter deep-link handler ──────────────────────────────────────
  useEffect(() => {
    if (initialAction !== 'counter') return;
    if (countersLeft > 0 && canCounter) {
      setCounterOpen(true);
    }
    // Always strip the query param when counter case is hit, regardless of whether modal opened
    const url = new URL(window.location.href);
    url.searchParams.delete('action');
    router.replace(url.pathname + (url.search || ''), { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once on mount — initialAction is stable (server-rendered prop)

  async function action(endpoint: 'accept-adjusted' | 'decline-adjusted') {
    setBusy(true);
    try {
      const res = await fetch(`/api/bookings/${bookingId}/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (res.ok) {
        const json = await res.json();
        if (endpoint === 'accept-adjusted' && json.data?.deposit_checkout_url) {
          toast.success('Quote accepted. Redirecting to payment…');
          window.location.href = json.data.deposit_checkout_url;
        } else {
          toast.success(endpoint === 'accept-adjusted' ? 'Quote accepted.' : 'Quote declined.');
          setDeclineConfirmOpen(false);
          router.refresh();
        }
      } else {
        const json = await res.json().catch(() => ({}));
        toast.error(json.error ?? 'Action failed. Please try again.');
        setBusy(false);
      }
    } catch {
      toast.error('Network error. Please try again.');
      setBusy(false);
    }
  }

  const finalTotal = originalSubtotalCents + adjustmentCents;
  const isIncrease = adjustmentCents > 0;
  const isDiscount = adjustmentCents < 0;

  return (
    <div className="space-y-5 rounded-lg border p-6">
      <h3 className="text-base font-semibold">Vendor Sent an Adjusted Quote</h3>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Package + add-ons</p>
          <p className="text-lg font-medium tabular-nums">{fmtUSD(originalSubtotalCents)}</p>
        </div>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Adjustment</p>
          <p
            className={`text-lg font-medium tabular-nums ${isIncrease ? 'text-orange-600' : isDiscount ? 'text-green-600' : ''}`}
          >
            {adjustmentCents >= 0 ? '+' : ''}
            {fmtUSD(adjustmentCents)}
          </p>
          <p className="text-xs text-muted-foreground">{REASON_LABELS[reason] ?? reason}</p>
          {explanation && (
            <p className="text-xs italic text-muted-foreground">&ldquo;{explanation}&rdquo;</p>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between border-t pt-4">
        <div>
          <p className="text-xs text-muted-foreground">Adjusted total</p>
          <p className="text-xl font-bold tabular-nums">{fmtUSD(finalTotal)}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <Button onClick={() => action('accept-adjusted')} disabled={busy}>
          Accept adjusted quote
        </Button>
        <Button variant="outline" onClick={() => setDeclineConfirmOpen(true)} disabled={busy}>
          Decline
        </Button>

        {/* Counter button — omitted entirely (not greyed) when countersLeft === 0 (spec § 5.4) */}
        {countersLeft > 0 && canCounter && (
          <div className="flex flex-col gap-1">
            <Button variant="secondary" onClick={() => setCounterOpen(true)} disabled={busy}>
              Counter
            </Button>
            <span className="text-xs text-ink/60">
              {countersLeft} counter-offer{countersLeft === 1 ? '' : 's'} remaining
            </span>
          </div>
        )}

        {/* When cap is reached, show only helper text — no button */}
        {countersLeft === 0 && canCounter && (
          <span className="self-center text-xs text-ink/60">No counter-offers remaining</span>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        If you decline, the vendor will have 72 hours to send a revised quote.
      </p>

      <CounterModal
        open={counterOpen}
        onClose={() => setCounterOpen(false)}
        bookingId={bookingId}
        currentTotalCents={totalPriceCents}
        onSuccess={() => router.refresh()}
      />

      <ConfirmDialog
        open={declineConfirmOpen}
        onOpenChange={setDeclineConfirmOpen}
        title="Decline This Quote?"
        description="The vendor will be asked to revise. If they don't, the booking will fall through."
        confirmLabel="Decline Quote"
        destructive
        busy={busy}
        onConfirm={() => action('decline-adjusted')}
      />
    </div>
  );
}

export default AdjustmentReview;
