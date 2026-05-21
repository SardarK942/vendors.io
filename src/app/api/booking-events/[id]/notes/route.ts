import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { updateVendorNotes } from '@/services/booking-event.service';
import { checkRateLimit } from '@/lib/rate-limit';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const gate = await checkRateLimit(
    req,
    'vendor-notes',
    { limit: 10, window: '1 m' },
    user.id
  );
  if (!gate.ok) {
    return NextResponse.json({ error: gate.message ?? 'rate_limit' }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const notes = typeof (body as Record<string, unknown>).notes === 'string'
    ? ((body as Record<string, unknown>).notes as string)
    : '';

  const result = await updateVendorNotes(supabase, id, user.id, notes);
  if (result.error) {
    if (result.error.code === 'too_long') {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    if (result.error.code === 'not_found') {
      return NextResponse.json({ error: result.error }, { status: 404 });
    }
    if (result.error.code === 'forbidden') {
      return NextResponse.json({ error: result.error }, { status: 403 });
    }
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
