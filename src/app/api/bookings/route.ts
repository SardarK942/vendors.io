import { NextRequest, NextResponse } from 'next/server';
import { createBooking } from '@/services/booking.service';
import { createBookingSchema } from '@/types';
import { sendBookingRequestEmail, sendBookingReceiptEmail } from '@/lib/email/resend';
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
      sendBookingRequestEmail(vendorUser.email, vendorProfile.business_name, bookingId).catch(
        (err) => logger.error('sendBookingRequestEmail failed', err, { bookingId })
      );
    }
  }

  if (coupleUser?.email) {
    sendBookingReceiptEmail(coupleUser.email, bookingId).catch((err) =>
      logger.error('sendBookingReceiptEmail failed', err, { bookingId })
    );
  }

  return NextResponse.json({ data: result.data }, { status: 201 });
});
