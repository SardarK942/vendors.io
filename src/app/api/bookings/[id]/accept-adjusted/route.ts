import { NextRequest, NextResponse } from 'next/server';
import { coupleAcceptAdjusted } from '@/services/booking.service';
import { createDepositCheckout } from '@/services/payment.service';
import { sendCoupleAcceptedAdjustedEmail } from '@/lib/email/resend';
import { withErrorBoundary } from '@/lib/api/error-boundary';
import { requireUser } from '@/lib/api/auth';
import { logger } from '@/lib/logger';

export const POST = withErrorBoundary(
  async (_request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { id: bookingId } = await params;
    const { user, supabase } = await requireUser();

    const result = await coupleAcceptAdjusted(supabase, bookingId, user.id);
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    const booking = result.data!;

    // Create deposit checkout
    const checkoutResult = await createDepositCheckout(supabase, bookingId, user.id);

    // Fire email to vendor (fire-and-forget)
    const { data: vendorProfile } = await supabase
      .from('vendor_profiles')
      .select('users!vendor_profiles_user_id_fkey(email)')
      .eq('id', booking.vendor_profile_id as string)
      .single();

    const vendorUser = vendorProfile?.users as unknown as { email: string } | null;
    const coupleName = (booking.couple_full_name as string) ?? 'The couple';
    const totalCents = (booking.total_price_cents as number) ?? 0;

    if (vendorUser?.email) {
      sendCoupleAcceptedAdjustedEmail(vendorUser.email, coupleName, totalCents, bookingId).catch(
        (err) => logger.error('sendCoupleAcceptedAdjustedEmail failed', err, { bookingId })
      );
    }

    if (checkoutResult.error) {
      // Return booking update even if checkout creation fails; couple can retry from detail page
      return NextResponse.json({ data: { booking } }, { status: 200 });
    }

    return NextResponse.json(
      { data: { booking, deposit_checkout_url: checkoutResult.data!.checkoutUrl } },
      { status: 200 }
    );
  }
);
