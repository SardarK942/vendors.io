import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/api/auth';
import { withErrorBoundary } from '@/lib/api/error-boundary';
import { findMatches } from '@/lib/scraped-vendor/match';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  businessName: z.string().default(''),
  city: z.string().default(''),
  instagramHandle: z.string().nullable().default(null),
  phone: z.string().nullable().default(null),
});

export const POST = withErrorBoundary(async (req: NextRequest) => {
  // requireUser throws HttpError(401) which the boundary converts to a 401 response.
  await requireUser();

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }

  const matches = await findMatches({
    businessName: parsed.data.businessName,
    city: parsed.data.city,
    instagramHandle: parsed.data.instagramHandle,
    phone: parsed.data.phone,
  });

  return NextResponse.json({ matches });
});
