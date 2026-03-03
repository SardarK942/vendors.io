import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getBookingRequests } from '@/services/booking.service';
import { BookingCard } from '@/components/dashboard/BookingCard';

export default async function BookingsPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single();

  const role = (profile?.role as 'couple' | 'vendor') || 'couple';
  const result = await getBookingRequests(supabase, user.id, role);
  const bookings = result.data ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Bookings</h1>
        <p className="text-muted-foreground">
          {role === 'couple'
            ? 'Your booking requests and their status.'
            : 'Booking requests from couples.'}
        </p>
      </div>

      {bookings.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-lg font-medium text-muted-foreground">No bookings yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {role === 'couple'
              ? 'Browse vendors and submit a booking request to get started.'
              : 'Booking requests from couples will appear here.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {bookings.map((booking) => (
            <BookingCard key={booking.id} booking={booking} role={role} />
          ))}
        </div>
      )}
    </div>
  );
}
