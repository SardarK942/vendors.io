import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatPrice, EVENT_TYPE_LABELS } from '@/lib/utils';
import { Calendar, Users } from 'lucide-react';
import Link from 'next/link';
import type { Database } from '@/types/database.types';

type BookingRow = Database['public']['Tables']['booking_requests']['Row'];

interface BookingCardProps {
  booking: BookingRow & {
    vendor_profiles?: { business_name: string; slug: string; category: string } | null;
  };
  role: 'couple' | 'vendor';
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  quoted: 'bg-blue-100 text-blue-800',
  deposit_paid: 'bg-green-100 text-green-800',
  confirmed: 'bg-emerald-100 text-emerald-800',
  expired: 'bg-gray-100 text-gray-800',
  declined: 'bg-red-100 text-red-800',
  cancelled: 'bg-gray-100 text-gray-800',
};

export function BookingCard({ booking, role }: BookingCardProps) {
  const vendorName = booking.vendor_profiles?.business_name || 'Unknown Vendor';

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
            {booking.status.replace('_', ' ')}
          </span>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              {new Date(booking.event_date).toLocaleDateString()}
            </span>
            <Badge variant="outline" className="text-xs">
              {EVENT_TYPE_LABELS[booking.event_type] || booking.event_type}
            </Badge>
            {booking.guest_count && (
              <span className="flex items-center gap-1">
                <Users className="h-4 w-4" />
                {booking.guest_count} guests
              </span>
            )}
          </div>

          {booking.vendor_quote_amount && (
            <p className="text-sm font-medium">Quote: {formatPrice(booking.vendor_quote_amount)}</p>
          )}

          {/* Show contact info only when revealed */}
          {role === 'vendor' && booking.couple_contact_revealed && (
            <div className="rounded bg-green-50 p-2 text-sm">
              <p>Phone: {booking.couple_phone}</p>
              <p>Email: {booking.couple_email}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
