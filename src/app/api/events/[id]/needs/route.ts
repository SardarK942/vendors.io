import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorBoundary, HttpError } from '@/lib/api/error-boundary';
import { requireUser } from '@/lib/api/auth';
import { checkRateLimit } from '@/lib/rate-limit';
import { linkBookingToFunction } from '@/services/events.service';

const postSchema = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('manual'),
    event_function_id: z.string().uuid(),
    category: z.string().min(1).max(40),
    manual_vendor_name: z.string().min(1).max(120),
    manual_amount_cents: z.number().int().nonnegative().nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
  }),
  z.object({
    op: z.literal('link_booking'),
    event_function_id: z.string().uuid(),
    booking_id: z.string().uuid(),
  }),
  z.object({
    op: z.literal('add_slot'),
    event_function_id: z.string().uuid(),
    category: z.string().min(1).max(40),
  }),
]);

export const POST = withErrorBoundary(async (request: NextRequest) => {
  const { user, supabase } = await requireUser();
  const gate = await checkRateLimit(
    request,
    'events:needs',
    { limit: 120, window: '1 h' },
    user.id
  );
  if (!gate.ok) throw new HttpError(429, gate.message!);

  const parsed = postSchema.parse(await request.json());
  if (parsed.op === 'link_booking') {
    const res = await linkBookingToFunction(supabase, user.id, {
      bookingId: parsed.booking_id,
      eventFunctionId: parsed.event_function_id,
    });
    if (!res.ok) throw new HttpError(400, res.error ?? 'link failed');
    return NextResponse.json({ ok: true });
  }
  const { error } = await supabase.from('event_vendor_needs').insert(
    parsed.op === 'manual'
      ? {
          event_function_id: parsed.event_function_id,
          category: parsed.category,
          manual_vendor_name: parsed.manual_vendor_name,
          manual_amount_cents: parsed.manual_amount_cents ?? null,
          manual_booked: true,
          notes: parsed.notes ?? null,
        }
      : { event_function_id: parsed.event_function_id, category: parsed.category }
  );
  if (error) throw new HttpError(500, error.message);
  return NextResponse.json({ ok: true });
});

const patchSchema = z.object({
  need_id: z.string().uuid(),
  manual_vendor_name: z.string().max(120).nullable().optional(),
  manual_amount_cents: z.number().int().nonnegative().nullable().optional(),
  manual_booked: z.boolean().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export const PATCH = withErrorBoundary(async (request: NextRequest) => {
  const { user, supabase } = await requireUser();
  const { need_id, ...fields } = patchSchema.parse(await request.json());
  // RLS restricts the update to needs inside the couple's own events.
  const { error } = await supabase
    .from('event_vendor_needs')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', need_id);
  if (error) throw new HttpError(500, error.message);
  return NextResponse.json({ ok: true, updatedBy: user.id });
});

export const DELETE = withErrorBoundary(async (request: NextRequest) => {
  const { supabase } = await requireUser();
  const { need_id } = z.object({ need_id: z.string().uuid() }).parse(await request.json());

  // If this slot has a linked booking, unlink it first so the booking doesn't
  // become orphaned (event_function_id pointing at a slot that no longer
  // exists). Unlinking returns the booking to the couple's "Link a Baazar
  // booking" picker instead of stranding it.
  const { data: need } = await supabase
    .from('event_vendor_needs')
    .select('booking_id')
    .eq('id', need_id)
    .maybeSingle();
  if (need?.booking_id) {
    const { error: unlinkError } = await supabase
      .from('bookings')
      .update({ event_function_id: null })
      .eq('id', need.booking_id);
    if (unlinkError) throw new HttpError(500, unlinkError.message);
  }

  const { error } = await supabase.from('event_vendor_needs').delete().eq('id', need_id);
  if (error) throw new HttpError(500, error.message);
  return NextResponse.json({ ok: true });
});
