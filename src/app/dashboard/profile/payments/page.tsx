import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { getActiveVendorProfileId } from '@/lib/vendor/active';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getConnectStatus, refreshAccountStatus } from '@/services/connect.service';
import { PaymentsClient } from './PaymentsClient';

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ return?: string }>;
}) {
  const { user, supabase } = await requireUser();
  const vendorProfileId = await getActiveVendorProfileId(supabase, user.id);
  if (!vendorProfileId) redirect('/dashboard');

  const sp = await searchParams;

  // On return from Stripe, pull the freshest status before rendering (the
  // webhook may not have landed yet).
  if (sp.return === '1') {
    const service = createServiceRoleClient();
    const { data: row } = await service
      .from('vendor_stripe_accounts')
      .select('stripe_account_id')
      .eq('vendor_profile_id', vendorProfileId)
      .maybeSingle();
    if (row) await refreshAccountStatus(service, row.stripe_account_id);
  }

  const status = await getConnectStatus(supabase, vendorProfileId);
  return <PaymentsClient status={status.data!} />;
}
