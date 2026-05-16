import { NextResponse } from 'next/server';
import { withErrorBoundary, HttpError } from '@/lib/api/error-boundary';
import { requireUser } from '@/lib/api/auth';

export const POST = withErrorBoundary(async () => {
  const { user, supabase } = await requireUser();

  const { data, error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .is('read_at', null)
    .select('id');

  if (error) throw new HttpError(500, error.message);

  return NextResponse.json({ data: { marked_count: data?.length ?? 0 } }, { status: 200 });
});
