import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { reviewSchema } from '@/types';

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = reviewSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  // Look up the booking so we can set vendor_profile_id and enforce ownership + completed state.
  const { data: booking } = await supabase
    .from('booking_requests')
    .select('id, couple_user_id, vendor_profile_id, status')
    .eq('id', parsed.data.bookingRequestId)
    .single();

  if (!booking) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
  }
  if (booking.couple_user_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (booking.status !== 'completed') {
    return NextResponse.json(
      { error: 'Reviews can only be left on completed bookings' },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from('reviews')
    .insert({
      booking_request_id: booking.id,
      reviewer_user_id: user.id,
      vendor_profile_id: booking.vendor_profile_id,
      rating_overall: parsed.data.ratingOverall,
      rating_quality: parsed.data.ratingQuality ?? null,
      rating_communication: parsed.data.ratingCommunication ?? null,
      rating_professionalism: parsed.data.ratingProfessionalism ?? null,
      rating_value: parsed.data.ratingValue ?? null,
      comment: parsed.data.comment ?? null,
    })
    .select()
    .single();

  if (error) {
    // Unique violation = review already exists for this booking
    if (error.code === '23505') {
      return NextResponse.json(
        { error: 'Review already exists for this booking' },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: 'Failed to create review' }, { status: 500 });
  }

  return NextResponse.json({ data }, { status: 201 });
}
