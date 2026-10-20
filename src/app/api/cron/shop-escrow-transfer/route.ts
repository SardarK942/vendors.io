import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { transferHeldEarnings } from '@/services/escrow-transfer.service';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return (request.headers.get('authorization') ?? '') === `Bearer ${secret}`;
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ ok: false }, { status: 401 });
  const db = createServiceRoleClient();

  // Distinct vendors with at least one held row.
  const { data: rows, error } = await db
    .from('vendor_ledger')
    .select('vendor_profile_id')
    .eq('status', 'held');
  if (error) {
    logger.error('shop-escrow-transfer: held query failed', { error: error.message });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
  const vendorIds = Array.from(new Set((rows ?? []).map((r) => r.vendor_profile_id)));

  let transferred = 0;
  let failed = 0;
  for (const vid of vendorIds) {
    try {
      const r = await transferHeldEarnings(db, vid);
      transferred += r.transferredCount;
      failed += r.failed;
    } catch (err) {
      logger.error('shop-escrow-transfer: vendor sweep failed', err, { vendorProfileId: vid });
      failed++;
    }
  }
  return NextResponse.json({ vendors: vendorIds.length, transferred, failed });
}

// Vercel Cron issues GET requests.
export const GET = POST;
