import { NextRequest, NextResponse } from 'next/server';
import { adjustBookingQuote } from '@/services/booking.service';
import { adjustQuoteSchema } from '@/types';
import { sendAdjustedQuoteEmail } from '@/lib/email/resend';
import { withErrorBoundary } from '@/lib/api/error-boundary';
import { requireUser } from '@/lib/api/auth';
import { logger } from '@/lib/logger';

export const POST = withErrorBoundary(
  async (request: NextRequest, { params }: { params: { id: string } }) => {
    const { user, supabase } = await requireUser();
    const parsed = adjustQuoteSchema.parse(await request.json());

    const result = await adjustBookingQuote(supabase, params.id, user.id, parsed);
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    const booking = result.data!;

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
      const email = Array.isArray(coupleEmail)
        ? coupleEmail[0]?.email
        : (coupleEmail as { email: string } | null)?.email;
      const vendorName =
        (ctx.vendor_profiles as { business_name: string } | null)?.business_name ?? 'Vendor';

      if (email) {
        sendAdjustedQuoteEmail(
          email,
          vendorName,
          booking.total_price_cents ?? 0,
          parsed.reason,
          parsed.explanation ?? null,
          params.id
        ).catch((err) =>
          logger.error('sendAdjustedQuoteEmail failed', err, { bookingId: params.id })
        );
      }
    })();

    return NextResponse.json({ data: booking }, { status: 200 });
  }
);
