import { NextRequest, NextResponse } from 'next/server';
import { withErrorBoundary, HttpError } from '@/lib/api/error-boundary';
import { requireUser } from '@/lib/api/auth';
import { checkRateLimit } from '@/lib/rate-limit';
import { updateCartItemSchema } from '@/lib/shop/schemas';
import { updateItem, removeItem } from '@/services/cart.service';

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = withErrorBoundary(async (request: NextRequest, { params }: Ctx) => {
  const { user, supabase } = await requireUser();

  const gate = await checkRateLimit(request, 'cart:update', { limit: 60, window: '10 m' }, user.id);
  if (!gate.ok) throw new HttpError(429, gate.message!);

  const { id } = await params;
  const patch = updateCartItemSchema.parse(await request.json());
  const result = await updateItem(supabase, user.id, id, patch);
  return NextResponse.json(result.data ?? { error: result.error }, { status: result.status });
});

export const DELETE = withErrorBoundary(async (request: NextRequest, { params }: Ctx) => {
  const { user, supabase } = await requireUser();

  const gate = await checkRateLimit(request, 'cart:remove', { limit: 60, window: '10 m' }, user.id);
  if (!gate.ok) throw new HttpError(429, gate.message!);

  const { id } = await params;
  const result = await removeItem(supabase, user.id, id);
  return NextResponse.json(result.data ?? { error: result.error }, { status: result.status });
});
