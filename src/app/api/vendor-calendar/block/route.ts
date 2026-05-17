// src/app/api/vendor-calendar/block/route.ts
// Sub-project G2.2 — Vendor blocks a date (full-day or time-range).
// Auth required: vendor must own the profile.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorBoundary, HttpError } from '@/lib/api/error-boundary';
import { requireUser } from '@/lib/api/auth';
import { buildHoldRange } from '@/services/availability.service';

const bodySchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('full_day'),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
  }),
  z.object({
    mode: z.literal('time_range'),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
    start_time: z.string().regex(/^\d{2}:\d{2}$/, 'start_time must be HH:mm'),
    end_time: z.string().regex(/^\d{2}:\d{2}$/, 'end_time must be HH:mm'),
  }),
]);

export const POST = withErrorBoundary(async (req: NextRequest) => {
  const { user, supabase } = await requireUser();

  const body = bodySchema.parse(await req.json());

  // Resolve the vendor profile for this user.
  const { data: vendor } = await supabase
    .from('vendor_profiles')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (!vendor) throw new HttpError(404, 'No vendor profile found for this user');

  const range =
    body.mode === 'full_day'
      ? buildHoldRange(body.date, '00:00', '00:00', { fullDay: true })
      : buildHoldRange(body.date, body.start_time, body.end_time);

  const { data, error } = await supabase
    .from('vendor_calendar_holds')
    .insert({
      vendor_profile_id: vendor.id,
      hold_type: 'vendor_blocked',
      hold_range: range,
    })
    .select('id')
    .single();

  if (error) {
    // The DB trigger raises 'calendar_capacity_exceeded' when the hold would
    // push this vendor over their concurrent_capacity.
    if (error.message?.includes('calendar_capacity_exceeded')) {
      throw new HttpError(
        409,
        "You're at full capacity on this date — cancel a booking first or increase your concurrent capacity."
      );
    }
    throw new HttpError(500, error.message);
  }

  return NextResponse.json({ data }, { status: 201 });
});
