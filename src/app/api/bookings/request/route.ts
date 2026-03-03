import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createBookingRequest } from '@/services/booking.service';
import { sendBookingRequestEmail } from '@/lib/email/resend';
import { bookingRequestSchema } from '@/types';

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const parsed = bookingRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const result = await createBookingRequest(supabase, user.id, parsed.data);

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  // Fire-and-forget email notification to vendor
  const { data: vendorProfile } = await supabase
    .from('vendor_profiles')
    .select('business_name, users!vendor_profiles_user_id_fkey(email)')
    .eq('id', parsed.data.vendorProfileId)
    .single();

  if (vendorProfile) {
    const vendorUser = vendorProfile.users as unknown as { email: string } | null;
    if (vendorUser?.email) {
      sendBookingRequestEmail(
        vendorUser.email,
        vendorProfile.business_name,
        parsed.data.eventType,
        parsed.data.eventDate,
        result.data!.id
      ).catch(console.error);
    }
  }

  return NextResponse.json({ data: result.data }, { status: 201 });
}
