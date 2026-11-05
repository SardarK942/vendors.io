import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PageTitle } from '@/components/dashboard/PageTitle';
import { EventCardGrid } from '@/components/dashboard/EventCardGrid';
import { type EventCardData } from '@/components/dashboard/EventCard';
import { getActiveVendorProfile } from '@/lib/vendor/active';
import { CustomerWelcomeBanner } from '@/components/dashboard/CustomerWelcomeBanner';
import { fmtDate } from '@/lib/intl';
import { formatPrice } from '@/lib/utils';
import { listEvents, getEventGraph } from '@/services/events.service';
import { computeRollups } from '@/lib/events/derive';
import { EventSummaryCard } from '@/components/events/EventSummaryCard';
import {
  StatCard,
  QuickActionList,
  QuickActionItem,
  SectionHeading,
  EmptyState,
} from '@/components/dashboard/kit';
import { WelcomeBanner } from '@/components/dashboard/home/WelcomeBanner';
import { PromoCard } from '@/components/dashboard/home/PromoCard';
import { UpcomingEventCard } from '@/components/dashboard/home/UpcomingEventCard';
import { SupportCard } from '@/components/dashboard/home/SupportCard';
import { getUnreadNotificationsCount } from '@/lib/dashboard/sidebar-counts';
import { getOperationsBuckets } from '@/services/booking.service';
import { getVendorAttribution } from '@/services/payment.attribution';
import {
  CalendarDays,
  BookOpenCheck,
  Wallet,
  Bell,
  Package,
  CalendarCheck,
  Calendar,
} from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('users').select('*').eq('id', user.id).single();

  const role = profile?.role || 'couple';

  // Couple branch — unchanged from Sub-project D (event card grid).
  if (role === 'couple') {
    // Fetch onboarding_data + dismiss flag for the welcome banner (Bucket J T20).
    const { data: coupleProfile } = await supabase
      .from('users')
      .select('onboarding_data, dashboard_welcome_dismissed_at')
      .eq('id', user.id)
      .single();

    const onboardingData = (coupleProfile?.onboarding_data ?? {}) as {
      event_date?: string | null;
      categories?: string[] | null;
      just_browsing?: boolean | null;
    };
    const showBanner =
      !coupleProfile?.dashboard_welcome_dismissed_at &&
      !onboardingData.just_browsing &&
      (onboardingData.event_date || (onboardingData.categories?.length ?? 0) > 0);

    const daysUntil = onboardingData.event_date
      ? Math.max(
          0,
          Math.ceil((new Date(onboardingData.event_date).getTime() - Date.now()) / 86_400_000)
        )
      : null;

    const formattedDate = onboardingData.event_date
      ? fmtDate(onboardingData.event_date, { month: 'long', day: 'numeric', year: 'numeric' })
      : null;

    // Read from booking_events_public (excludes vendor_notes — Sub-project E §8).
    const { data: rawEvents } = await supabase
      .from('booking_events_public')
      .select(
        `
        id,
        event_date,
        event_start_time,
        event_end_time,
        event_type_label,
        address_line_1,
        city,
        state,
        postal_code,
        bookings!inner(
          id,
          status,
          couple_user_id,
          vendor_profiles!inner(business_name, category, portfolio_images)
        )
      `
      )
      .eq('bookings.couple_user_id', user.id)
      .not(
        'bookings.status',
        'in',
        '("couple_cancelled","vendor_cancelled","cancelled_mutual","expired")'
      )
      .order('event_date');

    const events: EventCardData[] = (rawEvents ?? []).map((e: Record<string, unknown>) => {
      const b = e.bookings as Record<string, unknown>;
      const v = b.vendor_profiles as Record<string, unknown>;
      return {
        eventId: e.id as string,
        bookingId: b.id as string,
        eventTypeLabel: e.event_type_label as string,
        eventDate: e.event_date as string,
        eventStartTime: e.event_start_time as string,
        eventEndTime: e.event_end_time as string,
        addressLine1: e.address_line_1 as string,
        city: e.city as string,
        state: e.state as string,
        postalCode: e.postal_code as string,
        status: b.status as string,
        vendor: {
          businessName: v.business_name as string,
          category: v.category as string,
          portfolioImage: ((v.portfolio_images as string[] | null) ?? [])[0] ?? null,
        },
      };
    });

    // Sub-project customer-events: most recent event's journal graph, if any.
    // listEvents() orders by created_at desc, so [0] is the most recent.
    const coupleEvents = await listEvents(supabase, user.id);
    const latestEventGraph =
      coupleEvents.length > 0 ? await getEventGraph(supabase, user.id, coupleEvents[0].id) : null;
    const eventRollups = latestEventGraph ? computeRollups(latestEventGraph.needs) : null;

    return (
      <div className="space-y-6">
        {showBanner && (
          <CustomerWelcomeBanner
            eventDate={onboardingData.event_date ?? null}
            categories={onboardingData.categories ?? []}
            daysUntilEvent={daysUntil}
            formattedEventDate={formattedDate}
          />
        )}

        <div className="flex items-center justify-between">
          <div>
            <PageTitle>Home</PageTitle>
            <p className="text-muted-foreground">
              Welcome back, {profile?.full_name || user.email}
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href="/vendors">Browse Vendors →</Link>
          </Button>
        </div>

        {latestEventGraph && eventRollups ? (
          <EventSummaryCard
            event={latestEventGraph.event}
            functions={latestEventGraph.functions}
            needs={latestEventGraph.needs}
            tasks={latestEventGraph.tasks}
            committedCents={eventRollups.totalCommittedCents}
          />
        ) : (
          <div className="rounded-2xl border border-hairline bg-cream-soft/40 px-8 py-10 text-center">
            <p className="font-display text-2xl text-ink">Plan your celebration</p>
            <p className="mx-auto mt-2 max-w-sm text-sm text-ink-soft">
              Start a journal to track functions, vendors, budget, and tasks — all in one place.
            </p>
            <Button asChild variant="primary" className="mt-5">
              <Link href="/dashboard/events/new">Start planning →</Link>
            </Button>
          </div>
        )}

        <EventCardGrid events={events} />
      </div>
    );
  }

  // Vendor branch — Sub-project E: Inbox + Operations + Analytics teaser.
  // Sub-project I §5: use the active vendor profile resolver (falls back to the
  // user's only profile when active_vendor_profile_id is null — zero behavior
  // change for single-business vendors).
  const { profile: vendorProfile } = await getActiveVendorProfile(supabase, user.id);

  if (!vendorProfile) {
    return (
      <div className="space-y-6">
        <PageTitle>Home</PageTitle>
        <Card className="p-6">
          <p>Finish profile setup to start receiving bookings.</p>
          <Button asChild className="mt-4">
            <Link href="/dashboard/profile/setup">Continue setup →</Link>
          </Button>
        </Card>
      </div>
    );
  }

  // New vendor home (Figma redesign). All stats are real queries except where noted.
  const [totalBookings, unreadNotificationsCount, buckets, attribution] = await Promise.all([
    supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('vendor_profile_id', vendorProfile.id),
    getUnreadNotificationsCount(supabase, user.id),
    getOperationsBuckets(supabase, vendorProfile.id),
    // Lifetime net earnings (95% of confirmed booking totals). getVendorAttribution
    // throws on DB error — degrade to $0 rather than crashing the home page.
    getVendorAttribution(supabase, vendorProfile.id, 'all').catch(() => null),
  ]);

  const totalBookingsCount = totalBookings.count ?? 0;
  const upcomingEvents = [
    ...buckets.today,
    ...buckets.tomorrow,
    ...buckets.thisWeek,
    ...buckets.later,
  ];
  const upcomingEventsCount = upcomingEvents.length;
  const totalEarnings = formatPrice(attribution?.netCents ?? 0);

  // No per-event image exists on booking_events — fall back to the vendor's own
  // first portfolio image (or null -> calendar placeholder).
  const eventFallbackImage = (vendorProfile.portfolio_images ?? [])[0] ?? null;

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:gap-6">
      {/* LEFT COLUMN */}
      <div className="flex min-w-0 flex-1 flex-col gap-6">
        <WelcomeBanner name={profile?.full_name || user.email || 'there'} />

        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          <StatCard
            icon={CalendarDays}
            value={upcomingEventsCount}
            label="Upcoming Events"
            detail="Stay on track with your plans."
            href="/dashboard/bookings"
          />
          <StatCard
            icon={BookOpenCheck}
            value={totalBookingsCount}
            label="Total Bookings"
            detail="View and manage your bookings."
            href="/dashboard/bookings"
          />
          <StatCard
            icon={Wallet}
            value={totalEarnings}
            label="Total Earnings"
            detail="Track your revenue."
            href="/dashboard/money"
          />
          <StatCard
            icon={Bell}
            value={unreadNotificationsCount}
            label="New Notifications"
            detail="Stay updated on your events."
            href="/dashboard/notifications"
          />
        </div>

        <div className="flex flex-col gap-4">
          <SectionHeading
            icon={CalendarDays}
            title="Upcoming Events"
            actionLabel="View all"
            actionHref="/dashboard/bookings"
          />
          {upcomingEvents.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {upcomingEvents.slice(0, 4).map((ev) => (
                <UpcomingEventCard
                  key={ev.id}
                  href={`/dashboard/bookings/${ev.booking_id}`}
                  imageUrl={eventFallbackImage}
                  title={ev.event_type_label || ev.couple_full_name || 'Booking'}
                  subtitle={ev.couple_full_name || ev.city || ''}
                  dateLabel={fmtDate(`${ev.event_date}T12:00:00`, {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={CalendarDays}
              title="No events yet"
              description="Once you have confirmed bookings, your upcoming events will show up here."
            />
          )}
        </div>
      </div>

      {/* RIGHT COLUMN */}
      <div className="flex w-full shrink-0 flex-col gap-6 lg:w-[320px]">
        <PromoCard />

        <QuickActionList title="Quick Actions">
          <QuickActionItem
            icon={Package}
            title="Add Package"
            description="Create a bookable package."
            href="/dashboard/profile/packages/new"
          />
          <QuickActionItem
            icon={CalendarCheck}
            title="View Bookings"
            description="Check your booking status."
            href="/dashboard/bookings"
          />
          <QuickActionItem
            icon={Calendar}
            title="Calendar"
            description="Manage your availability."
            href="/dashboard/profile/calendar"
          />
          <QuickActionItem
            icon={Bell}
            title="View Notifications"
            description="Stay updated."
            href="/dashboard/notifications"
          />
        </QuickActionList>

        <SupportCard />
      </div>
    </div>
  );
}
