import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { expireStaleRequests, autoCancelExpiredBookings } from '@/services/booking.service';
import {
  autoCompleteBookings,
  recognizePlatformFees,
  redactStaleBookingPii,
} from '@/services/payment.service';
import { withErrorBoundary, HttpError } from '@/lib/api/error-boundary';
import {
  sendCustomer48hFollowupEmail,
  sendVendor48hFollowupEmail,
  type SuggestedVendor,
} from '@/lib/email/resend';
import { getRecentActiveVendors } from '@/services/vendor.service';

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
    auto_cancelled_bookings: number;
    recognized_transactions: number;
    auto_completed_bookings: number;
    redacted_pii_rows: number;
  } | null = null;
  let errorMessage: string | null = null;

  try {
    const [expired, autoCancelled, recognized, completed, redacted] = await Promise.all([
      expireStaleRequests(supabase),
      autoCancelExpiredBookings(supabase),
      recognizePlatformFees(supabase),
      autoCompleteBookings(supabase),
      redactStaleBookingPii(supabase),
    ]);

    result = {
      expired_bookings: expired,
      auto_cancelled_bookings: autoCancelled,
      recognized_transactions: recognized.recognized,
      auto_completed_bookings: completed.bookings_completed,
      redacted_pii_rows: redacted.redacted,
    };
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
    console.error('[cron/tick] failed', err);
  }

  // 48-hour follow-up emails — each is independent; one failure must not block the other.
  try {
    await runCustomer48hFollowup();
  } catch (err) {
    console.error('[cron] customer 48h followup failed:', err);
  }
  try {
    await runVendor48hFollowup();
  } catch (err) {
    console.error('[cron] vendor 48h followup failed:', err);
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

// ─── 48-Hour Follow-Up Helpers ────────────────────────────────────────────────

async function runCustomer48hFollowup(): Promise<void> {
  const supabase = createServiceRoleClient();
  const now = new Date();
  // 24h-wide window (36h-60h since signup) — sized to overlap with the daily
  // cron schedule regardless of when the user signed up. The followup_48h_sent_at
  // gate prevents double-fires if a user falls into multiple consecutive runs.
  const windowStart = new Date(now.getTime() - 60 * 3600 * 1000).toISOString();
  const windowEnd = new Date(now.getTime() - 36 * 3600 * 1000).toISOString();

  const { data: candidates } = await supabase
    .from('users')
    .select(
      'id, email, full_name, onboarding_data, followup_48h_sent_at, role, onboarding_completed_at'
    )
    .eq('role', 'couple')
    .gte('onboarding_completed_at', windowStart)
    .lte('onboarding_completed_at', windowEnd)
    .is('followup_48h_sent_at', null);

  for (const user of candidates ?? []) {
    const { count: bookingCount } = await supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('couple_user_id', user.id);
    if ((bookingCount ?? 0) > 0) continue;

    const data = (user.onboarding_data ?? {}) as {
      event_date?: string | null;
      categories?: string[] | null;
      just_browsing?: boolean | null;
    };
    const hasEvent = !data.just_browsing && !!data.event_date;
    const primaryCategory = data.categories?.[0] ?? null;
    const daysUntilEvent =
      hasEvent && data.event_date
        ? Math.max(0, Math.ceil((new Date(data.event_date).getTime() - now.getTime()) / 86_400_000))
        : null;

    const vendors = primaryCategory
      ? await getRecentActiveVendorsByCategory(supabase, primaryCategory, 3)
      : await getRecentActiveVendors(supabase, 3);

    const suggested: SuggestedVendor[] = vendors.map((v) => ({
      name: v.business_name ?? 'Vendor',
      slug: v.slug ?? '',
      category: v.category ?? 'vendor',
      thumbnail_url:
        Array.isArray(v.portfolio_images) && v.portfolio_images.length > 0
          ? (v.portfolio_images[0] as string)
          : null,
    }));

    const firstName = (user.full_name ?? '').split(' ')[0] || 'there';

    await sendCustomer48hFollowupEmail(
      user.email,
      firstName,
      hasEvent,
      'wedding',
      data.event_date ?? null,
      daysUntilEvent,
      suggested,
      primaryCategory,
      user.id
    );

    await supabase
      .from('users')
      .update({ followup_48h_sent_at: new Date().toISOString() })
      .eq('id', user.id);
  }
}

type VendorCategory = NonNullable<
  import('@/types/database.types').Database['public']['Tables']['vendor_profiles']['Row']['category']
>;

async function getRecentActiveVendorsByCategory(
  supabase: ReturnType<typeof createServiceRoleClient>,
  category: string,
  limit: number
) {
  const { data } = await supabase
    .from('vendor_profiles')
    .select('*')
    .eq('is_active', true)
    .eq('onboarding_complete', true)
    .eq('category', category as VendorCategory)
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(limit);
  return data ?? [];
}

async function runVendor48hFollowup(): Promise<void> {
  const supabase = createServiceRoleClient();
  const now = new Date();
  // 24h-wide window (36h-60h since signup) — sized to overlap with the daily
  // cron schedule regardless of when the user signed up. The followup_48h_sent_at
  // gate prevents double-fires if a user falls into multiple consecutive runs.
  const windowStart = new Date(now.getTime() - 60 * 3600 * 1000).toISOString();
  const windowEnd = new Date(now.getTime() - 36 * 3600 * 1000).toISOString();

  const { data: candidates } = await supabase
    .from('vendor_profiles')
    .select('id, business_name, user_id, published_at, followup_48h_sent_at, users!user_id(email)')
    .gte('published_at', windowStart)
    .lte('published_at', windowEnd)
    .is('followup_48h_sent_at', null);

  for (const vp of candidates ?? []) {
    const { count: bookingCount } = await supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('vendor_profile_id', vp.id);
    if ((bookingCount ?? 0) > 0) continue;

    const u = Array.isArray(vp.users) ? vp.users[0] : vp.users;
    if (!u?.email) continue;

    await sendVendor48hFollowupEmail(u.email, vp.business_name ?? 'Vendor', vp.user_id);
    await supabase
      .from('vendor_profiles')
      .update({ followup_48h_sent_at: new Date().toISOString() })
      .eq('id', vp.id);
  }
}

export const GET = POST;
