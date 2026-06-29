import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { CalendarHoldsList } from '@/components/dashboard/CalendarHoldsList';
import { BlockDateForm } from '@/components/dashboard/BlockDateForm';
import { CapacityField } from '@/components/dashboard/CapacityField';
import { ExternalCalendarSyncCard } from '@/components/dashboard/calendar/ExternalCalendarSyncCard';
import { getActiveVendorProfile } from '@/lib/vendor/active';
import { getFeedStatus } from '@/services/calendar-feed.service';

export const dynamic = 'force-dynamic';

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

  const feedStatus = await getFeedStatus(
    supabase,
    vendor.id,
    process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  );

  // Fetch all holds ordered by range; drop any without a booking_event for booking-type holds
  // that have stale data. For MVP, return all holds (no 90-day filter via tstzrange).
  const { data: rawHolds } = await supabase
    .from('vendor_calendar_holds')
    .select(
      'id, hold_type, hold_range, booking_event_id, booking_events(event_type_label, bookings(couple_full_name))'
    )
    .eq('vendor_profile_id', vendor.id)
    .order('hold_range');

  // Normalise the nested shape to what CalendarHoldsList expects.
  // Supabase returns bookings as an array when joining; we want the first element.
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

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Calendar</h1>
        <p className="text-sm text-muted-foreground">
          Manage your availability and concurrent capacity.
        </p>
      </div>
      <ExternalCalendarSyncCard initialStatus={feedStatus} />
      <CapacityField initial={vendor.concurrent_capacity} />
      <BlockDateForm />
      <CalendarHoldsList holds={holds} />
    </div>
  );
}
