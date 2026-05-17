// src/app/api/vendors/[slug]/availability/route.ts
// Sub-project G2.1 — Public availability endpoint.
// No auth required — couples browsing without logging in still need this.
// Returns aggregated (privacy-preserving) unavailable date ranges with 60s CDN cache.

import { NextRequest, NextResponse } from 'next/server';
import { withErrorBoundary, HttpError } from '@/lib/api/error-boundary';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getUnavailableRanges } from '@/services/availability.service';

export const dynamic = 'force-dynamic';

/**
 * Parse a Postgres tstzrange literal into [startIso, endIso].
 *
 * Supabase returns tstzrange in the standard Postgres form:
 *   ["2026-08-15T10:00:00+00:00","2026-08-15T12:00:00+00:00")
 *
 * The regex handles this canonical format. If Supabase returns a slightly
 * different form (comma-separated, Z suffix, etc.), we also try a looser parse.
 */
function parseTstzrange(range: string): [string, string] {
  // Canonical form: ["START","END")
  const m = range.match(/^\["([^"]+)","([^"]+)"\)$/);
  if (m) return [m[1], m[2]];

  // Looser: might appear without quotes around the whole range
  // e.g. [2026-08-15 10:00:00+00,2026-08-15 12:00:00+00)
  const m2 = range.match(/^\[([^,]+),([^)]+)\)$/);
  if (m2) {
    const start = m2[1].trim().replace(' ', 'T').replace('+00', '+00:00');
    const end = m2[2].trim().replace(' ', 'T').replace('+00', '+00:00');
    return [start, end];
  }

  throw new Error(`Unrecognised tstzrange format: ${range}`);
}

/** Difference in minutes between two 'HH:mm' strings. */
function minutesBetween(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  return eh * 60 + em - (sh * 60 + sm);
}

export const GET = withErrorBoundary(
  async (_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) => {
    const { slug } = await params;
    const supabase = await createServerSupabaseClient();

    // Vendor must be published/active — unpublished vendors don't expose availability.
    const { data: vendor } = await supabase
      .from('vendor_profiles')
      .select('id, concurrent_capacity')
      .eq('slug', slug)
      .eq('is_active', true)
      .eq('onboarding_complete', true)
      .maybeSingle();

    if (!vendor) throw new HttpError(404, 'Vendor not found');

    const today = new Date().toISOString().slice(0, 10);
    const oneYearOut = new Date();
    oneYearOut.setFullYear(oneYearOut.getFullYear() + 1);
    const toDate = oneYearOut.toISOString().slice(0, 10);

    const ranges = await getUnavailableRanges(supabase, vendor.id, today, toDate);

    // Privacy-preserving aggregation: group holds by date, produce per-date busy_ranges.
    // fully_blocked = sum of busy minutes for that date >= 24h * capacity.
    // This uses the "sum minutes" approach (more general than "full-day hold" detection):
    //   - For capacity-1, 1440+ minutes of holds means the day is 100% busy.
    //   - For capacity-N, N * 1440 minutes across overlapping windows = fully saturated.
    // Known limitation: overlapping holds are counted independently, so two overlapping
    // 12-hour holds on capacity-1 would sum to 1440 min and show as fully_blocked even
    // though only one 12-hour slot is actually occupied. Acceptable for MVP display purposes;
    // the DB trigger is the authoritative conflict check.
    const byDate = new Map<string, Array<{ start: string; end: string; displayEnd: string }>>();

    for (const { hold_range } of ranges) {
      const [startIso, endIso] = parseTstzrange(hold_range);
      const startDate = startIso.slice(0, 10);
      const endDate = endIso.slice(0, 10);

      // Extract HH:mm times (handles both +00:00 and Z suffix).
      const startTime = startIso.slice(11, 16); // 'HH:mm'

      // If the hold spans into the next day, the end-of-day contribution for startDate
      // is "24:00" (i.e., midnight = 1440 min from 00:00). We represent this as '24:00'
      // so minutesBetween can handle it correctly. For display purposes (busy_ranges),
      // we cap at '23:59' so UI renders cleanly.
      const crossesMidnight = endDate !== startDate;
      const endTime = crossesMidnight ? '24:00' : endIso.slice(11, 16);
      const displayEndTime = crossesMidnight ? '23:59' : endIso.slice(11, 16);

      if (!byDate.has(startDate)) byDate.set(startDate, []);
      // Store minutesBetween-compatible endTime internally; displayEndTime for output.
      byDate.get(startDate)!.push({ start: startTime, end: endTime, displayEnd: displayEndTime });
    }

    const unavailable = Array.from(byDate.entries()).map(([date, busy]) => {
      const totalBusyMinutes = busy.reduce(
        (acc, r) => acc + minutesBetween(r.start, r.end),
        0
      );
      const fullyBlocked = totalBusyMinutes >= 24 * 60 * vendor.concurrent_capacity;
      return {
        date,
        fully_blocked: fullyBlocked,
        // When fully blocked, omit busy_ranges — no extra detail needed (and privacy preserved).
        // Use displayEnd for output so UI gets clean HH:mm (no '24:00').
        busy_ranges: fullyBlocked ? [] : busy.map((r) => ({ start: r.start, end: r.displayEnd })),
      };
    });

    return NextResponse.json(
      { unavailable, capacity: vendor.concurrent_capacity },
      {
        headers: {
          'Cache-Control': 's-maxage=60, stale-while-revalidate=120',
        },
      }
    );
  }
);
