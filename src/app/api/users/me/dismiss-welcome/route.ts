import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function PATCH() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'auth' }, { status: 401 });

  await supabase
    .from('users')
    .update({ dashboard_welcome_dismissed_at: new Date().toISOString() })
    .eq('id', user.id);

  return NextResponse.json({ ok: true });
}
