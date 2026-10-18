import { NextRequest, NextResponse } from 'next/server';
import { withErrorBoundary, HttpError } from '@/lib/api/error-boundary';
import { requireUser } from '@/lib/api/auth';
import { checkRateLimit } from '@/lib/rate-limit';
import { addCartItemSchema } from '@/lib/shop/schemas';
import { addItem } from '@/services/cart.service';

export const POST = withErrorBoundary(async (request: NextRequest) => {
  const { user, supabase } = await requireUser();

  const gate = await checkRateLimit(request, 'cart:add', { limit: 60, window: '10 m' }, user.id);
  if (!gate.ok) throw new HttpError(429, gate.message!);

  const body = addCartItemSchema.parse(await request.json());
  const result = await addItem(supabase, user.id, {
    productId: body.product_id,
    variantId: body.variant_id,
    quantity: body.quantity,
  });
  return NextResponse.json(result.data ?? { error: result.error }, { status: result.status });
});
