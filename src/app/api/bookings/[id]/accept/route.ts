import { NextRequest, NextResponse } from 'next/server';
import { acceptBooking } from '@/services/booking.service';
import { createDepositCheckout } from '@/services/payment.service';
import { sendVendorAcceptedEmail } from '@/lib/email/resend';
import { withErrorBoundary } from '@/lib/api/error-boundary';
import { requireUser } from '@/lib/api/auth';
import { logger } from '@/lib/logger';

export const POST = withErrorBoundary(
  async (_request: NextRequest, { params }: { params: { id: string } }) => {
    const { user, supabase } = await requireUser();

    // Accept the booking (validates vendor ownership + status=pending)
    const result = await acceptBooking(supabase, params.id, user.id);
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    const booking = result.data!;

    // Create Stripe deposit checkout on behalf of the couple
    // createDepositCheckout reads total_price_cents from the booking row
    const checkout = await createDepositCheckout(supabase, params.id, booking.couple_user_id!);

    if (checkout.error) {
      // Non-fatal: booking accepted but checkout URL unavailable.
      // Return booking with null URL so couple can retry from their dashboard.
      logger.error('createDepositCheckout failed after accept', checkout.error, {
        site: 'bookings/accept',
        bookingId: params.id,
      });
      return NextResponse.json(
        { data: { booking, deposit_checkout_url: null }, warning: checkout.error },
        { status: 200 }
      );
    }

    const depositCheckoutUrl = checkout.data!.checkoutUrl;

    // Fire email to couple — fire-and-forget
    void (async () => {
      const { data: ctx } = await supabase
        .from('bookings')
        .select(
          'couple_user_id, users!couple_user_id(email), vendor_profiles!inner(business_name)'
        )
        .eq('id', params.id)
        .single();

      if (!ctx) return;

      const coupleEmail = (ctx.users as { email: string } | { email: string }[] | null);
      const email = Array.isArray(coupleEmail) ? coupleEmail[0]?.email : (coupleEmail as { email: string } | null)?.email;
      const vendorName = (ctx.vendor_profiles as { business_name: string } | null)?.business_name ?? '';

      if (email) {
        sendVendorAcceptedEmail(email, vendorName, booking.total_price_cents ?? 0, depositCheckoutUrl).catch(
          (err) => logger.error('sendVendorAcceptedEmail failed', err, { bookingId: params.id })
        );
      }
    })();

    return NextResponse.json(
      { data: { booking, deposit_checkout_url: depositCheckoutUrl } },
      { status: 200 }
    );
  }
);
