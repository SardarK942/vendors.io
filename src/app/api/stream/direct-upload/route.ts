import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { createDirectUpload } from '@/lib/cloudflare-stream';

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: vendorProfile } = await supabase
    .from('vendor_profiles')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!vendorProfile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const gate = await checkRateLimit(
    req,
    'stream:direct-upload',
    { limit: 20, window: '10 m' },
    user.id
  );
  if (!gate.ok) return NextResponse.json({ error: gate.message ?? 'rate_limit' }, { status: 429 });

  try {
    const { uploadURL, uid } = await createDirectUpload({ maxDurationSeconds: 60 });
    return NextResponse.json({ uploadURL, uid });
  } catch {
    return NextResponse.json({ error: 'Could not start upload' }, { status: 502 });
  }
}
