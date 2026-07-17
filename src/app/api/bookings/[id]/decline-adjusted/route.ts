import { NextRequest, NextResponse } from 'next/server';
import { coupleDeclineAdjusted } from '@/services/booking.service';
import { sendCoupleDeclinedEmail } from '@/lib/email/resend';
import { withErrorBoundary, HttpError } from '@/lib/api/error-boundary';
import { requireUser } from '@/lib/api/auth';
import { checkRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

export const POST = withErrorBoundary(
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { id: bookingId } = await params;
    const { user, supabase } = await requireUser();

    const gate = await checkRateLimit(
      request,
      'booking:decline-adjusted',
      { limit: 20, window: '1 m' },
      user.id
    );
    if (!gate.ok) throw new HttpError(429, gate.message!);

    const result = await coupleDeclineAdjusted(supabase, bookingId, user.id);
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    const booking = result.data!;

    // Fire email to vendor (fire-and-forget)
    const { data: vendorProfile } = await supabase
      .from('vendor_profiles')
      .select('users!vendor_profiles_user_id_fkey(email)')
      .eq('id', booking.vendor_profile_id as string)
      .single();

    const vendorUser = vendorProfile?.users as unknown as { email: string } | null;
    if (vendorUser?.email) {
      sendCoupleDeclinedEmail(vendorUser.email, bookingId).catch((err) =>
        logger.error('sendCoupleDeclinedEmail failed', err, { bookingId })
      );
    }

    return NextResponse.json({ data: { booking } }, { status: 200 });
  }
);
