import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import {
  customRequestSchema,
  customRequestSchemaV2,
} from '@/lib/booking/custom-request-validation';
import { notifyCustomRequestReceived } from '@/services/notifications.service';
import { deliver } from '@/lib/notifications/deliver';
import { sendCustomRequestEmail } from '@/lib/email/custom-request';

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

  // Try V2 (events array) first; fall back to V1 (single-event) for backwards-compat.
  const parsedV2 = customRequestSchemaV2.safeParse(body);
  const parsedV1 = parsedV2.success ? null : customRequestSchema.safeParse(body);

  if (!parsedV2.success && !parsedV1?.success) {
    return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 });
  }

  // Normalise to a canonical shape the rest of the handler uses.
  let vendor_slug: string;
  let event_date: string;
  let guest_count: number;
  let event_type: string;
  let description: string;
  let extra_events_json: string | null = null;

  if (parsedV2.success) {
    const { vendor_slug: vs, events, description: desc } = parsedV2.data;
    const primary = events[0];
    vendor_slug = vs;
    event_date = primary.date;
    guest_count = primary.guestCount;
    event_type = primary.eventTypeId;
    description = desc;
    if (events.length > 1) {
      extra_events_json = JSON.stringify(events);
    }
  } else {
    // V1 payload
    const v1 = parsedV1!.data!;
    vendor_slug = v1.vendor_slug;
    event_date = v1.event_date;
    guest_count = v1.guest_count;
    event_type = v1.event_type;
    description = v1.description;
  }

  // Resolve vendor by slug. Must be active + onboarding_complete for couples
  // to be able to send requests (mirrors /book page gate).
  const { data: vendor } = await supabase
    .from('vendor_profiles')
    .select('id, user_id')
    .eq('slug', vendor_slug)
    .eq('is_active', true)
    .maybeSingle();

  if (!vendor) {
    return NextResponse.json({ ok: false, error: 'vendor not found' }, { status: 404 });
  }

  // Compose special_requests: human description + (for multi-event) a JSON block
  // listing all events so the vendor can see the full picture.
  const special_requests = extra_events_json
    ? `${description}\n\n[events_json]:${extra_events_json}`
    : description;

  const { data: inserted, error } = await supabase
    .from('bookings')
    .insert({
      vendor_profile_id: vendor.id,
      couple_user_id: user.id,
      package_id: null,
      guest_count,
      event_type,
      special_requests,
      status: 'pending_quote',
      total_price_cents: 0,
    })
    .select('id')
    .single();

  if (error || !inserted) {
    logger.error('custom-request insert failed', error, { vendor_slug });
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  // Derive couple display info from auth user metadata (privacy: first name + city only).
  const rawFullName = (user.user_metadata?.full_name as string | undefined) ?? '';
  const coupleFirstName = rawFullName.split(' ')[0] || user.email?.split('@')[0] || 'Someone';
  const coupleName = rawFullName || user.email || 'A couple';

  // Fire-and-forget notification + email — never block the response.
  void (async () => {
    const notifyResult = await deliver(
      'notify',
      () =>
        notifyCustomRequestReceived(supabase, vendor.user_id, {
          bookingId: inserted.id,
          coupleName,
          eventDate: event_date,
        }),
      { booking_id: inserted.id }
    );

    // Fetch vendor email via admin client (sync — no await on createServiceRoleClient).
    const sbAdmin = createServiceRoleClient();
    const vendorEmailResult = await sbAdmin.auth.admin.getUserById(vendor.user_id);
    const vendorEmail = vendorEmailResult.data.user?.email;

    if (notifyResult?.id && vendorEmail) {
      await deliver(
        'email',
        () =>
          sendCustomRequestEmail({
            to: vendorEmail,
            coupleFirstName,
            coupleCity: 'not specified',
            eventType: event_type,
            eventDate: event_date,
            headcount: guest_count,
            location: 'TBD',
            description,
            bookingId: inserted.id,
            notificationId: notifyResult.id,
          }),
        { booking_id: inserted.id }
      );
    }
  })();

  logger.info('custom_request_submitted', { vendor_slug, booking_id: inserted.id });

  return NextResponse.json({ ok: true, booking_id: inserted.id }, { status: 200 });
}
