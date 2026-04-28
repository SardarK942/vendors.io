'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import type { Database } from '@/types/database.types';
import { ReviewForm } from '@/components/dashboard/ReviewForm';
import { DisputeDialog } from '@/components/dashboard/DisputeDialog';
import { CancelDialog } from '@/components/dashboard/CancelDialog';
import { DepositDialog } from '@/components/dashboard/DepositDialog';

type BookingRow = Database['public']['Tables']['booking_requests']['Row'];

interface BookingActionsProps {
  booking: BookingRow;
  role: 'couple' | 'vendor';
  hasReview?: boolean;
  vendorName?: string;
}

export function BookingActions({
  booking,
  role,
  hasReview = false,
  vendorName = '',
}: BookingActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [depositOpen, setDepositOpen] = useState(false);

  const cancellable = ['pending', 'quoted', 'deposit_paid'].includes(booking.status);
  const eventPast = new Date(booking.event_date) <= new Date();

  const handleComplete = async () => {
    if (
      !window.confirm('Mark this booking as complete? This releases the deposit to the vendor.')
    ) {
      return;
    }
    setLoading(true);
    const res = await fetch(`/api/bookings/${booking.id}/complete`, { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.error || 'Failed to complete');
      setLoading(false);
      return;
    }
    toast.success('Booking marked complete.');
    router.refresh();
  };

  return (
    <div className="flex flex-wrap gap-2 pt-2">
      {role === 'couple' && booking.status === 'quoted' && (
        <Button onClick={() => setDepositOpen(true)} disabled={loading}>
          Pay Hold Deposit
        </Button>
      )}

      {role === 'couple' && booking.status === 'deposit_paid' && eventPast && (
        <>
          <Button onClick={handleComplete} disabled={loading}>
            {loading ? 'Processing...' : 'Mark Complete'}
          </Button>
          <Button variant="outline" onClick={() => setDisputeOpen(true)} disabled={loading}>
            Report an issue
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
          This booking is under review. Our team will contact both parties within 3 business days.
        </p>
      )}

      <ReviewForm
        bookingId={booking.id}
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        onSuccess={() => router.refresh()}
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
      />

      {booking.vendor_quote_amount != null && (
        <DepositDialog
          bookingId={booking.id}
          quoteAmountCents={booking.vendor_quote_amount}
          vendorName={vendorName}
          open={depositOpen}
          onOpenChange={setDepositOpen}
        />
      )}
    </div>
  );
}
