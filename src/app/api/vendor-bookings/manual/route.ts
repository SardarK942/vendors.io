// src/app/api/vendor-bookings/manual/route.ts
// Vendor logs a manual (off-platform) booking onto their own calendar.
// Auth required: the vendor must own the active profile. Uses a service-role
// client because vendors have no RLS INSERT path on bookings; createManualBooking
// re-verifies profile ownership as defense in depth.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorBoundary, HttpError } from '@/lib/api/error-boundary';
import { requireUser } from '@/lib/api/auth';
import { getActiveVendorProfileId } from '@/lib/vendor/active';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { createManualBooking } from '@/services/booking.service';

const bodySchema = z.object({
  customerName: z.string().trim().min(1, 'Customer name is required').max(120),
  customerPhone: z.string().trim().max(40).optional().nullable(),
  eventType: z.string().trim().min(1, 'Event type is required').max(80),
  eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'eventDate must be YYYY-MM-DD'),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, 'startTime must be HH:mm'),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, 'endTime must be HH:mm'),
  valueDollars: z.number().nonnegative('Value cannot be negative').max(1_000_000).optional(),
  location: z.string().trim().max(200).optional().nullable(),
});

export const POST = withErrorBoundary(async (req: NextRequest) => {
  const { user, supabase } = await requireUser();

  const body = bodySchema.parse(await req.json());

  const vendorProfileId = await getActiveVendorProfileId(supabase, user.id);
  if (!vendorProfileId) throw new HttpError(404, 'No vendor profile found for this user');

  const admin = createServiceRoleClient();
  const result = await createManualBooking(admin, user.id, {
    vendorProfileId,
    customerName: body.customerName,
    customerPhone: body.customerPhone ?? null,
    eventType: body.eventType,
    eventDate: body.eventDate,
    startTime: body.startTime,
    endTime: body.endTime,
    valueCents: Math.round((body.valueDollars ?? 0) * 100),
    location: body.location ?? null,
  });

  if (result.error) throw new HttpError(result.status ?? 500, result.error);

  return NextResponse.json({ booking: result.data?.booking }, { status: 201 });
});
