import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users } from 'lucide-react';
import Link from 'next/link';
import type { Database } from '@/types/database.types';

type BookingRow = Database['public']['Tables']['bookings']['Row'];

interface BookingCardProps {
  booking: BookingRow & {
    vendor_profiles?: { business_name: string; slug: string; category: string } | null;
  };
  role: 'couple' | 'vendor';
  bookingEvents?: Array<{
    event_type_label: string;
    guest_count_override: number | null;
  }>;
}

function GuestCountBadge({
  events,
}: {
  events: { event_type_label: string; guest_count_override: number | null }[];
}) {
  if (events.length === 1) {
    const count = events[0].guest_count_override ?? 0;
    return <span className="text-xs text-ink/70">{count} guests</span>;
  }
  const total = events.reduce((sum, e) => sum + (e.guest_count_override ?? 0), 0);
  return (
    <span className="text-xs text-ink/70">
      {total} guests across {events.length} events
    </span>
  );
}

const STATUS_COLORS: Record<string, string> = {
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

export function BookingCard({ booking, role, bookingEvents }: BookingCardProps) {
  const vendorName = booking.vendor_profiles?.business_name || 'Unknown Vendor';
  const packageName = (booking as unknown as Record<string, string | null>).package_name_snapshot;

  return (
    <Link href={`/dashboard/bookings/${booking.id}`}>
      <Card className="transition-shadow hover:shadow-md">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base font-medium">
            {role === 'couple' ? vendorName : `Request #${booking.id.slice(0, 8)}`}
          </CardTitle>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[booking.status] || 'bg-gray-100'}`}
          >
            {booking.status.replace(/_/g, ' ')}
          </span>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            {packageName && (
              <Badge variant="outline" className="text-xs">
                {packageName}
              </Badge>
            )}
            {bookingEvents && bookingEvents.length > 0 ? (
              <span className="flex items-center gap-1">
                <Users className="h-4 w-4" aria-hidden="true" />
                <GuestCountBadge events={bookingEvents} />
              </span>
            ) : booking.guest_count ? (
              <span className="flex items-center gap-1">
                <Users className="h-4 w-4" aria-hidden="true" />
                {booking.guest_count} guests
              </span>
            ) : null}
          </div>

          {/* Show contact info only when revealed */}
          {role === 'vendor' && booking.couple_contact_revealed && (
            <div className="rounded bg-green-50 p-2 text-sm">
              {booking.couple_contact_phone && <p>Phone: {booking.couple_contact_phone}</p>}
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
