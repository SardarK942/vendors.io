import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/api/auth';
import { withErrorBoundary } from '@/lib/api/error-boundary';
import { promoteScrapedVendor } from '@/lib/scraped-vendor/promote';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({ scrapedVendorId: z.string().uuid() });

export const POST = withErrorBoundary(async (req: NextRequest) => {
  const { user } = await requireUser();
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }
  try {
    const profile = await promoteScrapedVendor(parsed.data.scrapedVendorId, user.id);
    return NextResponse.json({ profile });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'promote failed' },
      { status: 400 }
    );
  }
});
