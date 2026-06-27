// src/app/api/vendor-calendar/feed/disconnect/route.ts
// Clears all calendar-feed connection state, returning the vendor to 'not_connected'.

import { requireUser } from '@/lib/api/auth';
import { getActiveVendorProfileId } from '@/lib/vendor/active';

export async function POST(_req: Request): Promise<Response> {
  const { user, supabase } = await requireUser();
  const vendorId = await getActiveVendorProfileId(supabase, user.id);
  if (!vendorId) return Response.json({ error: 'unauthenticated' }, { status: 401 });

  await supabase
    .from('vendor_profiles')
    .update({
      calendar_feed_state: 'not_connected',
      calendar_feed_intent_at: null,
      calendar_feed_intent_method: null,
      calendar_feed_connected_at: null,
      calendar_feed_connected_via_ua: null,
    })
    .eq('id', vendorId);

  return Response.json({ state: 'not_connected' });
}
