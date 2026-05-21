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
    // Read from booking_events_public (excludes vendor_notes — Sub-project E §8).
    const { data: rawEvents } = await supabase
      .from('booking_events_public')
      .select(`
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
      `)
      .eq('bookings.couple_user_id', user.id)
      .not('bookings.status', 'in', '("couple_cancelled","vendor_cancelled","cancelled_mutual","expired")')
      .order('event_date');

    const events: EventCardData[] = (rawEvents ?? []).map((e: Record<string, unknown>) => {
      const b = (e.bookings as Record<string, unknown>);
      const v = (b.vendor_profiles as Record<string, unknown>);
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
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Dashboard</h1>
            <p className="text-muted-foreground">Welcome back, {profile?.full_name || user.email}</p>
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
  const { data: vendorProfileRaw } = await supabase
    .from('vendor_profiles')
    .select('*')
    .eq('user_id', user.id)
    .single();
  const vendorProfile = vendorProfileRaw as
    | (typeof vendorProfileRaw & { is_active?: boolean })
    | null;

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

  const vendorIsActive = vendorProfile.is_active !== false;

  const { count: pkgCount } = await supabase
    .from('packages')
    .select('id', { count: 'exact', head: true })
    .eq('vendor_profile_id', vendorProfile.id)
    .eq('is_active', true);
  const activePackageCount = pkgCount ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Welcome back, {profile?.full_name || user.email}</p>
      </div>

      {/* Onboarding gate (retained from A2) */}
      {activePackageCount === 0 && (
        <Card className="bg-yellow-50 border-yellow-200 p-6">
          <h2 className="font-semibold text-yellow-900">Add a package to go live</h2>
          <p className="text-sm text-yellow-800 mt-1">
            Couples can only book vendors with at least one active package.
          </p>
          <Button asChild className="mt-4" size="sm">
            <Link href="/dashboard/profile/packages/new">Add Package</Link>
          </Button>
        </Card>
      )}

      {/* Paused profile banner (retained from A2) */}
      {!vendorIsActive && activePackageCount > 0 && (
        <Card className="bg-yellow-50 border-yellow-200 p-6">
          <h2 className="font-semibold text-yellow-900">Your profile is paused</h2>
          <p className="text-sm text-yellow-800 mt-1">
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
