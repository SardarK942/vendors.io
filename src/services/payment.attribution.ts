// payment.attribution.ts — client-safe attribution helpers extracted from payment.service.ts
// so that EarningsCard (a 'use client' component) can import them without pulling in
// server-only code (next/headers via supabase/server.ts).

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, BookingStatus } from '@/types/database.types';
import { DEPOSIT_RATE } from '@/lib/utils';

export type AttributionRange = 'month' | 'quarter' | 'year' | 'all';

export interface Attribution {
  totalCents: number;
  bookingCount: number;
  platformFeeCents: number;
  netCents: number;
  roiMultiple: number;
}

const QUALIFYING_STATUSES = [
  'accepted',
  'adjusted_quote_sent',
  'couple_countered',
  'deposit_paid',
  'completed',
] as const;

function rangeStartDate(range: AttributionRange): Date | null {
  if (range === 'all') return null;
  const now = new Date();
  if (range === 'month') {
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }
  if (range === 'quarter') {
    const q = Math.floor(now.getMonth() / 3);
    return new Date(now.getFullYear(), q * 3, 1);
  }
  // year
  return new Date(now.getFullYear(), 0, 1);
}

export async function getVendorAttribution(
  supabase: SupabaseClient<Database>,
  vendorProfileId: string,
  range: AttributionRange
): Promise<Attribution> {
  let query = supabase
    .from('bookings')
    .select('total_price_cents, status, created_at')
    .eq('vendor_profile_id', vendorProfileId)
    .in('status', QUALIFYING_STATUSES as unknown as BookingStatus[]);

  const start = rangeStartDate(range);
  if (start) {
    query = query.gte('created_at', start.toISOString());
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`getVendorAttribution failed: ${error.message}`);
  }

  const rows = data ?? [];
  const totalCents = rows.reduce((sum, r) => sum + (r.total_price_cents ?? 0), 0);
  const bookingCount = rows.length;
  const platformFeeCents = Math.round(totalCents * DEPOSIT_RATE);
  const netCents = totalCents - platformFeeCents;
  const roiMultiple = platformFeeCents > 0 ? Math.round(totalCents / platformFeeCents) : 0;

  return { totalCents, bookingCount, platformFeeCents, netCents, roiMultiple };
}
