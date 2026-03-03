import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { submitQuote } from '@/services/booking.service';
import { sendQuoteEmail } from '@/lib/email/resend';
import { quoteSchema } from '@/types';

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const parsed = quoteSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const result = await submitQuote(supabase, id, user.id, parsed.data);

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  // Fire-and-forget email notification to couple
  if (result.data) {
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
      sendQuoteEmail(couple.email, vendorProfile.business_name, parsed.data.quoteAmount, id).catch(
        console.error
      );
    }
  }

  return NextResponse.json({ data: result.data }, { status: 200 });
}
