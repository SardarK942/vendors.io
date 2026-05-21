import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';

export interface TeaserMetric {
  count: number;
  prevCount: number;
  delta: number;
}

export interface AnalyticsTeaser {
  views: TeaserMetric;
  inquiries: TeaserMetric;
  bookings: TeaserMetric;
}

const DAY_MS = 86_400_000;

async function countViews(
  supabase: SupabaseClient<Database>,
  vendorProfileId: string,
  sinceISO: string,
  untilISO: string
): Promise<number> {
  const { count } = await supabase
    .from('vendor_profile_views')
    .select('*', { count: 'exact', head: true })
    .eq('vendor_profile_id', vendorProfileId)
    .gte('viewed_at', sinceISO)
    .lt('viewed_at', untilISO);
  return count ?? 0;
}

async function countInquiries(
  supabase: SupabaseClient<Database>,
  vendorProfileId: string,
  sinceISO: string,
  untilISO: string
): Promise<number> {
  const { count } = await supabase
    .from('bookings')
    .select('id', { count: 'exact', head: true })
    .eq('vendor_profile_id', vendorProfileId)
    .gte('created_at', sinceISO)
    .lt('created_at', untilISO);
  return count ?? 0;
}

async function countBookings(
  supabase: SupabaseClient<Database>,
  vendorProfileId: string,
  sinceISO: string,
  untilISO: string
): Promise<number> {
  // Confirmed = deposit_paid (uses deposit_paid_at which exists on bookings).
  // Completed bookings remain counted because they originated as deposit_paid.
  const { count } = await supabase
    .from('bookings')
    .select('id', { count: 'exact', head: true })
    .eq('vendor_profile_id', vendorProfileId)
    .in('status', ['deposit_paid', 'completed'])
    .gte('deposit_paid_at', sinceISO)
    .lt('deposit_paid_at', untilISO);
  return count ?? 0;
}

export async function getAnalyticsTeaser(
  supabase: SupabaseClient<Database>,
  vendorProfileId: string
): Promise<AnalyticsTeaser> {
  const now = Date.now();
  const sevenDaysAgo = new Date(now - 7 * DAY_MS).toISOString();
  const fourteenDaysAgo = new Date(now - 14 * DAY_MS).toISOString();
  const nowISO = new Date(now).toISOString();

  const [views, viewsPrev, inquiries, inquiriesPrev, bookings, bookingsPrev] =
    await Promise.all([
      countViews(supabase, vendorProfileId, sevenDaysAgo, nowISO),
      countViews(supabase, vendorProfileId, fourteenDaysAgo, sevenDaysAgo),
      countInquiries(supabase, vendorProfileId, sevenDaysAgo, nowISO),
      countInquiries(supabase, vendorProfileId, fourteenDaysAgo, sevenDaysAgo),
      countBookings(supabase, vendorProfileId, sevenDaysAgo, nowISO),
      countBookings(supabase, vendorProfileId, fourteenDaysAgo, sevenDaysAgo),
    ]);

  const metric = (count: number, prev: number): TeaserMetric => ({
    count,
    prevCount: prev,
    delta: count - prev,
  });

  return {
    views: metric(views, viewsPrev),
    inquiries: metric(inquiries, inquiriesPrev),
    bookings: metric(bookings, bookingsPrev),
  };
}
