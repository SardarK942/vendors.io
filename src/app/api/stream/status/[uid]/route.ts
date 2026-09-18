import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getVideoStatus } from '@/lib/cloudflare-stream';

export async function GET(_req: NextRequest, ctx: { params: Promise<{ uid: string }> }) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { uid } = await ctx.params;
  try {
    const status = await getVideoStatus(uid);
    return NextResponse.json(status);
  } catch {
    return NextResponse.json({ error: 'Status unavailable' }, { status: 502 });
  }
}
