import { NextRequest, NextResponse } from 'next/server';
import { createBooking } from '@/services/booking.service';
import { createBookingSchema } from '@/types';
import {
  sendBookingRequestEmail,
  sendBookingReceiptEmail,
  sendVendorFirstBookingEmail,
} from '@/lib/email/resend';
import { withErrorBoundary, HttpError } from '@/lib/api/error-boundary';
import { requireUser } from '@/lib/api/auth';
import { checkRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

export const POST = withErrorBoundary(async (request: NextRequest) => {
  const { user, supabase } = await requireUser();

  const gate = await checkRateLimit(
    request,
    'booking:create',
    { limit: 10, window: '1 m' },
    user.id
  );
  if (!gate.ok) throw new HttpError(429, gate.message!);

  const body = await request.json();
  const parsed = createBookingSchema.parse(body);

  const result = await createBooking(supabase, user.id, parsed);
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const booking = result.data!.booking;
  const bookingId = booking.id as string;
  const isVendorFirstBooking = result.data!.isVendorFirstBooking;

  // Fire emails fire-and-forget
  const { data: vendorProfile } = await supabase
    .from('vendor_profiles')
    .select('business_name, users!vendor_profiles_user_id_fkey(email)')
    .eq('id', parsed.vendor_profile_id)
    .single();

  const { data: coupleUser } = await supabase
    .from('users')
    .select('email')
    .eq('id', user.id)
    .single();

  if (vendorProfile) {
    const vendorUser = vendorProfile.users as unknown as { email: string } | null;
    if (vendorUser?.email) {
      if (isVendorFirstBooking) {
        // Celebratory first-booking email (T9 template)
        const events = result.data!.events as Array<Record<string, unknown>>;
        const firstEvent = events[0] ?? {};
        const customerFirstName = parsed.couple_full_name.split(' ')[0] ?? parsed.couple_full_name;
        const totalCents = (booking.total_price_cents as number) ?? 0;
        sendVendorFirstBookingEmail(
          vendorUser.email,
          customerFirstName,
          (firstEvent.event_type_label as string) ?? 'Event',
          (firstEvent.event_date as string) ?? '',
          totalCents,
          Math.round(totalCents * 0.05),
          (booking.package_name_snapshot as string) ?? 'Package',
          24,
          bookingId,
          user.id
        ).catch((err) => logger.error('sendVendorFirstBookingEmail failed', err, { bookingId }));
      } else {
        sendBookingRequestEmail(vendorUser.email, vendorProfile.business_name, bookingId).catch(
          (err) => logger.error('sendBookingRequestEmail failed', err, { bookingId })
        );
      }
    }
  }

  if (coupleUser?.email) {
    sendBookingReceiptEmail(coupleUser.email, bookingId).catch((err) =>
      logger.error('sendBookingReceiptEmail failed', err, { bookingId })
    );
  }

  return NextResponse.json(
    {
      data: {
        booking: result.data!.booking,
        events: result.data!.events,
        is_first_booking: result.data!.isFirstBooking,
      },
    },
    { status: 201 }
  );
});
