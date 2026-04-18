'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import type { Database } from '@/types/database.types';
import { ReviewForm } from '@/components/dashboard/ReviewForm';

type BookingRow = Database['public']['Tables']['booking_requests']['Row'];

interface BookingActionsProps {
  booking: BookingRow;
  role: 'couple' | 'vendor';
  hasReview?: boolean;
}

export function BookingActions({ booking, role, hasReview = false }: BookingActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);

  const cancellable = ['pending', 'quoted', 'deposit_paid'].includes(booking.status);

  const handleCancel = async () => {
    const reason = window.prompt('Reason for cancelling? (optional)') ?? undefined;
    setLoading(true);
    const res = await fetch(`/api/bookings/${booking.id}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reason ? { reason } : {}),
    });

    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error || 'Cancel failed');
      setLoading(false);
      return;
    }

    const refund = data.data?.refundedCents;
    toast.success(
      refund && refund > 0
        ? `Cancelled. Refund of $${(refund / 100).toFixed(2)} issued.`
        : 'Cancelled.'
    );
    router.refresh();
  };

  const handlePayDeposit = async () => {
    setLoading(true);
    const res = await fetch(`/api/bookings/${booking.id}/deposit`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error || 'Failed to create checkout');
      setLoading(false);
      return;
    }
    if (data.data?.checkoutUrl) {
      window.location.href = data.data.checkoutUrl;
    }
  };

  const handleComplete = async () => {
    if (
      !window.confirm('Mark this booking as complete? This releases the deposit to the vendor.')
    ) {
      return;
    }
    setLoading(true);
    const res = await fetch(`/api/bookings/${booking.id}/complete`, { method: 'POST' });
    const data = await res.json();
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
        <Button onClick={handlePayDeposit} disabled={loading}>
          {loading ? 'Processing...' : 'Pay Hold Deposit'}
        </Button>
      )}

      {role === 'couple' && booking.status === 'deposit_paid' && (
        <Button onClick={handleComplete} disabled={loading}>
          {loading ? 'Processing...' : 'Mark Complete'}
        </Button>
      )}

      {role === 'couple' && booking.status === 'completed' && !hasReview && (
        <Button onClick={() => setReviewOpen(true)}>Leave Review</Button>
      )}

      {cancellable && (
        <Button variant="outline" onClick={handleCancel} disabled={loading}>
          {role === 'vendor' && booking.status === 'pending' ? 'Decline' : 'Cancel'}
        </Button>
      )}

      <ReviewForm
        bookingId={booking.id}
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        onSuccess={() => router.refresh()}
      />
    </div>
  );
}
