import { NextRequest, NextResponse } from 'next/server';
import { createBookingRequest } from '@/services/booking.service';
import { sendBookingRequestEmail } from '@/lib/email/resend';
import { bookingRequestSchema } from '@/types';
import { withErrorBoundary, HttpError } from '@/lib/api/error-boundary';
import { requireUser } from '@/lib/api/auth';
import { checkRateLimit } from '@/lib/rate-limit';

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
  const parsed = bookingRequestSchema.parse(body);

  const result = await createBookingRequest(supabase, user.id, parsed);

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const { data: vendorProfile } = await supabase
    .from('vendor_profiles')
    .select('business_name, users!vendor_profiles_user_id_fkey(email)')
    .eq('id', parsed.vendorProfileId)
    .single();

  if (vendorProfile) {
    const vendorUser = vendorProfile.users as unknown as { email: string } | null;
    if (vendorUser?.email) {
      sendBookingRequestEmail(
        vendorUser.email,
        vendorProfile.business_name,
        parsed.eventType,
        parsed.eventDate,
        result.data!.id
      ).catch(console.error);
    }
  }

  return NextResponse.json({ data: result.data }, { status: 201 });
});
