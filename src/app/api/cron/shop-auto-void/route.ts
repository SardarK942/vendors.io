import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { autoVoidExpired, sweepStaleCheckoutSnapshots } from '@/services/orders.service';
import { selectReminderOrders } from '@/lib/shop/reminders';
import { notifyShopConfirmReminder } from '@/services/shop-notifications.service';
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

  const db = createServiceRoleClient();
  const now = new Date();

  // (a) Mid-window reminders: pending orders ~24h from their deadline.
  let reminded = 0;
  const { data: pending, error: pendingErr } = await db
    .from('orders')
    .select('id, status, confirm_deadline_at')
    .eq('status', 'pending_confirmation');
  if (pendingErr) {
    logger.error('shop-auto-void: reminder query failed', { error: pendingErr.message });
  } else {
    for (const order of selectReminderOrders(pending ?? [], now)) {
      try {
        await notifyShopConfirmReminder(db, order.id);
      } catch (err) {
        logger.error('shop-auto-void: reminder notification failed', err, { orderId: order.id });
      }
      reminded++;
    }
  }

  // (b) Void expired pending orders.
  const voidRes = await autoVoidExpired(db);
  if (voidRes.error)
    logger.error('shop-auto-void: autoVoidExpired failed', { error: voidRes.error });

  // (c) Sweep orphaned checkout snapshots.
  const sweepRes = await sweepStaleCheckoutSnapshots(db);
  if (sweepRes.error) {
    logger.error('shop-auto-void: snapshot sweep failed', { error: sweepRes.error });
  }

  return NextResponse.json({
    reminded,
    voided: voidRes.data?.voided ?? 0,
    swept: sweepRes.data?.swept ?? 0,
  });
}

// Vercel Cron issues GET requests.
export const GET = POST;
