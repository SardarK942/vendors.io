'use client';
import { useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { track } from '@/lib/analytics/track';
import { ANALYTICS_EVENTS } from '@/lib/analytics/events';

interface DepositSuccessTrackerProps {
  bookingId: string;
}

/**
 * Fires `deposit_completed` when the browser lands back on the booking detail
 * page after a successful Stripe Checkout session — the deposit checkout's
 * `success_url` (src/services/payment.service.ts) redirects to
 * `/dashboard/bookings/<bookingId>?payment=success`. This is the actual
 * payment-success moment, as opposed to `deposit_started` (fired at checkout
 * session creation in DepositDialog).
 */
export function DepositSuccessTracker({ bookingId }: DepositSuccessTrackerProps) {
  const searchParams = useSearchParams();
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    if (searchParams.get('payment') !== 'success') return;
    fired.current = true;
    track(ANALYTICS_EVENTS.DEPOSIT_COMPLETED, { bookingId });
  }, [searchParams, bookingId]);

  return null;
}
