import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { deleteUtByUrls } from '@/lib/uploadthing';

/**
 * Authed UploadThing blob-delete route.
 *
 * AUTH MODEL: Gated to any authenticated Supabase user — the same gate the
 * upload core uses (`requireAuthedUser` in ../core.ts). Without a session the
 * request is rejected (401).
 *
 * KNOWN LIMITATION (documented, acceptable pre-launch): this is auth-gated but
 * NOT per-blob ownership-verified. We do not map each key back to the row that
 * owns it, so a signed-in user who learned another user's blob URL could delete
 * it. This is low-risk because UT keys are long + unguessable and the only URLs
 * a user sees are their own. Revisit with an ownership check (key -> owning row)
 * before opening the platform to untrusted/public sign-ups.
 */
export async function DELETE(req: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }

  const gate = await checkRateLimit(
    req,
    'uploadthing:delete',
    { limit: 30, window: '1 m' },
    user.id
  );
  if (!gate.ok) {
    return NextResponse.json({ error: gate.message ?? 'rate_limit' }, { status: 429 });
  }

  const body = (await req.json().catch(() => null)) as { urls?: unknown } | null;
  const raw = body?.urls;
  if (!Array.isArray(raw) || raw.length === 0) {
    return NextResponse.json({ error: 'Provide a non-empty urls array.' }, { status: 400 });
  }

  const urls = raw.filter((u): u is string => typeof u === 'string' && u.length > 0);
  if (urls.length === 0) {
    return NextResponse.json({ error: 'urls must be non-empty strings.' }, { status: 400 });
  }
  if (urls.length > 50) {
    return NextResponse.json({ error: 'Too many urls (max 50 per request).' }, { status: 400 });
  }

  try {
    const result = await deleteUtByUrls(urls);
    return NextResponse.json({ ok: true, deleted: result.deleted });
  } catch (err) {
    console.error('[uploadthing:delete] failed', err);
    return NextResponse.json({ error: 'Delete failed.' }, { status: 500 });
  }
}
