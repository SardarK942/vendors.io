import * as React from 'react';
import { CalendarDays } from 'lucide-react';
import { EmptyState } from '@/components/dashboard/kit';

/**
 * Empty state for the vendor Bookings list. Reconciled to the vendor side:
 * incoming bookings come FROM couples, so there is no "Browse Vendors" CTA.
 */
export function BookingsEmptyState() {
  return (
    <EmptyState
      icon={CalendarDays}
      title="No bookings yet"
      description="Bookings from couples will appear here."
    />
  );
}
