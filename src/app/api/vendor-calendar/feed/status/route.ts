// src/app/api/vendor-calendar/feed/status/route.ts
// Returns the vendor's calendar-feed connection status.

import { withErrorBoundary } from '@/lib/api/error-boundary';
import { requireUser } from '@/lib/api/auth';
import { getActiveVendorProfileId } from '@/lib/vendor/active';
import { getFeedStatus } from '@/services/calendar-feed.service';

export const GET = withErrorBoundary(async (_req: Request) => {
  const { user, supabase } = await requireUser();
  const vendorId = await getActiveVendorProfileId(supabase, user.id);
  if (!vendorId) return Response.json({ error: 'unauthenticated' }, { status: 401 });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const status = await getFeedStatus(supabase, vendorId, appUrl);
  return Response.json(status);
});
