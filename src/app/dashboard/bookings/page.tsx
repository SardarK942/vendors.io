import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { PageTitle } from '@/components/dashboard/PageTitle';
import { getBookingRequests } from '@/services/booking.service';
import { BookingCard } from '@/components/dashboard/BookingCard';
import { BookingStatusTabs } from '@/components/dashboard/bookings/BookingStatusTabs';
import type { BookingRowData } from '@/components/dashboard/bookings/BookingRow';

export const dynamic = 'force-dynamic';

export default async function BookingsPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single();
  const role = (profile?.role as 'couple' | 'vendor') || 'couple';

  // Couple branch — keep the existing simple flat list (out of scope for E).
  if (role === 'couple') {
    const result = await getBookingRequests(supabase, user.id, 'couple');
    const bookings = result.data ?? [];

    return (
      <div className="space-y-6">
        <div>
          <PageTitle>Bookings</PageTitle>
          <p className="text-muted-foreground">Your booking requests and their status.</p>
        </div>

        {bookings.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-lg font-medium text-muted-foreground">No bookings yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Browse vendors and submit a booking request to get started.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {bookings.map((booking) => (
              <BookingCard key={booking.id} booking={booking} role="couple" />
            ))}
          </div>
        )}
      </div>
    );
  }

  // Vendor view — incoming bookings from couples. Fetch the full list and let the
  // client component own tab / Action-Required filtering (folds BookingsArchive).
  const result = await getBookingRequests(supabase, user.id, 'vendor', { limit: 100 });
  const rows = (result.data ?? []) as BookingRowData[];

  return (
    <div className="space-y-6">
      <BookingStatusTabs rows={rows} />
    </div>
  );
}
