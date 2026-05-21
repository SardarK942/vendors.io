import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getBookingRequests } from '@/services/booking.service';
import type { Database } from '@/types/database.types';

type BookingStatus = Database['public']['Tables']['bookings']['Row']['status'];

const TAB_STATUSES: Record<string, BookingStatus[] | undefined> = {
  active: ['pending', 'accepted', 'adjusted_quote_sent', 'adjusted_quote_declined', 'deposit_paid'],
  upcoming: ['deposit_paid'],
  past: ['completed'],
  cancelled: ['couple_cancelled', 'vendor_cancelled', 'cancelled_mutual', 'expired'],
};

export async function GET(req: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const tab = url.searchParams.get('tab') ?? 'all';
  const cursor = url.searchParams.get('cursor') ?? undefined;
  const q = url.searchParams.get('q') ?? undefined;
  const status = TAB_STATUSES[tab];

  const result = await getBookingRequests(supabase, user.id, 'vendor', {
    status,
    q,
    cursor,
    limit: 25,
  });

  return NextResponse.json({
    rows: result.data ?? [],
    nextCursor: result.nextCursor ?? null,
  });
}
