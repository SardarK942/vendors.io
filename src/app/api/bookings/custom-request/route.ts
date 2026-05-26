import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import { customRequestSchema } from '@/lib/booking/custom-request-validation';
import { notifyCustomRequestReceived } from '@/services/notifications.service';
import { sendCustomRequestReceivedEmail } from '@/lib/email/resend';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, error: 'auth required' }, { status: 401 });
  }

  const parsed = customRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 });
  }

  const { vendor_slug, event_date, guest_count, event_type, description } = parsed.data;

  // Resolve vendor by slug. Must be active + onboarding_complete for couples
  // to be able to send requests (mirrors /book page gate).
  const { data: vendor } = await supabase
    .from('vendor_profiles')
    .select('id, user_id, users:user_id(email)')
    .eq('slug', vendor_slug)
    .eq('is_active', true)
    .maybeSingle();

  if (!vendor) {
    return NextResponse.json({ ok: false, error: 'vendor not found' }, { status: 404 });
  }

  const { data: inserted, error } = await supabase
    .from('bookings')
    .insert({
      vendor_profile_id: vendor.id,
      couple_user_id: user.id,
      package_id: null,
      event_date,
      guest_count,
      event_type,
      special_requests: description,
      status: 'pending_quote',
      total_price_cents: 0,
    })
    .select('id')
    .single();

  if (error || !inserted) {
    logger.error('custom-request insert failed', error, { vendor_slug });
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  // Fire-and-forget notification — never block the response.
  notifyCustomRequestReceived(supabase, vendor.user_id, {
    bookingId: inserted.id,
    coupleName: user.email ?? 'A couple', // refined when we wire user.full_name lookup
    eventDate: event_date,
  }).catch(() => {});

  // Send email to vendor — fire-and-forget.
  const vendorUsers = vendor.users as { email: string } | { email: string }[] | null;
  const vendorEmail = Array.isArray(vendorUsers)
    ? vendorUsers[0]?.email
    : (vendorUsers as { email: string } | null)?.email;

  if (vendorEmail) {
    const descriptionPreview =
      description.length > 140 ? `${description.slice(0, 140)}…` : description;
    void sendCustomRequestReceivedEmail(vendorEmail, {
      bookingId: inserted.id,
      coupleName: user.email ?? 'A couple',
      eventDate: event_date,
      eventType: event_type,
      guestCount: guest_count,
      descriptionPreview,
    }).catch((err) =>
      logger.error('sendCustomRequestReceivedEmail failed', err, { bookingId: inserted.id })
    );
  }

  logger.info('custom_request_submitted', { vendor_slug, booking_id: inserted.id });

  return NextResponse.json({ ok: true, booking_id: inserted.id }, { status: 200 });
}
