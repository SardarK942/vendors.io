// src/app/api/vendor-calendar/feed/rotate/route.ts
// Rotates the vendor's feed token (invalidates all existing calendar subscriptions).

import { requireUser } from '@/lib/api/auth';
import { getActiveVendorProfileId } from '@/lib/vendor/active';
import { rotateFeedToken } from '@/services/calendar-feed.service';

export async function POST(_req: Request): Promise<Response> {
  const { user, supabase } = await requireUser();
  const vendorId = await getActiveVendorProfileId(supabase, user.id);
  if (!vendorId) return Response.json({ error: 'unauthenticated' }, { status: 401 });

  const token = await rotateFeedToken(supabase, vendorId);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  return Response.json({ state: 'not_connected', feed_url: `${appUrl}/api/cal/${token}.ics` });
}
