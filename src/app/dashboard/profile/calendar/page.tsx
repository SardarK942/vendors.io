import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { PageTitle } from '@/components/dashboard/PageTitle';
import { Button } from '@/components/ui/button';
import { CalendarHoldsList } from '@/components/dashboard/CalendarHoldsList';
import { BlockDateForm } from '@/components/dashboard/BlockDateForm';
import { ExternalCalendarSyncCard } from '@/components/dashboard/calendar/ExternalCalendarSyncCard';
import {
  CalendarMonthGrid,
  type CalendarDayEvent,
} from '@/components/dashboard/calendar/CalendarMonthGrid';
import { AvailabilityPanel } from '@/components/dashboard/calendar/AvailabilityPanel';
import { UpcomingBookingsRail } from '@/components/dashboard/calendar/UpcomingBookingsRail';
import { StatCard, SectionHeading } from '@/components/dashboard/kit';
import { getActiveVendorProfile } from '@/lib/vendor/active';
import { getFeedStatus } from '@/services/calendar-feed.service';
import { getOperationsBuckets } from '@/services/booking.service';
import { getVendorAttribution } from '@/services/payment.attribution';
import { formatPrice } from '@/lib/utils';
import { fmtDate } from '@/lib/intl';
import { CalendarDays, CircleCheck, Users, Wallet, CalendarPlus, RefreshCw } from 'lucide-react';

export const dynamic = 'force-dynamic';

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export default async function CalendarPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Sub-project I §5: per-business calendar.
  const { profile: vendor } = await getActiveVendorProfile(supabase, user.id);
  if (!vendor) redirect('/dashboard/profile/setup');
  if (!vendor.onboarding_complete) redirect('/dashboard/profile/setup');

  // Current month frame (server-computed so the grid is deterministic — no
  // client/server hydration drift on "today").
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const monthLabel = fmtDate(now, { month: 'long', year: 'numeric' });
  const todayISO = `${year}-${pad(month + 1)}-${pad(now.getDate())}`;
  const monthStartISO = new Date(year, month, 1).toISOString();

  const feedStatus = await getFeedStatus(
    supabase,
    vendor.id,
    process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  );

  // Fetch all holds ordered by range; feeds both the month grid and the holds list.
  const [{ data: rawHolds }, totalThisMonth, confirmedThisMonth, buckets, attribution] =
    await Promise.all([
      supabase
        .from('vendor_calendar_holds')
        .select(
          'id, hold_type, hold_range, booking_event_id, booking_events(event_type_label, bookings(couple_full_name))'
        )
        .eq('vendor_profile_id', vendor.id)
        .order('hold_range'),
      // Bookings created this month.
      supabase
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .eq('vendor_profile_id', vendor.id)
        .gte('created_at', monthStartISO),
      // Confirmed (deposit paid / completed) bookings created this month.
      supabase
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .eq('vendor_profile_id', vendor.id)
        .in('status', ['deposit_paid', 'completed'])
        .gte('created_at', monthStartISO),
      getOperationsBuckets(supabase, vendor.id),
      // Lifetime net earnings — degrade to null (→ $0.00) rather than crash.
      getVendorAttribution(supabase, vendor.id, 'all').catch(() => null),
    ]);

  // Normalise the nested hold shape to what CalendarHoldsList expects.
  type RawHold = {
    id: string;
    hold_type: string;
    hold_range: string;
    booking_event_id: string | null;
    booking_events: {
      event_type_label: string;
      bookings: { couple_full_name: string | null } | { couple_full_name: string | null }[] | null;
    } | null;
  };

  const holds = (rawHolds ?? []).map((h: RawHold) => {
    const be = h.booking_events;
    let bookingEventsNorm: {
      event_type_label: string;
      bookings: { couple_full_name: string | null };
    } | null = null;
    if (be) {
      const b = Array.isArray(be.bookings) ? (be.bookings[0] ?? null) : be.bookings;
      bookingEventsNorm = {
        event_type_label: be.event_type_label,
        bookings: { couple_full_name: b?.couple_full_name ?? null },
      };
    }
    return {
      id: h.id,
      hold_type: h.hold_type as 'booking' | 'vendor_blocked',
      hold_range: h.hold_range,
      booking_event_id: h.booking_event_id,
      booking_events: bookingEventsNorm,
    };
  });

  // Aggregate holds into per-day grid markers (start date + type). Mirrors the
  // date slicing in CalendarHoldsList for consistency.
  const calendarEvents: CalendarDayEvent[] = holds
    .map((h) => {
      const m = h.hold_range.match(/^\["([^"]+)",/);
      return m ? { date: m[1].slice(0, 10), type: h.hold_type } : null;
    })
    .filter((e): e is CalendarDayEvent => e !== null);

  const upcomingEvents = [
    ...buckets.today,
    ...buckets.tomorrow,
    ...buckets.thisWeek,
    ...buckets.later,
  ].slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageTitle subtitle="Manage your availability and concurrent capacity.">Calendar</PageTitle>
        <div className="flex items-center gap-2">
          {/* Sync Calendar scrolls to the sync card (functional anchor). */}
          <Button
            asChild
            variant="secondary"
            size="sm"
            iconLeading={<RefreshCw className="size-4" aria-hidden="true" />}
            // Pulse until the vendor connects their external calendar feed.
            className={feedStatus.state !== 'connected' ? 'pulse-pink-loop' : undefined}
          >
            <a href="#calendar-sync">Sync Calendar</a>
          </Button>
          <Button
            asChild
            size="sm"
            iconLeading={<CalendarPlus className="size-4" aria-hidden="true" />}
          >
            <a href="#block-a-date">Block a Date</a>
          </Button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {/* TODO(backend): trend sparklines */}
        <StatCard
          icon={CalendarDays}
          value={totalThisMonth.count ?? 0}
          label="Total Bookings"
          detail="This month"
        />
        <StatCard
          icon={CircleCheck}
          value={confirmedThisMonth.count ?? 0}
          label="Confirmed Bookings"
          detail="This month"
        />
        <StatCard
          icon={Users}
          value={vendor.concurrent_capacity}
          label="Concurrent Capacity"
          detail="Events at once"
        />
        <StatCard
          icon={Wallet}
          value={formatPrice(attribution?.netCents ?? 0)}
          label="Total Revenue"
          detail="Lifetime"
        />
      </div>

      {/* Main grid + right rail */}
      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-6">
          <CalendarMonthGrid
            year={year}
            month={month}
            monthLabel={monthLabel}
            todayISO={todayISO}
            events={calendarEvents}
          />

          <div
            id="block-a-date"
            className="scroll-mt-24 rounded-2xl border border-hairline bg-white p-5"
          >
            <SectionHeading icon={CalendarPlus} title="Block a date" />
            <div className="mt-2">
              <BlockDateForm />
            </div>
            <div className="mt-4 border-t border-hairline pt-4">
              <CalendarHoldsList holds={holds} />
            </div>
          </div>
        </div>

        <div className="flex w-full shrink-0 flex-col gap-6 lg:w-[340px]">
          <div id="calendar-sync" className="scroll-mt-24">
            <ExternalCalendarSyncCard initialStatus={feedStatus} />
          </div>
          <AvailabilityPanel capacity={vendor.concurrent_capacity} />
          <UpcomingBookingsRail events={upcomingEvents} />
        </div>
      </div>
    </div>
  );
}
