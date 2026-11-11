import * as React from 'react';
import Link from 'next/link';
import { CalendarDays, ChevronRight, MapPin } from 'lucide-react';
import { cn, formatPrice } from '@/lib/utils';
import { fmtDate, fmtTime } from '@/lib/intl';
import type { Database } from '@/types/database.types';

export type BookingRowData = Database['public']['Tables']['bookings']['Row'] & {
  vendor_profiles?: { business_name: string; slug: string; category: string } | null;
};

// Status → pill color. Reused verbatim from BookingCard so the archive and the
// restyled list stay in lockstep (the app's existing status palette is the
// source of truth — no new greens invented here).
const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  accepted: 'bg-yellow-100 text-yellow-800',
  adjusted_quote_sent: 'bg-blue-100 text-blue-800',
  adjusted_quote_declined: 'bg-orange-100 text-orange-800',
  deposit_paid: 'bg-green-100 text-green-800',
  completed: 'bg-emerald-100 text-emerald-800',
  expired: 'bg-gray-100 text-gray-800',
  disputed: 'bg-amber-100 text-amber-800',
  couple_cancelled: 'bg-red-100 text-red-800',
  vendor_cancelled: 'bg-red-100 text-red-800',
  cancelled_mutual: 'bg-gray-100 text-gray-800',
};

// Friendlier labels for the same statuses (Figma shows "Confirmed"/"Pending"/
// "Cancelled"). Falls back to the raw status with underscores spaced.
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

function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? 'bg-gray-100 text-gray-800';
  const label = STATUS_LABELS[status] ?? status.replace(/_/g, ' ');
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium capitalize',
        style
      )}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      {label}
    </span>
  );
}

export function BookingRow({ booking }: { booking: BookingRowData }) {
  const customerName = booking.couple_full_name?.trim() || 'Unnamed couple';
  const eventType = booking.event_type?.trim() || 'Booking request';
  const city = booking.event_city?.trim() || booking.venue_name?.trim() || null;

  return (
    <Link
      href={`/dashboard/bookings/${booking.id}`}
      className="flex flex-wrap items-center gap-4 rounded-2xl border border-hairline bg-white p-4 transition-colors hover:border-indigo/40"
    >
      {/* Thumbnail — no portfolio image is loaded for the list, so fall back to
          a muted calendar glyph (see STUB LEDGER in the PR notes). */}
      <div className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-xl bg-cream-soft">
        <CalendarDays className="size-6 text-ink-soft/60" aria-hidden="true" />
      </div>

      {/* Main: customer name + event type + location */}
      <div className="min-w-0 flex-1 basis-48">
        <p className="truncate text-sm font-semibold text-ink">{customerName}</p>
        <p className="truncate text-xs text-ink-soft">{eventType}</p>
        {city ? (
          <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-ink-muted">
            <MapPin className="size-3 shrink-0" aria-hidden="true" />
            <span className="truncate">{city}</span>
          </p>
        ) : null}
      </div>

      {/* Date / time (booking placed) */}
      <div className="text-right">
        <p className="text-sm text-ink">{fmtDate(booking.created_at)}</p>
        <p className="text-xs text-ink-soft">{fmtTime(booking.created_at)}</p>
      </div>

      <StatusBadge status={booking.status} />

      {/* Total + id + chevron */}
      <div className="ml-auto flex items-center gap-3">
        <div className="text-right">
          <p className="text-sm font-semibold text-ink">{formatPrice(booking.total_price_cents)}</p>
          <p className="text-xs text-ink-soft">#{booking.id.slice(0, 8)}</p>
        </div>
        <ChevronRight className="size-4 shrink-0 text-ink-soft" aria-hidden="true" />
      </div>
    </Link>
  );
}
