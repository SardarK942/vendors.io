// src/app/api/vendor-calendar/feed/dismiss-nudge/route.ts
// Records that the vendor dismissed the "connect your calendar" nudge.

import { requireUser } from '@/lib/api/auth';
import { getActiveVendorProfileId } from '@/lib/vendor/active';

export async function POST(_req: Request): Promise<Response> {
  const { user, supabase } = await requireUser();
  const vendorId = await getActiveVendorProfileId(supabase, user.id);
  if (!vendorId) return Response.json({ error: 'unauthenticated' }, { status: 401 });

  await supabase
    .from('vendor_profiles')
    .update({
      calendar_feed_nudge_dismissed_at: new Date().toISOString(),
    })
    .eq('id', vendorId);

  return Response.json({ ok: true });
}
