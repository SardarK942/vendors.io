import { NextRequest, NextResponse } from 'next/server';
import { reviewSchema } from '@/types';
import { withErrorBoundary, HttpError } from '@/lib/api/error-boundary';
import { requireBookingAccess, requireUser } from '@/lib/api/auth';

export const POST = withErrorBoundary(async (request: NextRequest) => {
  const { user, supabase } = await requireUser();

  const body = await request.json().catch(() => ({}));
  const parsed = reviewSchema.parse(body);

  const { booking, role } = await requireBookingAccess(supabase, parsed.bookingRequestId, user.id);
  if (role !== 'couple') throw new HttpError(403, 'Only the couple can review this booking');
  if (booking.status !== 'completed') {
    throw new HttpError(400, 'Reviews can only be left on completed bookings');
  }

  const { data, error } = await supabase
    .from('reviews')
    .insert({
      booking_request_id: booking.id,
      reviewer_user_id: user.id,
      vendor_profile_id: booking.vendor_profile_id,
      rating_overall: parsed.ratingOverall,
      rating_quality: parsed.ratingQuality ?? null,
      rating_communication: parsed.ratingCommunication ?? null,
      rating_professionalism: parsed.ratingProfessionalism ?? null,
      rating_value: parsed.ratingValue ?? null,
      comment: parsed.comment ?? null,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      throw new HttpError(409, 'Review already exists for this booking');
    }
    throw new HttpError(500, 'Failed to create review');
  }

  return NextResponse.json({ data }, { status: 201 });
});
