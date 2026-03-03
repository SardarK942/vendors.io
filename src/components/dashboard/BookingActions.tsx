'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import type { Database } from '@/types/database.types';

type BookingRow = Database['public']['Tables']['booking_requests']['Row'];

interface BookingActionsProps {
  booking: BookingRow;
  role: 'couple' | 'vendor';
}

export function BookingActions({ booking, role }: BookingActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleCancel = async (status: 'cancelled' | 'declined') => {
    setLoading(true);
    const res = await fetch(`/api/bookings/${booking.id}/cancel`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });

    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error || 'Action failed');
      setLoading(false);
      return;
    }

    toast.success(status === 'cancelled' ? 'Booking cancelled' : 'Request declined');
    router.refresh();
  };

  const handlePayDeposit = async () => {
    setLoading(true);
    const res = await fetch(`/api/bookings/${booking.id}/deposit`, {
      method: 'POST',
    });

    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error || 'Failed to create checkout');
      setLoading(false);
      return;
    }

    // Redirect to Stripe Checkout
    if (data.data?.checkoutUrl) {
      window.location.href = data.data.checkoutUrl;
    }
  };

  const handleConfirm = async () => {
    setLoading(true);
    const res = await fetch(`/api/bookings/${booking.id}/cancel`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'confirmed' }),
    });

    // Note: confirm uses a different path in real implementation.
    // For now, reuse the cancel endpoint with the confirmed status.
    // This will be properly handled through the state machine.
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error || 'Failed to confirm');
      setLoading(false);
      return;
    }

    toast.success('Booking confirmed!');
    router.refresh();
  };

  return (
    <div className="flex flex-wrap gap-2 pt-2">
      {/* Couple: Pay deposit when quoted */}
      {role === 'couple' && booking.status === 'quoted' && (
        <Button onClick={handlePayDeposit} disabled={loading}>
          {loading ? 'Processing...' : 'Pay Hold Deposit'}
        </Button>
      )}

      {/* Couple: Cancel when pending or quoted */}
      {role === 'couple' && ['pending', 'quoted'].includes(booking.status) && (
        <Button variant="outline" onClick={() => handleCancel('cancelled')} disabled={loading}>
          Cancel Request
        </Button>
      )}

      {/* Vendor: Decline when pending */}
      {role === 'vendor' && booking.status === 'pending' && (
        <Button variant="destructive" onClick={() => handleCancel('declined')} disabled={loading}>
          Decline
        </Button>
      )}

      {/* Vendor: Confirm when deposit_paid */}
      {role === 'vendor' && booking.status === 'deposit_paid' && (
        <Button onClick={handleConfirm} disabled={loading}>
          {loading ? 'Confirming...' : 'Confirm Booking'}
        </Button>
      )}
    </div>
  );
}
