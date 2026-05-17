// src/app/api/vendor-calendar/block/[id]/route.ts
// Sub-project G2.2 — Delete a vendor_blocked hold.
// Auth required: vendor must own the hold.
// Only hold_type = 'vendor_blocked' can be deleted via this endpoint.
// (RLS policy enforces this at DB level; we also add .eq('hold_type', 'vendor_blocked')
//  as defense-in-depth.)

import { NextRequest, NextResponse } from 'next/server';
import { withErrorBoundary, HttpError } from '@/lib/api/error-boundary';
import { requireUser } from '@/lib/api/auth';

export const DELETE = withErrorBoundary(
  async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const { supabase } = await requireUser();

    // Defense-in-depth: restrict to vendor_blocked only.
    // RLS also enforces this, but belt-and-suspenders.
    const { data, error } = await supabase
      .from('vendor_calendar_holds')
      .delete()
      .eq('id', id)
      .eq('hold_type', 'vendor_blocked')
      .select('id')
      .maybeSingle();

    if (error) throw new HttpError(500, error.message);
    if (!data) throw new HttpError(404, 'Block not found or not owned by this vendor');

    return NextResponse.json({ ok: true });
  }
);
