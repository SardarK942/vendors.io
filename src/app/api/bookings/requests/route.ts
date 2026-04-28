import { NextResponse } from 'next/server';
import { getBookingRequests } from '@/services/booking.service';
import { withErrorBoundary } from '@/lib/api/error-boundary';
import { requireUser } from '@/lib/api/auth';

export const GET = withErrorBoundary(async () => {
  const { user, supabase } = await requireUser();

  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single();
  const role = (profile?.role as 'couple' | 'vendor') || 'couple';
  const result = await getBookingRequests(supabase, user.id, role);

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ data: result.data }, { status: 200 });
});
