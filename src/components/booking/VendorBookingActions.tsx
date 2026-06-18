'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { VendorAdjustQuoteForm } from '@/components/booking/VendorAdjustQuoteForm';
import { useCrossBusinessActionToast } from '@/components/dashboard/CrossBusinessActionToast';

interface Props {
  bookingId: string;
  status: string;
  totalPriceCents: number;
  // Sub-project I §8: identify the booking's owning business for the
  // cross-business toast. Optional so this component is backwards-compatible
  // with callers that don't pass them yet (single-business vendors won't see
  // a toast anyway since active business === booking business).
  bookingBusinessId?: string;
  bookingBusinessName?: string;
  /** Value of ?action= query param. Auto-expands the adjust/send-quote form on
   *  mount and strips the query from history so refresh does not re-trigger. */
  initialAction?: string;
  /** T12: Remaining adjustments count for the vendor. Capped at 2. */
  vendorAdjustmentCount?: number;
}

export function VendorBookingActions({
  bookingId,
  status,
  totalPriceCents,
  bookingBusinessId,
  bookingBusinessName,
  initialAction,
  vendorAdjustmentCount,
}: Props) {
  const router = useRouter();
  const [showAdjustForm, setShowAdjustForm] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const triggerCrossBusinessToast = useCrossBusinessActionToast();

  // T17: Compute remaining adjustments (cap is 2)
  const adjustsLeft = Math.max(0, 2 - (vendorAdjustmentCount ?? 0));

  // ── ?action= deep-link handler ──────────────────────────────────────────────
  // 'adjust' and 'send-quote' both expand the inline quote form on this component.
  // Strips the query param via router.replace so a refresh does not re-expand.
  useEffect(() => {
    if (!initialAction) return;
    if (initialAction === 'adjust' || initialAction === 'send-quote') {
      setShowAdjustForm(true);
      const url = new URL(window.location.href);
      url.searchParams.delete('action');
      router.replace(url.pathname + (url.search || ''), { scroll: false });
    }
    // All other actions are handled by BookingActions — no-op here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once on mount — initialAction is stable (server-rendered prop)

  const isPending = status === 'pending';
  const isPendingQuote = status === 'pending_quote';
  const isDeclined = status === 'adjusted_quote_declined';

  if (!isPending && !isPendingQuote && !isDeclined) return null;

  async function handleAccept() {
    setAccepting(true);
    try {
      const res = await fetch(`/api/bookings/${bookingId}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      if (!res.ok) {
        const json = await res.json();
        toast.error(json.error?.message ?? 'Failed to accept booking');
        return;
      }

      toast.success('Booking accepted. Couple has been notified to pay the deposit.');

      // Sub-project I §8: cross-business toast if the booking is for a non-
      // active business.
      if (bookingBusinessId && bookingBusinessName) {
        triggerCrossBusinessToast({
          action: 'accept',
          bookingBusinessId,
          bookingBusinessName,
        });
      }

      router.refresh();
    } catch {
      toast.error('Network error, please try again.');
    } finally {
      setAccepting(false);
    }
  }

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">
          {isPending
            ? 'Respond to this booking'
            : isPendingQuote
              ? 'Send a custom quote'
              : 'Send revised quote'}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isPending && (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              variant="default"
              className="flex-1"
              onClick={handleAccept}
              disabled={accepting}
            >
              {accepting
                ? 'Accepting...'
                : `Accept at $${(totalPriceCents / 100).toLocaleString()}`}
            </Button>
            <div className="flex flex-1 flex-col gap-1">
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setShowAdjustForm((s) => !s)}
                disabled={adjustsLeft === 0 && !showAdjustForm}
              >
                {showAdjustForm ? 'Cancel' : 'Adjust quote'}
              </Button>
              <span className="text-xs text-ink/60">
                {adjustsLeft === 0
                  ? 'No more adjustments available'
                  : `${adjustsLeft} adjustment${adjustsLeft === 1 ? '' : 's'} remaining`}
              </span>
            </div>
          </div>
        )}

        {isPendingQuote && (
          <Button variant="default" className="w-full" onClick={() => setShowAdjustForm((s) => !s)}>
            {showAdjustForm ? 'Cancel' : 'Send quote'}
          </Button>
        )}

        {isDeclined && (
          <Button variant="default" className="w-full" onClick={() => setShowAdjustForm((s) => !s)}>
            {showAdjustForm ? 'Cancel' : 'Send revised quote'}
          </Button>
        )}

        {showAdjustForm && (
          <>
            <Separator />
            <VendorAdjustQuoteForm
              bookingId={bookingId}
              currentTotalCents={totalPriceCents}
              onSuccess={() => setShowAdjustForm(false)}
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}
