import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorBoundary, HttpError } from '@/lib/api/error-boundary';
import { requireUser } from '@/lib/api/auth';
import { checkRateLimit } from '@/lib/rate-limit';

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  city: z.string().max(80).nullable().optional(),
  total_budget_cents: z.number().int().nonnegative().max(1_000_000_000).nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
});

export const PATCH = withErrorBoundary(
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const { user, supabase } = await requireUser();
    const gate = await checkRateLimit(
      request,
      'events:update',
      { limit: 60, window: '1 h' },
      user.id
    );
    if (!gate.ok) throw new HttpError(429, gate.message!);

    const parsed = patchSchema.parse(await request.json());
    const { error } = await supabase
      .from('events')
      .update({ ...parsed, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('couple_user_id', user.id);
    if (error) throw new HttpError(500, error.message);
    return NextResponse.json({ ok: true });
  }
);

export const DELETE = withErrorBoundary(
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const { user, supabase } = await requireUser();
    const { error } = await supabase
      .from('events')
      .delete()
      .eq('id', id)
      .eq('couple_user_id', user.id);
    if (error) throw new HttpError(500, error.message);
    return NextResponse.json({ ok: true });
  }
);
