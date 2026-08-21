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
  sendVendorOnboardingNudge1,
  sendVendorOnboardingNudge2,
  type SuggestedVendor,
} from '@/lib/email/resend';
import { getRecentActiveVendors } from '@/services/vendor.service';
import { createClient } from '@supabase/supabase-js';
import {
  liveUserIds,
  selectUnconfirmedVendorNudge,
  selectOnboardingNudge24h,
  selectOnboardingNudge7d,
  DEFAULT_BATCH_CAP,
  type NudgeUser,
} from '@/lib/onboarding/nudge-candidates';

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
  try {
    await runVendorOnboardingNudges();
  } catch (err) {
    console.error('[cron] vendor onboarding nudges failed:', err);
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
    .overlaps('services', [category])
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

/**
 * Vendor onboarding nudges (spec 2026-08-21-vendor-onboarding-nudge-design):
 *   A) unconfirmed vendors        → re-send branded confirmation (auth.resend)
 *   B1) confirmed, never live      → "finish your profile" (first reminder)
 *   B2) still not live 6d after B1 → last-call reminder
 * Shared data is fetched once; each segment runs in its own try/catch so one
 * failure doesn't block the others. Each segment is capped per run.
 */
async function runVendorOnboardingNudges(): Promise<void> {
  const supabase = createServiceRoleClient();

  // Vendor users + their nudge markers.
  const { data: vendorRows } = await supabase
    .from('users')
    .select(
      'id, email, full_name, role, created_at, confirm_nudge_sent_at, onboarding_nudge_24h_sent_at, onboarding_nudge_7d_sent_at'
    )
    .eq('role', 'vendor');

  // Confirmation state (auth schema isn't exposed via PostgREST) — build a set
  // of confirmed user ids from the Admin API.
  const confirmedIds = new Set<string>();
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) break;
    for (const u of data.users) if (u.email_confirmed_at) confirmedIds.add(u.id);
    if (data.users.length < 1000) break;
  }

  // Live = any completed profile.
  const { data: profiles } = await supabase
    .from('vendor_profiles')
    .select('user_id, onboarding_complete');
  const live = liveUserIds(profiles ?? []);

  const users: NudgeUser[] = (vendorRows ?? []).map((u) => ({
    id: u.id,
    email: u.email,
    full_name: u.full_name,
    role: u.role,
    created_at: u.created_at,
    confirmed: confirmedIds.has(u.id),
    confirm_nudge_sent_at: u.confirm_nudge_sent_at,
    onboarding_nudge_24h_sent_at: u.onboarding_nudge_24h_sent_at,
    onboarding_nudge_7d_sent_at: u.onboarding_nudge_7d_sent_at,
  }));
  const now = Date.now();

  // Anon client for public auth operations (resend confirmation).
  const anon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // ── Segment A: re-send confirmation ────────────────────────────────────────
  try {
    const candidates = selectUnconfirmedVendorNudge(users, now);
    if (candidates.length === DEFAULT_BATCH_CAP) {
      console.log('[cron] unconfirmed-vendor nudge hit batch cap; remainder next run');
    }
    for (const u of candidates) {
      if (!u.email) continue;
      const { error } = await anon.auth.resend({ type: 'signup', email: u.email });
      if (error) {
        console.error('[cron] resend confirmation failed for', u.id, error.message);
        continue;
      }
      await supabase
        .from('users')
        .update({ confirm_nudge_sent_at: new Date().toISOString() })
        .eq('id', u.id);
    }
  } catch (err) {
    console.error('[cron] segment A (unconfirmed) failed:', err);
  }

  // ── Segment B step 1 ───────────────────────────────────────────────────────
  try {
    const candidates = selectOnboardingNudge24h(users, live, now);
    if (candidates.length === DEFAULT_BATCH_CAP) {
      console.log('[cron] onboarding nudge (step 1) hit batch cap; remainder next run');
    }
    for (const u of candidates) {
      if (!u.email) continue;
      const ok = await sendVendorOnboardingNudge1(u.email, u.id);
      if (!ok) continue;
      await supabase
        .from('users')
        .update({ onboarding_nudge_24h_sent_at: new Date().toISOString() })
        .eq('id', u.id);
    }
  } catch (err) {
    console.error('[cron] segment B step 1 failed:', err);
  }

  // ── Segment B step 2 ───────────────────────────────────────────────────────
  try {
    const candidates = selectOnboardingNudge7d(users, live, now);
    if (candidates.length === DEFAULT_BATCH_CAP) {
      console.log('[cron] onboarding nudge (step 2) hit batch cap; remainder next run');
    }
    for (const u of candidates) {
      if (!u.email) continue;
      const ok = await sendVendorOnboardingNudge2(u.email, u.id);
      if (!ok) continue;
      await supabase
        .from('users')
        .update({ onboarding_nudge_7d_sent_at: new Date().toISOString() })
        .eq('id', u.id);
    }
  } catch (err) {
    console.error('[cron] segment B step 2 failed:', err);
  }
}

export const GET = POST;
