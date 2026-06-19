import { NextResponse } from 'next/server';
import { withErrorBoundary, HttpError } from '@/lib/api/error-boundary';
import { requireUser } from '@/lib/api/auth';
import { publishGateSchema } from '@/lib/onboarding/validation';

export const POST = withErrorBoundary(async (req: Request) => {
  const { user, supabase } = await requireUser();

  // Sub-project I §6: accept optional profile_id + mode + stripe_mode in body.
  // For first-business publishes the legacy path (resolve by user_id) still
  // works since req body may be empty. For second-business publishes the
  // client posts the explicit profile_id resolved by the wizard layout.
  let bodyProfileId: string | null = null;
  let mode: 'first' | 'next' = 'first';
  let stripeMode: 'reuse' | 'new' | null = null;
  try {
    const body = (await req.json()) as {
      profile_id?: unknown;
      mode?: unknown;
      stripe_mode?: unknown;
    };
    if (typeof body.profile_id === 'string') bodyProfileId = body.profile_id;
    if (body.mode === 'next') mode = 'next';
    if (body.stripe_mode === 'reuse' || body.stripe_mode === 'new') stripeMode = body.stripe_mode;
  } catch {
    // No body — single-business legacy publish; proceed.
  }

  let profileRow: { id: string; user_id: string } | null = null;

  if (bodyProfileId) {
    const { data: target } = await supabase
      .from('vendor_profiles')
      .select('*')
      .eq('id', bodyProfileId)
      .maybeSingle();
    if (!target) throw new HttpError(404, 'Profile not found');
    if (target.user_id !== user.id) throw new HttpError(403, 'Not your profile');
    profileRow = target;
  } else {
    const { data: profile } = await supabase
      .from('vendor_profiles')
      .select('*')
      .eq('user_id', user.id)
      .single();
    if (!profile) {
      throw new HttpError(404, 'No vendor profile found — start the wizard first.');
    }
    profileRow = profile;
  }

  const parsed = publishGateSchema.safeParse(profileRow);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json(
      {
        error: 'Profile incomplete',
        field: issue.path[0],
        message: issue.message,
      },
      { status: 400 }
    );
  }

  const { error: updateError } = await supabase
    .from('vendor_profiles')
    .update({
      onboarding_complete: true,
      is_active: true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', profileRow.id);

  if (updateError) throw new HttpError(500, updateError.message);

  // Sub-project I §6: when adding a second business, set it as the active
  // business so the user lands inside it after redirect.
  if (mode === 'next') {
    await supabase
      .from('users')
      .update({ active_vendor_profile_id: profileRow.id })
      .eq('id', user.id);
  }

  return NextResponse.json({ ok: true });
});
