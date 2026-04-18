import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { cancelBooking } from '@/services/payment.service';
import { cancelBookingSchema } from '@/types';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = cancelBookingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  // Determine canceller role by looking up the booking and matching user against couple/vendor.
  const { data: booking } = await supabase
    .from('booking_requests')
    .select('couple_user_id, vendor_profiles!inner(user_id)')
    .eq('id', id)
    .single();

  if (!booking) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
  }

  const vp = booking.vendor_profiles as unknown as { user_id: string };
  const role =
    booking.couple_user_id === user.id ? 'couple' : vp.user_id === user.id ? 'vendor' : null;

  if (!role) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const result = await cancelBooking(supabase, id, user.id, role, parsed.data.reason ?? null);

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ data: result.data }, { status: 200 });
}
