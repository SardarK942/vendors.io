import { notFound, redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getActiveVendorProfile } from '@/lib/vendor/active';
import { getOrderForView } from '@/services/order-view.service';
import { getConnectStatus } from '@/services/connect.service';
import { VendorOrderConfirm } from '@/components/shop/VendorOrderConfirm';

export const dynamic = 'force-dynamic';

interface VendorOrderPageProps {
  params: Promise<{ id: string }>;
}

export default async function VendorOrderPage({ params }: VendorOrderPageProps) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (profile?.role !== 'vendor') redirect('/dashboard');

  const { profile: vendorProfile } = await getActiveVendorProfile(supabase, user.id);
  if (!vendorProfile) redirect('/dashboard/profile/setup');

  // Ownership: the order must belong to the active vendor profile (RLS also
  // limits visibility; this keeps multi-business vendors from cross-viewing).
  const { data: owned } = await supabase
    .from('orders')
    .select('id')
    .eq('id', id)
    .eq('vendor_profile_id', vendorProfile.id)
    .maybeSingle();
  if (!owned) notFound();

  const result = await getOrderForView(supabase, { kind: 'id', id });
  if (!result.data) notFound();

  const connect = await getConnectStatus(supabase, vendorProfile.id);

  return (
    <div className="space-y-4">
      <p className="text-xs text-ink-soft">Orders &rsaquo; #{id.slice(0, 8).toUpperCase()}</p>
      <VendorOrderConfirm
        order={result.data}
        chargesEnabled={connect.data?.charges_enabled ?? false}
      />
    </div>
  );
}
