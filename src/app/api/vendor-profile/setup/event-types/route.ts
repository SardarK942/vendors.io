import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const types = body.served_event_types;
  if (!Array.isArray(types)) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'auth' }, { status: 401 });

  await supabase
    .from('vendor_profiles')
    .update({ served_event_types: types })
    .eq('user_id', user.id);

  return NextResponse.json({ ok: true });
}
