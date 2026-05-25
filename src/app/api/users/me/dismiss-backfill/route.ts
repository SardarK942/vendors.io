import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

/**
 * POST /api/users/me/dismiss-backfill
 * Sets users.profile_backfill_dismissed_at = now() for the current user.
 */
export async function POST() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { error } = await supabase
    .from('users')
    .update({ profile_backfill_dismissed_at: new Date().toISOString() })
    .eq('id', user.id);

  if (error) {
    console.error('[POST /api/users/me/dismiss-backfill] error:', error);
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
