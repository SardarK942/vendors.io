import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { runSweep } from '@/services/docuseal.service';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return (request.headers.get('authorization') ?? '') === `Bearer ${secret}`;
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const res = await runSweep(createServiceRoleClient());
  if (res.error || !res.data) {
    logger.error('contract-sweep: runSweep failed', { error: res.error });
    return NextResponse.json({ ok: false, error: res.error }, { status: 500 });
  }
  return NextResponse.json(res.data);
}

// Vercel Cron issues GET requests.
export const GET = POST;
