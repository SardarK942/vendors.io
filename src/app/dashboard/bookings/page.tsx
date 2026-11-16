import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { PageTitle } from '@/components/dashboard/PageTitle';
import { getBookingRequests } from '@/services/booking.service';
import { BookingStatusTabs } from '@/components/dashboard/bookings/BookingStatusTabs';
import { BookingRow, type BookingRowData } from '@/components/dashboard/bookings/BookingRow';

export const dynamic = 'force-dynamic';

export default async function BookingsPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single();
  const role = (profile?.role as 'couple' | 'vendor') || 'couple';

  // Couple branch — redesigned: the booking requests as restyled rows, split
  // into Active and Past so the live requests stay at the top.
  if (role === 'couple') {
    const result = await getBookingRequests(supabase, user.id, 'couple');
    const bookings = (result.data ?? []) as BookingRowData[];

    const PAST_STATUSES = new Set([
      'completed',
      'expired',
      'couple_cancelled',
      'vendor_cancelled',
      'cancelled_mutual',
      'disputed',
      'adjusted_quote_declined',
    ]);
    // Statuses where the ball is in the couple's court: pay the deposit on an
    // accepted quote, or review a vendor's adjusted quote.
    const COUPLE_ACTION_STATUSES = new Set(['accepted', 'adjusted_quote_sent']);
    const active = bookings.filter((b) => !PAST_STATUSES.has(b.status));
    const past = bookings.filter((b) => PAST_STATUSES.has(b.status));

    return (
      <div className="space-y-6">
        <div>
          <PageTitle>Bookings</PageTitle>
          <p className="text-ink-soft">Your booking requests and their status.</p>
        </div>

        {bookings.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-hairline bg-cream-soft/40 py-16 text-center">
            <p className="font-display text-xl text-ink">No bookings yet</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-ink-soft">
              Browse vendors and submit a booking request to get started.
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {active.length > 0 && (
              <section className="space-y-3">
                <h2 className="font-mono text-[10px] font-bold uppercase tracking-widest text-indigo">
                  Active · {active.length}
                </h2>
                <div className="space-y-3">
                  {active.map((booking) => (
                    <BookingRow
                      key={booking.id}
                      booking={booking}
                      perspective="couple"
                      needsAction={COUPLE_ACTION_STATUSES.has(booking.status)}
                    />
                  ))}
                </div>
              </section>
            )}
            {past.length > 0 && (
              <section className="space-y-3">
                <h2 className="font-mono text-[10px] font-bold uppercase tracking-widest text-ink-soft">
                  Past · {past.length}
                </h2>
                <div className="space-y-3 opacity-80">
                  {past.map((booking) => (
                    <BookingRow key={booking.id} booking={booking} perspective="couple" />
                  ))}
                </div>
              </section>
            )}
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
