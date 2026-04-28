import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { submitQuote } from '@/services/booking.service';
import { setupMinimalStripeAccount } from '@/services/payment.service';
import { sendQuoteEmail } from '@/lib/email/resend';
import { quoteSchema } from '@/types';
import { withErrorBoundary } from '@/lib/api/error-boundary';
import { requireUser } from '@/lib/api/auth';

export const PUT = withErrorBoundary(
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const { user, supabase } = await requireUser();

    const body = await request.json();
    const parsed = quoteSchema.parse(body);

    const result = await submitQuote(supabase, id, user.id, parsed);

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    // Lazy-init: ensure vendor has a minimal Stripe account so couple can pay deposit.
    if (result.data) {
      const adminSb = createServiceRoleClient();
      await setupMinimalStripeAccount(adminSb, result.data.vendor_profile_id, user.email!).catch(
        (err) => console.error('[quote] setupMinimalStripeAccount failed', err)
      );

      const { data: couple } = await supabase
        .from('users')
        .select('email')
        .eq('id', result.data.couple_user_id)
        .single();

      const { data: vendorProfile } = await supabase
        .from('vendor_profiles')
        .select('business_name')
        .eq('id', result.data.vendor_profile_id)
        .single();

      if (couple?.email && vendorProfile) {
        sendQuoteEmail(couple.email, vendorProfile.business_name, parsed.quoteAmount, id).catch(
          console.error
        );
      }
    }

    return NextResponse.json({ data: result.data }, { status: 200 });
  }
);
