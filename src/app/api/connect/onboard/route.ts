import { NextRequest, NextResponse } from 'next/server';
import { withErrorBoundary, HttpError } from '@/lib/api/error-boundary';
import { requireUser } from '@/lib/api/auth';
import { getActiveVendorProfileId } from '@/lib/vendor/active';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { getOrCreateConnectAccount, createOnboardingLink } from '@/services/connect.service';

export const POST = withErrorBoundary(async (request: NextRequest) => {
  const { user, supabase } = await requireUser();

  const gate = await checkRateLimit(
    request,
    'connect:onboard',
    { limit: 5, window: '10 m' },
    user.id
  );
  if (!gate.ok) throw new HttpError(429, gate.message!);

  const vendorProfileId = await getActiveVendorProfileId(supabase, user.id);
  if (!vendorProfileId) throw new HttpError(403, 'No vendor profile found for this user');

  const serviceClient = createServiceRoleClient();
  const account = await getOrCreateConnectAccount(supabase, serviceClient, vendorProfileId);
  if (account.error) {
    return NextResponse.json({ error: account.error }, { status: account.status });
  }

  const origin = process.env.NEXT_PUBLIC_APP_URL!;
  const link = await createOnboardingLink(account.data!.accountId, origin);
  if (link.error) {
    return NextResponse.json({ error: link.error }, { status: link.status });
  }

  return NextResponse.json({ data: link.data }, { status: 200 });
});
