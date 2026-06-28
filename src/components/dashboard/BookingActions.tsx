'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import type { Database } from '@/types/database.types';
import { ReviewForm } from '@/components/dashboard/ReviewForm';
import { DisputeDialog } from '@/components/dashboard/DisputeDialog';
import { CancelDialog } from '@/components/dashboard/CancelDialog';
import { DepositDialog } from '@/components/dashboard/DepositDialog';
import { CounterModal } from '@/components/bookings/CounterModal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

type BookingRow = Database['public']['Tables']['bookings']['Row'];

interface BookingActionsProps {
  booking: BookingRow;
  role: 'couple' | 'vendor';
  hasReview?: boolean;
  vendorName?: string;
  /** Value of ?action= query param. Auto-opens the matching modal on mount
   *  and strips the query from history so refresh does not re-trigger. */
  initialAction?: string;
}

export function BookingActions({
  booking,
  role,
  hasReview = false,
  vendorName = '',
  initialAction,
}: BookingActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [depositOpen, setDepositOpen] = useState(false);
  const [counterOpen, setCounterOpen] = useState(false);
  const [completeConfirmOpen, setCompleteConfirmOpen] = useState(false);

  // Hoist counter computation to avoid duplicate type casts
  const coupleCounterCount = booking.couple_counter_count ?? 0;
  const countersLeft = Math.max(0, 2 - coupleCounterCount);

  // ── ?action= deep-link handler ──────────────────────────────────────────────
  // Opens the matching modal when the user arrives via a notification action link.
  // Strips the query param via router.replace so a refresh does not re-open.
  // Unknown action values are silently ignored (no crash, query left intact).
  useEffect(() => {
    if (!initialAction) return;
    let opened = false;
    switch (initialAction) {
      // Couple: pay deposit after vendor accepted
      case 'pay-deposit':
        setDepositOpen(true);
        opened = true;
        break;
      // Couple: leave a review after booking completed
      case 'leave-review':
        setReviewOpen(true);
        opened = true;
        break;
      // Vendor or couple: decline / cancel
      case 'decline':
        setCancelOpen(true);
        opened = true;
        break;
      // Couple: counter-offer on an `accepted` booking (adjusted_quote_sent is
      // handled by AdjustmentReview which owns its own ?action=counter handler).
      case 'counter': {
        const isCounterable = ['accepted'].includes(booking.status);
        if (isCounterable && countersLeft > 0) {
          setCounterOpen(true);
        }
        opened = true; // Mark as handled regardless of whether modal opened
        break;
      }
      // 'accept'     → vendor accept is a direct button (no modal); couple accept
      //                shows AdjustmentReview inline — both are already visible on
      //                page load, no modal to open. No-op here.
      // 'view-review' → no modal exists yet. No-op (degraded but not crashed).
      // 'adjust'      → handled by VendorBookingActions (owns the adjust form).
      // 'send-quote'  → handled by VendorBookingActions (owns the send-quote form).
      default:
        opened = false;
        break;
    }
    if (opened) {
      // Strip the ?action= query so refresh doesn't reopen the modal.
      const url = new URL(window.location.href);
      url.searchParams.delete('action');
      router.replace(url.pathname + (url.search || ''), { scroll: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once on mount — initialAction is stable (server-rendered prop)

  const cancellable = [
    'pending',
    'accepted',
    'adjusted_quote_sent',
    'adjusted_quote_declined',
    'deposit_paid',
  ].includes(booking.status);

  const handleComplete = async () => {
    setLoading(true);
    const res = await fetch(`/api/bookings/${booking.id}/complete`, { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.error || 'Failed to complete');
      setLoading(false);
      return;
    }
    toast.success('Booking marked complete.');
    setCompleteConfirmOpen(false);
    setLoading(false);
    router.refresh();
  };

  const totalPriceCents = (booking as unknown as Record<string, unknown>).total_price_cents as
    | number
    | undefined;

  return (
    <div className="flex flex-wrap gap-2 pt-2">
      {/* Pay deposit when vendor has accepted */}
      {role === 'couple' && booking.status === 'accepted' && totalPriceCents != null && (
        <Button onClick={() => setDepositOpen(true)} disabled={loading}>
          Pay Deposit
        </Button>
      )}

      {/* Counter-offer when vendor has accepted — couple may propose a different total */}
      {role === 'couple' && booking.status === 'accepted' && (
        <>
          {countersLeft > 0 && (
            <div className="flex flex-col gap-1">
              <Button variant="secondary" onClick={() => setCounterOpen(true)} disabled={loading}>
                Counter
              </Button>
              <span className="text-xs text-ink/60">
                {countersLeft} counter-offer{countersLeft === 1 ? '' : 's'} remaining
              </span>
            </div>
          )}
          {countersLeft === 0 && (
            <span className="self-center text-xs text-ink/60">No counter-offers remaining</span>
          )}
        </>
      )}

      {role === 'couple' && booking.status === 'deposit_paid' && (
        <>
          <Button onClick={() => setCompleteConfirmOpen(true)} disabled={loading}>
            {loading ? 'Processing…' : 'Mark Complete'}
          </Button>
          <Button variant="outline" onClick={() => setDisputeOpen(true)} disabled={loading}>
            Report an Issue
          </Button>
        </>
      )}

      {role === 'couple' && booking.status === 'completed' && !hasReview && (
        <Button onClick={() => setReviewOpen(true)}>Leave Review</Button>
      )}

      {cancellable && (
        <Button variant="outline" onClick={() => setCancelOpen(true)} disabled={loading}>
          {role === 'vendor' && booking.status === 'pending' ? 'Decline' : 'Cancel'}
        </Button>
      )}

      {booking.status === 'disputed' && (
        <p className="text-sm text-amber-700">
          This booking is under review. Our team will contact both parties within 3 business days.
        </p>
      )}

      <ReviewForm
        bookingId={booking.id}
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        onSuccess={() => router.refresh()}
        vendorName={vendorName || undefined}
      />

      <DisputeDialog
        bookingId={booking.id}
        open={disputeOpen}
        onOpenChange={setDisputeOpen}
        onSuccess={() => router.refresh()}
      />

      <CancelDialog
        bookingId={booking.id}
        role={role}
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        onSuccess={() => router.refresh()}
        bookingContext={vendorName || undefined}
      />

      {role === 'couple' && booking.status === 'accepted' && totalPriceCents != null && (
        <DepositDialog
          bookingId={booking.id}
          quoteAmountCents={totalPriceCents}
          vendorName={vendorName}
          open={depositOpen}
          onOpenChange={setDepositOpen}
        />
      )}

      {/* CounterModal — used for `accepted` status. `adjusted_quote_sent` status
          counter is owned by AdjustmentReview which renders its own CounterModal. */}
      {role === 'couple' && booking.status === 'accepted' && totalPriceCents != null && (
        <CounterModal
          open={counterOpen}
          onClose={() => setCounterOpen(false)}
          bookingId={booking.id}
          currentTotalCents={totalPriceCents}
          onSuccess={() => router.refresh()}
        />
      )}

      {/* High-stakes confirmation: releases held funds to the vendor and is
          irreversible. Requires the typed word COMPLETE before enabling. */}
      <ConfirmDialog
        open={completeConfirmOpen}
        onOpenChange={setCompleteConfirmOpen}
        title="Mark Booking Complete?"
        description="This releases the held balance to the vendor. You can't undo this."
        confirmLabel="Mark Complete & Release Funds"
        typedConfirm="COMPLETE"
        busy={loading}
        onConfirm={handleComplete}
      />
    </div>
  );
}
