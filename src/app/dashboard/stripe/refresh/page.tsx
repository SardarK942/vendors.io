import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import StripeRefreshContent from './StripeRefreshContent';

export const dynamic = 'force-dynamic';

export default async function StripeRefreshPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: vendorProfile } = await supabase
    .from('vendor_profiles')
    .select('payment_mode')
    .eq('user_id', user.id)
    .maybeSingle();

  if ((vendorProfile as { payment_mode?: string | null } | null)?.payment_mode === 'cash') {
    redirect('/dashboard');
  }

  return <StripeRefreshContent />;
}
