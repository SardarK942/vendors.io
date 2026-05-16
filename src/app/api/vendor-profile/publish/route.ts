import { NextResponse } from 'next/server';
import { withErrorBoundary, HttpError } from '@/lib/api/error-boundary';
import { requireUser } from '@/lib/api/auth';
import { publishGateSchema } from '@/lib/onboarding/validation';

export const POST = withErrorBoundary(async (_req: Request) => {
  const { user, supabase } = await requireUser();

  const { data: profile, error } = await supabase
    .from('vendor_profiles')
    .select('*')
    .eq('user_id', user.id)
    .single();

  if (error || !profile) {
    throw new HttpError(404, 'No vendor profile found — start the wizard first.');
  }

  const parsed = publishGateSchema.safeParse(profile);
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
    .eq('user_id', user.id);

  if (updateError) throw new HttpError(500, updateError.message);

  return NextResponse.json({ ok: true });
});
