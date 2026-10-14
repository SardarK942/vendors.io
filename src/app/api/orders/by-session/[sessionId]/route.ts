import { NextRequest, NextResponse } from 'next/server';
import { withErrorBoundary, HttpError } from '@/lib/api/error-boundary';
import { requireUser } from '@/lib/api/auth';

type Ctx = { params: Promise<{ sessionId: string }> };

// The order is created asynchronously by the Stripe webhook, so a clean 404
// is expected for a short window after checkout; the page polls.
export const GET = withErrorBoundary(async (_request: NextRequest, { params }: Ctx) => {
  const { user, supabase } = await requireUser();
  const { sessionId } = await params;

  const { data, error } = await supabase
    .from('orders')
    .select('*, order_items(*)')
    .eq('stripe_checkout_session_id', sessionId)
    .eq('buyer_user_id', user.id)
    .maybeSingle();
  if (error) throw new HttpError(500, error.message);
  if (!data) throw new HttpError(404, 'Order not found');

  return NextResponse.json({ data });
});
