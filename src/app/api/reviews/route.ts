import { NextRequest, NextResponse } from 'next/server';
import { reviewSchema } from '@/types';
import { withErrorBoundary, HttpError } from '@/lib/api/error-boundary';
import { requireBookingAccess, requireUser } from '@/lib/api/auth';
import { notifyReviewReceived } from '@/services/notifications.service';
import { deliver } from '@/lib/notifications/deliver';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { sendReviewReceivedEmail } from '@/lib/email/review-received';

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

  // Notify vendor that a review was received — fire-and-forget.
  void (async () => {
    const { data: ctx } = await supabase
      .from('vendor_profiles')
      .select('user_id, slug')
      .eq('id', booking.vendor_profile_id)
      .single();
    if (!ctx) return;
    const { data: coupleCtx } = await supabase
      .from('users')
      .select('full_name')
      .eq('id', user.id)
      .single();
    const coupleName = coupleCtx?.full_name ?? 'A couple';

    const notifyResult = await deliver(
      'notify',
      () =>
        notifyReviewReceived(supabase, ctx.user_id, {
          bookingId: booking.id,
          coupleName,
          ratingOverall: parsed.ratingOverall,
        }),
      { booking_id: booking.id }
    );

    // Fetch vendor email via admin client (sync — no await on createServiceRoleClient).
    const sbAdmin = createServiceRoleClient();
    const vendorEmailResult = await sbAdmin.auth.admin.getUserById(ctx.user_id);
    const vendorEmail = vendorEmailResult.data.user?.email;

    if (notifyResult?.id && vendorEmail) {
      await deliver(
        'email',
        () =>
          sendReviewReceivedEmail({
            to: vendorEmail,
            coupleName,
            rating: parsed.ratingOverall,
            body: parsed.comment ?? '',
            vendorSlug: ctx.slug,
            notificationId: notifyResult.id,
          }),
        { booking_id: booking.id }
      );
    }
  })();

  return NextResponse.json({ data }, { status: 201 });
});
