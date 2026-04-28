import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { expireStaleRequests } from '@/services/booking.service';
import {
  autoCompleteBookings,
  recognizePlatformFees,
  redactStaleBookingPii,
} from '@/services/payment.service';
import { withErrorBoundary, HttpError } from '@/lib/api/error-boundary';

export const dynamic = 'force-dynamic';

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get('authorization') ?? '';
  return header === `Bearer ${secret}`;
}

export const POST = withErrorBoundary(async (request: NextRequest) => {
  if (!authorized(request)) throw new HttpError(401, 'Unauthorized');

  const supabase = createServiceRoleClient();
  const started = Date.now();
  const startedIso = new Date(started).toISOString();

  // Open an audit row immediately so we can see runs that never finish.
  const { data: runRow } = await supabase
    .from('cron_runs')
    .insert({ job: 'tick', started_at: startedIso })
    .select('id')
    .single();

  const runId = runRow?.id ?? null;
  let result: {
    expired_bookings: number;
    recognized_transactions: number;
    auto_completed_bookings: number;
    redacted_pii_rows: number;
  } | null = null;
  let errorMessage: string | null = null;

  try {
    const [expired, recognized, completed, redacted] = await Promise.all([
      expireStaleRequests(supabase),
      recognizePlatformFees(supabase),
      autoCompleteBookings(supabase),
      redactStaleBookingPii(supabase),
    ]);

    result = {
      expired_bookings: expired,
      recognized_transactions: recognized.recognized,
      auto_completed_bookings: completed.completed,
      redacted_pii_rows: redacted.redacted,
    };
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
    console.error('[cron/tick] failed', err);
  }

  const ended = Date.now();

  if (runId) {
    await supabase
      .from('cron_runs')
      .update({
        completed_at: new Date(ended).toISOString(),
        duration_ms: ended - started,
        result,
        error: errorMessage,
      })
      .eq('id', runId);
  }

  if (errorMessage) {
    return NextResponse.json({ ok: false, error: errorMessage, run_id: runId }, { status: 500 });
  }

  return NextResponse.json(
    {
      ok: true,
      run_id: runId,
      ran_at: startedIso,
      ...result,
    },
    { status: 200 }
  );
});

export const GET = POST;
