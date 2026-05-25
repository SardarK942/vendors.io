import { NextRequest, NextResponse } from 'next/server';
import { withErrorBoundary, HttpError } from '@/lib/api/error-boundary';
import { requireUser } from '@/lib/api/auth';
import {
  basicsSchema,
  locationSchema,
  onlineSchema,
  portfolioSchema,
  paymentModeSchema,
  detailsSchema,
} from '@/lib/onboarding/validation';
import { generateSlug } from '@/lib/utils';

function slugWithSuffix(name: string): string {
  const base = generateSlug(name);
  const hex = Math.random().toString(16).slice(2, 8);
  return `${base}-${hex}`;
}

/**
 * Resolve the target vendor_profile.
 *
 * Sub-project I §6: when a `profile_id` is provided in the body, use it
 * (after ownership check). This is the multi-business path — the wizard
 * layout creates/resolves the profile via getOrCreateWizardProfile and
 * threads it down to step components which include it in the PATCH body.
 *
 * Legacy fallback (when no `profile_id` provided): match by user_id. Returns
 * null if no profile exists yet; only the 'basics' step's INSERT path uses
 * that branch.
 */
async function resolveProfileId(
  supabase: Awaited<ReturnType<typeof requireUser>>['supabase'],
  userId: string,
  bodyProfileId: unknown
): Promise<{ profileId: string | null; existingSlug: string | null }> {
  if (typeof bodyProfileId === 'string' && bodyProfileId.length > 0) {
    // Multi-business path: ownership check.
    const { data: target } = await supabase
      .from('vendor_profiles')
      .select('id, user_id, slug')
      .eq('id', bodyProfileId)
      .maybeSingle();
    if (!target) throw new HttpError(404, 'Profile not found');
    if (target.user_id !== userId) throw new HttpError(403, 'Not your profile');
    return { profileId: target.id, existingSlug: target.slug ?? null };
  }
  // Legacy fallback: look up by user_id.
  const { data: existing } = await supabase
    .from('vendor_profiles')
    .select('id, slug')
    .eq('user_id', userId)
    .maybeSingle();
  return {
    profileId: existing?.id ?? null,
    existingSlug: existing?.slug ?? null,
  };
}

export const PATCH = withErrorBoundary(
  async (req: NextRequest, { params }: { params: Promise<{ step: string }> }) => {
    const { step } = await params;
    const { user, supabase } = await requireUser();
    const body = await req.json();

    const bodyProfileId = (body as { profile_id?: unknown }).profile_id;
    const { profileId, existingSlug } = await resolveProfileId(supabase, user.id, bodyProfileId);

    if (step === 'basics') {
      let data;
      try {
        data = basicsSchema.parse(body);
      } catch (err: unknown) {
        const zodErr = err as { issues?: { message: string }[] };
        throw new HttpError(400, zodErr.issues?.[0]?.message ?? 'Validation failed');
      }

      const payload = {
        user_id: user.id,
        business_name: data.businessName,
        category: data.category as
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
        bio: data.bio,
        slug: existingSlug ?? slugWithSuffix(data.businessName),
      };

      const { error } = profileId
        ? await supabase.from('vendor_profiles').update(payload).eq('id', profileId)
        : await supabase.from('vendor_profiles').insert(payload);

      if (error) throw new HttpError(500, error.message);
      return NextResponse.json({ ok: true });
    }

    // Every other step requires an existing profile.
    if (!profileId) {
      throw new HttpError(400, 'Complete the basics step first');
    }

    if (step === 'location') {
      let data;
      try {
        data = locationSchema.parse(body);
      } catch (err: unknown) {
        const zodErr = err as { issues?: { message: string }[] };
        throw new HttpError(400, zodErr.issues?.[0]?.message ?? 'Validation failed');
      }

      const { error } = await supabase
        .from('vendor_profiles')
        .update({
          base_address_line_1: data.baseAddressLine1,
          base_city: data.baseCity,
          base_state: data.baseState,
          base_postal_code: data.basePostalCode,
          base_google_place_id: data.baseGooglePlaceId,
          base_address_public: data.baseAddressPublic,
        })
        .eq('id', profileId);

      if (error) throw new HttpError(500, error.message);
      return NextResponse.json({ ok: true });
    }

    if (step === 'online') {
      let data;
      try {
        data = onlineSchema.parse(body);
      } catch (err: unknown) {
        const zodErr = err as { issues?: { message: string }[] };
        throw new HttpError(400, zodErr.issues?.[0]?.message ?? 'Validation failed');
      }

      const { error } = await supabase
        .from('vendor_profiles')
        .update({
          instagram_handle: data.instagramHandle,
          website_url: data.websiteUrl || null,
        })
        .eq('id', profileId);

      if (error) throw new HttpError(500, error.message);
      return NextResponse.json({ ok: true });
    }

    if (step === 'portfolio') {
      let data;
      try {
        data = portfolioSchema.parse(body);
      } catch (err: unknown) {
        const zodErr = err as { issues?: { message: string }[] };
        throw new HttpError(400, zodErr.issues?.[0]?.message ?? 'Validation failed');
      }

      const { error } = await supabase
        .from('vendor_profiles')
        .update({
          portfolio_images: data.portfolioImages,
        })
        .eq('id', profileId);

      if (error) throw new HttpError(500, error.message);
      return NextResponse.json({ ok: true });
    }

    if (step === 'payment-mode') {
      let data;
      try {
        data = paymentModeSchema.parse(body);
      } catch (err: unknown) {
        const zodErr = err as { issues?: { message: string }[] };
        throw new HttpError(400, zodErr.issues?.[0]?.message ?? 'Validation failed');
      }

      const { error } = await supabase
        .from('vendor_profiles')
        .update({ payment_mode: data.paymentMode })
        .eq('id', profileId);

      if (error) throw new HttpError(500, error.message);
      return NextResponse.json({ ok: true });
    }

    if (step === 'details') {
      let data;
      try {
        data = detailsSchema.parse(body);
      } catch (err: unknown) {
        const zodErr = err as { issues?: { message: string }[] };
        throw new HttpError(400, zodErr.issues?.[0]?.message ?? 'Validation failed');
      }

      const { error } = await supabase
        .from('vendor_profiles')
        .update({
          languages: data.languages,
          years_in_business: data.years_in_business,
          response_sla_hours: data.response_sla_hours,
        })
        .eq('id', profileId);

      if (error) throw new HttpError(500, error.message);
      return NextResponse.json({ ok: true });
    }

    throw new HttpError(400, `Unknown step: ${step}`);
  }
);
