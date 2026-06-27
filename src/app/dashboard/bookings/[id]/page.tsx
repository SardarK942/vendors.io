import type { ReactNode } from 'react';
import { BookingDetail } from '@/components/dashboard/BookingDetail';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getActiveVendorProfile } from '@/lib/vendor/active';
import { getFeedStatus } from '@/services/calendar-feed.service';
import { PostFirstBookingPrompt } from '@/components/dashboard/calendar/PostFirstBookingPrompt';

interface BookingDetailPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function BookingDetailPage({ params, searchParams }: BookingDetailPageProps) {
  const { id } = await params;
  const sp = await searchParams;
  const rawAction = sp['action'];
  const initialAction = typeof rawAction === 'string' ? rawAction : undefined;
  const showWelcome = sp['welcome'] === 'true';

  // Vendor-only prompt: needs auth, vendor profile, first-locked-booking check, and feed status.
  let prompt: ReactNode = null;
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { profile: vendor } = await getActiveVendorProfile(supabase, user.id);
      if (vendor) {
        const feedStatus = await getFeedStatus(
          supabase,
          vendor.id,
          process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
        );
        if (feedStatus.state === 'not_connected') {
          const LOCKING = [
            'accepted',
            'adjusted_quote_sent',
            'adjusted_quote_declined',
            'deposit_paid',
            'completed',
          ] as const;
          const { data: firstBooking } = await supabase
            .from('bookings')
            .select('id')
            .eq('vendor_profile_id', vendor.id)
            .in('status', LOCKING)
            .order('accepted_at', { ascending: true })
            .limit(1)
            .maybeSingle();
          const isFirstConfirmedBooking = firstBooking?.id === id;
          if (isFirstConfirmedBooking) {
            prompt = (
              <PostFirstBookingPrompt
                feedStatus={feedStatus}
                bookingId={id}
                isFirstConfirmedBooking={isFirstConfirmedBooking}
              />
            );
          }
        }
      }
    }
  } catch {
    // Best-effort enhancement; never block the booking page from rendering.
    prompt = null;
  }

  return (
    <>
      {prompt}
      <BookingDetail
        bookingId={id}
        mode="page"
        initialAction={initialAction}
        showWelcome={showWelcome}
      />
    </>
  );
}
