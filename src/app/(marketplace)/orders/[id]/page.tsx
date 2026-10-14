import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getOrderForView } from '@/services/order-view.service';
import { OrderConfirmation } from '@/components/shop/OrderConfirmation';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Your order' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?redirect=/orders/${encodeURIComponent(id)}`);
  if (!UUID.test(id)) notFound();

  // RLS limits visibility to the buyer or the owning vendor.
  const result = await getOrderForView(supabase, { kind: 'id', id });
  if (!result.data) notFound();

  return <OrderConfirmation order={result.data} />;
}
