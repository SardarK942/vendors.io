import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { PageTitle } from '@/components/dashboard/PageTitle';
import { Button } from '@/components/ui/button';
import { StatCard, SectionCard } from '@/components/dashboard/kit';
import { getActiveVendorProfile } from '@/lib/vendor/active';
import { getVendorAttribution } from '@/services/payment.attribution';
import { getBookingRequests } from '@/services/booking.service';
import { formatPrice } from '@/lib/utils';
import { fmtDate } from '@/lib/intl';
import { RevenueDonut } from '@/components/dashboard/analytics/RevenueDonut';
import { BookingTrendsChart } from '@/components/dashboard/analytics/BookingTrendsChart';
import { GrowBusinessCard } from '@/components/dashboard/analytics/GrowBusinessCard';
import { RecentBookingsTable } from '@/components/dashboard/analytics/RecentBookingsTable';
import { CalendarDays, DollarSign, Percent, Wallet, Download, ChevronDown } from 'lucide-react';

export const dynamic = 'force-dynamic';

const TREND_DAYS = 30;

export default async function MoneyPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (profile?.role !== 'vendor') redirect('/dashboard');

  // Sub-project I §5: per-business analytics page.
  const { profile: vendorProfile } = await getActiveVendorProfile(supabase, user.id);
  if (!vendorProfile) redirect('/dashboard/profile/setup');

  const [totalBookings, attributionRaw, bookingsResult] = await Promise.all([
    supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('vendor_profile_id', vendorProfile.id),
    // getVendorAttribution throws on DB error — degrade to zeros rather than crash.
    getVendorAttribution(supabase, vendorProfile.id, 'all').catch(() => null),
    getBookingRequests(supabase, user.id, 'vendor', { limit: 100, sort: 'created_at' }),
  ]);

  const totalBookingsCount = totalBookings.count ?? 0;
  const attribution = attributionRaw ?? {
    totalCents: 0,
    bookingCount: 0,
    platformFeeCents: 0,
    netCents: 0,
    roiMultiple: 0,
  };
  const platformFeeCents =
    attribution.platformFeeCents ?? attribution.totalCents - attribution.netCents;

  const bookings = bookingsResult.data ?? [];
  const recentBookings = bookings.slice(0, 6);

  // Real daily trend: bucket this vendor's bookings by created_at over the last
  // TREND_DAYS days (index 0 = oldest day, last index = today).
  const dayCounts = new Array<number>(TREND_DAYS).fill(0);
  const dayLabels: string[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const windowStart = new Date(today);
  windowStart.setDate(windowStart.getDate() - (TREND_DAYS - 1));

  for (let i = 0; i < TREND_DAYS; i++) {
    const d = new Date(windowStart);
    d.setDate(d.getDate() + i);
    dayLabels.push(fmtDate(d, { month: 'short', day: 'numeric' }));
  }
  for (const b of bookings) {
    const created = new Date(b.created_at);
    created.setHours(0, 0, 0, 0);
    const diffDays = Math.floor((created.getTime() - windowStart.getTime()) / 86_400_000);
    if (diffDays >= 0 && diffDays < TREND_DAYS) dayCounts[diffDays] += 1;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <PageTitle subtitle="Track your bookings, earnings and performance — all in one place.">
          Business Analytics
        </PageTitle>
        <div className="flex items-center gap-2">
          {/* STUB: inert date-range chip — no period filtering wired yet. */}
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-full border border-hairline bg-white px-3.5 py-2 text-sm text-ink-muted"
          >
            Last 30 days
            <ChevronDown className="size-4" aria-hidden="true" />
          </button>
          {/* STUB: inert — report export not implemented. */}
          <Button variant="secondary" iconTrailing={<Download className="size-4" />}>
            {/* TODO(backend): export report */}
            Download Report
          </Button>
        </div>
      </div>

      {/* Stat cards. STUB: period deltas + sparklines omitted. */}
      {/* TODO(backend): period deltas + sparklines */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard
          icon={CalendarDays}
          value={totalBookingsCount}
          label="Total Bookings"
          detail="All time"
        />
        <StatCard
          icon={DollarSign}
          value={formatPrice(attribution.totalCents)}
          label="Booking Value"
          detail="All time"
        />
        <StatCard
          icon={Percent}
          value={formatPrice(platformFeeCents)}
          label="Platform Fees"
          detail="5% of bookings"
        />
        <StatCard
          icon={Wallet}
          value={formatPrice(attribution.netCents)}
          label="Net Earnings"
          detail="Your payout"
        />
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <SectionCard className="lg:col-span-2">
          <BookingTrendsChart bookings={dayCounts} labels={dayLabels} />
        </SectionCard>

        <div className="flex flex-col gap-6">
          <SectionCard>
            <h2 className="mb-4 font-display text-lg text-ink">Revenue Breakdown</h2>
            <RevenueDonut
              totalCents={attribution.totalCents}
              platformFeeCents={platformFeeCents}
              netCents={attribution.netCents}
            />
          </SectionCard>
          <GrowBusinessCard />
        </div>
      </div>

      {/* Recent bookings */}
      <RecentBookingsTable bookings={recentBookings} />
    </div>
  );
}
