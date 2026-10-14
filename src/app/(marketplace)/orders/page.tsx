import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getOrderForView } from '@/services/order-view.service';
import { OrderConfirmation } from '@/components/shop/OrderConfirmation';
import { OrderFinalizing } from '@/components/shop/OrderFinalizing';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Your orders' };

// Stripe success_url lands here with ?session_id=. The order is created
// asynchronously by the webhook, so it may not exist on first load; in that case
// render a self-refreshing pending state. Without a session_id, show the buyer's
// most recent order.
export default async function OrdersLandingPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string | string[] }>;
}) {
  const { session_id } = await searchParams;
  const sessionId = typeof session_id === 'string' && session_id ? session_id : null;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    const target = sessionId ? `/orders?session_id=${encodeURIComponent(sessionId)}` : '/orders';
    redirect(`/login?redirect=${encodeURIComponent(target)}`);
  }

  const result = await getOrderForView(
    supabase,
    sessionId
      ? { kind: 'session', sessionId, buyerId: user.id }
      : { kind: 'latest', buyerId: user.id }
  );

  if (result.data) return <OrderConfirmation order={result.data} />;
  if (sessionId) return <OrderFinalizing />;
  redirect('/shop');
}
