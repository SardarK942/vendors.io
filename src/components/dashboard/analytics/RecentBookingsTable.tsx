import * as React from 'react';
import { SectionCard, SectionHeading } from '@/components/dashboard/kit';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatPrice } from '@/lib/utils';
import { fmtDate } from '@/lib/intl';
import type { Database } from '@/types/database.types';

type BookingRow = Database['public']['Tables']['bookings']['Row'];

// Friendly status labels for the pill. All statuses render in a single neutral
// indigo pill (bg-indigo/10 text-indigo) to stay inside the locked palette —
// the app's green/yellow status colors are not part of the locked token set.
const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  accepted: 'Accepted',
  adjusted_quote_sent: 'Quote sent',
  adjusted_quote_declined: 'Action needed',
  deposit_paid: 'Confirmed',
  completed: 'Completed',
  expired: 'Expired',
  disputed: 'Disputed',
  couple_cancelled: 'Cancelled',
  vendor_cancelled: 'Cancelled',
  cancelled_mutual: 'Cancelled',
};

export function RecentBookingsTable({ bookings }: { bookings: BookingRow[] }) {
  return (
    <SectionCard>
      <SectionHeading
        title="Recent Bookings"
        actionLabel="View all"
        actionHref="/dashboard/bookings"
      />
      <div className="mt-4">
        {bookings.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-soft">No bookings yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Service</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead className="text-right">Value</TableHead>
                <TableHead className="text-right">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bookings.map((b) => {
                const service =
                  b.event_type?.trim() || b.package_name_snapshot?.trim() || 'Booking request';
                const customer = b.couple_full_name?.trim() || 'Unnamed couple';
                const label = STATUS_LABELS[b.status] ?? b.status.replace(/_/g, ' ');
                return (
                  <TableRow key={b.id}>
                    <TableCell className="whitespace-nowrap text-ink">
                      {fmtDate(b.created_at)}
                    </TableCell>
                    <TableCell className="text-ink">{service}</TableCell>
                    <TableCell className="text-ink">{customer}</TableCell>
                    <TableCell className="text-right font-medium text-ink">
                      {formatPrice(b.total_price_cents)}
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="inline-flex items-center rounded-full bg-indigo/10 px-2.5 py-1 text-xs font-medium text-indigo">
                        {label}
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </SectionCard>
  );
}
