// src/app/api/vendor-calendar/feed/intent/route.ts
// Records the vendor's intent to connect a calendar app and flips state to 'pending'.

import { withErrorBoundary, HttpError } from '@/lib/api/error-boundary';
import { requireUser } from '@/lib/api/auth';
import { getActiveVendorProfileId } from '@/lib/vendor/active';
import { getOrCreateFeedToken } from '@/services/calendar-feed.service';

const VALID_METHODS = new Set(['google', 'apple', 'outlook', 'copy']);

export const POST = withErrorBoundary(async (req: Request) => {
  const { user, supabase } = await requireUser();
  const vendorId = await getActiveVendorProfileId(supabase, user.id);
  if (!vendorId) return Response.json({ error: 'unauthenticated' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const method = body?.method;
  if (!VALID_METHODS.has(method)) {
    return Response.json({ error: 'invalid_method' }, { status: 400 });
  }

  const token = await getOrCreateFeedToken(supabase, vendorId);

  const { error } = await supabase
    .from('vendor_profiles')
    .update({
      calendar_feed_state: 'pending',
      calendar_feed_intent_at: new Date().toISOString(),
      calendar_feed_intent_method: method,
    })
    .eq('id', vendorId);

  if (error) throw new HttpError(500, error.message);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  return Response.json({ state: 'pending', feed_url: `${appUrl}/api/cal/${token}.ics` });
});
