import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import {
  onboardingCompleteSchema,
  isVendorData,
} from '@/lib/onboarding/onboarding-complete-validation';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, error: 'auth required' }, { status: 401 });
  }

  const parsed = onboardingCompleteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 });
  }

  const input = parsed.data;
  const now = new Date().toISOString();

  // For vendor completion (not skipped, has category + years_in_business):
  // upsert vendor_profiles.category so the existing wizard pre-fills it.
  // Stash only years_in_business in users.onboarding_data (category lives
  // in vendor_profiles).
  let userOnboardingData: Record<string, unknown> | null = null;

  if (input.skipped) {
    userOnboardingData = null;
  } else if (isVendorData(input.data)) {
    const { error: upsertError } = await supabase
      .from('vendor_profiles')
      .update({
        category: input.data.category as
          | 'photography'
          | 'videography'
          | 'mehndi'
          | 'hair_makeup'
          | 'dj'
          | 'photobooth'
          | 'catering'
          | 'venue'
          | 'decor'
          | 'invitations'
          | 'bridal_wear'
          | 'live_music'
          | 'carts',
      })
      .eq('user_id', user.id);
    if (upsertError) {
      // Non-fatal: log + proceed. The user can change category in the wizard.
      logger.error('vendor_profiles category upsert failed', upsertError, {
        user_id: user.id,
        category: input.data.category,
      });
    }
    userOnboardingData = { years_in_business: input.data.years_in_business };
  } else {
    // Couple data: store as-is
    userOnboardingData = {
      event_date: input.data.event_date,
      categories: input.data.categories,
    };
  }

  const { error: userUpdateError } = await supabase
    .from('users')
    .update({
      onboarding_completed_at: now,
      onboarding_data: userOnboardingData,
    })
    .eq('id', user.id);

  if (userUpdateError) {
    logger.error('users onboarding update failed', userUpdateError, { user_id: user.id });
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  logger.info('onboarding_completed', {
    user_id: user.id,
    skipped: input.skipped,
  });

  return NextResponse.json({ ok: true }, { status: 200 });
}
