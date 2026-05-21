import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getBookingRequests } from '@/services/booking.service';
import { BookingCard } from '@/components/dashboard/BookingCard';
import { VendorBookingActions } from '@/components/booking/VendorBookingActions';
import { BookingsArchive } from '@/components/dashboard/BookingsArchive';
import { getActiveVendorProfile } from '@/lib/vendor/active';
import type { Database } from '@/types/database.types';

type BookingStatus = Database['public']['Tables']['bookings']['Row']['status'];
type TabKey = 'all' | 'active' | 'upcoming' | 'past' | 'cancelled';

const TAB_STATUSES: Record<TabKey, BookingStatus[] | undefined> = {
  all: undefined,
  active: ['pending', 'accepted', 'adjusted_quote_sent', 'adjusted_quote_declined', 'deposit_paid'],
  upcoming: ['deposit_paid'],
  past: ['completed'],
  cancelled: ['couple_cancelled', 'vendor_cancelled', 'cancelled_mutual', 'expired'],
};

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ tab?: TabKey }>;
}

export default async function BookingsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const tab: TabKey = (sp.tab as TabKey) ?? 'all';

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
          <h1 className="text-2xl font-bold">Bookings</h1>
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

  // Vendor archive — tabs + counts + cursor pagination
  const status = TAB_STATUSES[tab];
  const result = await getBookingRequests(supabase, user.id, 'vendor', { status, limit: 25 });

  // Per-tab counts via head:true queries (5 round-trips; each is a single COUNT).
  // Sub-project I §5: resolve the active vendor profile.
  const { profile: vendorProfile } = await getActiveVendorProfile(supabase, user.id);

  const counts: Record<TabKey, number> = {
    all: 0,
    active: 0,
    upcoming: 0,
    past: 0,
    cancelled: 0,
  };

  if (vendorProfile) {
    const [allRes, activeRes, upcomingRes, pastRes, cancelledRes] = await Promise.all([
      supabase
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .eq('vendor_profile_id', vendorProfile.id),
      supabase
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .eq('vendor_profile_id', vendorProfile.id)
        .in('status', TAB_STATUSES.active!),
      supabase
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .eq('vendor_profile_id', vendorProfile.id)
        .in('status', TAB_STATUSES.upcoming!),
      supabase
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .eq('vendor_profile_id', vendorProfile.id)
        .in('status', TAB_STATUSES.past!),
      supabase
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .eq('vendor_profile_id', vendorProfile.id)
        .in('status', TAB_STATUSES.cancelled!),
    ]);
    counts.all = allRes.count ?? 0;
    counts.active = activeRes.count ?? 0;
    counts.upcoming = upcomingRes.count ?? 0;
    counts.past = pastRes.count ?? 0;
    counts.cancelled = cancelledRes.count ?? 0;
  }

  // Render actionable accept/adjust CTAs above the archive when the active tab
  // surfaces pending or adjusted_quote_declined rows (mirrors today's behavior;
  // detail/panel actions still work).
  const actionableRows = (result.data ?? []).filter(
    (b) => b.status === 'pending' || b.status === 'adjusted_quote_declined'
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Bookings</h1>
        <p className="text-muted-foreground">All bookings, filterable.</p>
      </div>

      {actionableRows.length > 0 && tab === 'all' && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Quick actions
          </h2>
          {actionableRows.map((b) => (
            <VendorBookingActions
              key={`actions-${b.id}`}
              bookingId={b.id}
              status={b.status}
              totalPriceCents={
                ((b as unknown as Record<string, unknown>).total_price_cents as number) ?? 0
              }
            />
          ))}
        </div>
      )}

      <BookingsArchive
        initialRows={result.data ?? []}
        initialNextCursor={result.nextCursor ?? null}
        counts={counts}
        activeTab={tab}
      />
    </div>
  );
}
