// src/app/api/vendor-calendar/capacity/route.ts
// Sub-project G2.3 — Update vendor's concurrent_capacity.
// Auth required: vendor must own the profile.
//
// Known edge case (documented, not guarded): lowering concurrent_capacity below
// the current active hold overlap count is NOT prevented here. The DB trigger
// only fires on INSERT, not on UPDATE to vendor_profiles. If a vendor lowers
// capacity below their current overlap count, existing holds remain valid;
// new inserts will then conflict sooner. Acceptable for MVP.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorBoundary, HttpError } from '@/lib/api/error-boundary';
import { requireUser } from '@/lib/api/auth';

const bodySchema = z.object({
  concurrent_capacity: z
    .number()
    .int('concurrent_capacity must be an integer')
    .min(1, 'concurrent_capacity must be at least 1')
    .max(50, 'concurrent_capacity must be at most 50'),
});

export const PATCH = withErrorBoundary(async (req: NextRequest) => {
  const { user, supabase } = await requireUser();

  const body = bodySchema.parse(await req.json());

  // Resolve the vendor profile for this user.
  const { data: vendor } = await supabase
    .from('vendor_profiles')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (!vendor) throw new HttpError(404, 'No vendor profile found for this user');

  const { error } = await supabase
    .from('vendor_profiles')
    .update({ concurrent_capacity: body.concurrent_capacity })
    .eq('id', vendor.id);

  if (error) throw new HttpError(500, error.message);

  return NextResponse.json({ ok: true });
});
