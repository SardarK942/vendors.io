// src/app/api/vendor-calendar/feed/dismiss-nudge/route.ts
// Records that the vendor dismissed the "connect your calendar" nudge.

import { withErrorBoundary, HttpError } from '@/lib/api/error-boundary';
import { requireUser } from '@/lib/api/auth';
import { getActiveVendorProfileId } from '@/lib/vendor/active';

export const POST = withErrorBoundary(async (_req: Request) => {
  const { user, supabase } = await requireUser();
  const vendorId = await getActiveVendorProfileId(supabase, user.id);
  if (!vendorId) return Response.json({ error: 'unauthenticated' }, { status: 401 });

  const { error } = await supabase
    .from('vendor_profiles')
    .update({
      calendar_feed_nudge_dismissed_at: new Date().toISOString(),
    })
    .eq('id', vendorId);

  if (error) throw new HttpError(500, error.message);

  return Response.json({ ok: true });
});
