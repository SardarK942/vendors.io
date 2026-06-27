import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PauseProfileToggle } from '@/components/dashboard/PauseProfileToggle';
import { EventCardGrid } from '@/components/dashboard/EventCardGrid';
import { type EventCardData } from '@/components/dashboard/EventCard';
import { InboxBlock } from '@/components/dashboard/InboxBlock';
import { OperationsBlock } from '@/components/dashboard/OperationsBlock';
import { AnalyticsTeaser } from '@/components/dashboard/AnalyticsTeaser';
import { getActiveVendorProfile } from '@/lib/vendor/active';
import { BackfillBanner } from '@/components/dashboard/BackfillBanner';
import { CustomerWelcomeBanner } from '@/components/dashboard/CustomerWelcomeBanner';
import { DashboardCalendarNudge } from '@/components/dashboard/calendar/DashboardCalendarNudge';
import { getFeedStatus } from '@/services/calendar-feed.service';

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
      ? new Date(onboardingData.event_date).toLocaleDateString('en-US', {
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        })
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
            <h1 className="text-2xl font-bold">Dashboard</h1>
            <p className="text-muted-foreground">
              Welcome back, {profile?.full_name || user.email}
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href="/vendors">Browse vendors →</Link>
          </Button>
        </div>

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
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <Card className="p-6">
          <p>Finish profile setup to start receiving bookings.</p>
          <Button asChild className="mt-4">
            <Link href="/dashboard/profile/setup">Continue setup →</Link>
          </Button>
        </Card>
      </div>
    );
  }

  const feedStatus = await getFeedStatus(
    supabase,
    vendorProfile.id,
    process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  );
  const { data: vpFlags } = await supabase
    .from('vendor_profiles')
    .select('calendar_feed_nudge_dismissed_at')
    .eq('id', vendorProfile.id)
    .single();
  const nudgeDismissed = !!vpFlags?.calendar_feed_nudge_dismissed_at;

  const vendorIsActive = vendorProfile.is_active !== false;

  // Backfill banner: show when any of the 3 new filter fields is missing AND
  // the vendor hasn't dismissed it yet. Both data sources are already fetched
  // above (profile = users.*, vendorProfile = vendor_profiles.*).
  const isMissingFields =
    !vendorProfile.languages ||
    vendorProfile.languages.length === 0 ||
    vendorProfile.years_in_business === null ||
    vendorProfile.years_in_business === undefined ||
    vendorProfile.response_sla_hours === null ||
    vendorProfile.response_sla_hours === undefined;
  const showBackfill = isMissingFields && !profile?.profile_backfill_dismissed_at;

  const { count: pkgCount } = await supabase
    .from('packages')
    .select('id', { count: 'exact', head: true })
    .eq('vendor_profile_id', vendorProfile.id)
    .eq('is_active', true);
  const activePackageCount = pkgCount ?? 0;

  return (
    <div className="space-y-6">
      <DashboardCalendarNudge feedStatus={feedStatus} nudgeDismissed={nudgeDismissed} />
      <BackfillBanner show={showBackfill} />

      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Welcome back, {profile?.full_name || user.email}</p>
      </div>

      {/* Onboarding gate (retained from A2) */}
      {activePackageCount === 0 && (
        <Card className="border-yellow-200 bg-yellow-50 p-6">
          <h2 className="font-semibold text-yellow-900">Add a package to go live</h2>
          <p className="mt-1 text-sm text-yellow-800">
            Customers can only book vendors with at least one active package.
          </p>
          <Button
            asChild
            size="lg"
            className="mt-4 bg-hot-pink text-cream hover:-translate-y-px hover:bg-hot-pink/90 hover:shadow-pink motion-reduce:hover:translate-y-0"
          >
            <Link href="/dashboard/profile/packages/new">+ Add Package</Link>
          </Button>
        </Card>
      )}

      {/* Paused profile banner (retained from A2) */}
      {!vendorIsActive && activePackageCount > 0 && (
        <Card className="border-yellow-200 bg-yellow-50 p-6">
          <h2 className="font-semibold text-yellow-900">Your profile is paused</h2>
          <p className="mt-1 text-sm text-yellow-800">
            You won&rsquo;t appear in search until you resume your profile.
          </p>
          <PauseProfileToggle isActive={false} />
        </Card>
      )}

      <InboxBlock vendorProfileId={vendorProfile.id} />
      <OperationsBlock vendorProfileId={vendorProfile.id} />
      <AnalyticsTeaser vendorProfileId={vendorProfile.id} />
    </div>
  );
}
