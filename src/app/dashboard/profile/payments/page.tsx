import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { getActiveVendorProfile } from '@/lib/vendor/active';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getConnectStatus, refreshAccountStatus } from '@/services/connect.service';
import { PaymentsClient } from './PaymentsClient';

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ return?: string }>;
}) {
  const { user, supabase } = await requireUser();
  const { profile } = await getActiveVendorProfile(supabase, user.id);
  if (!profile || profile.category !== 'bridal_wear' || profile.vendor_origin !== 'local') {
    redirect('/dashboard');
  }
  const vendorProfileId = profile.id;

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
    if (row) {
      try {
        await refreshAccountStatus(service, row.stripe_account_id);
      } catch (err) {
        // Transient Stripe error: fall through to the DB-backed status.
        console.error('payments: refreshAccountStatus failed', err);
      }
    }
  }

  const status = await getConnectStatus(supabase, vendorProfileId);
  return <PaymentsClient status={status.data!} />;
}
