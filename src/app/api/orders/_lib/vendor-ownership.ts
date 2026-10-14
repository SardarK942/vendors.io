import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';
import { HttpError } from '@/lib/api/error-boundary';

/**
 * Security gate for vendor-only order actions. Loads the order through the
 * caller's RLS client (404 if invisible) and requires the caller to own the
 * order's vendor profile (403 otherwise). Throws HttpError; returns on success.
 */
export async function assertCallerOwnsOrderVendor(
  supabase: SupabaseClient<Database>,
  userId: string,
  orderId: string
): Promise<void> {
  const { data: order } = await supabase
    .from('orders')
    .select('id, vendor_profile_id')
    .eq('id', orderId)
    .maybeSingle();
  if (!order) throw new HttpError(404, 'Order not found');

  const { data: vendor } = await supabase
    .from('vendor_profiles')
    .select('id')
    .eq('id', order.vendor_profile_id)
    .eq('user_id', userId)
    .maybeSingle();
  if (!vendor) throw new HttpError(403, 'Only the order vendor can perform this action');
}
