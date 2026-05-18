import { NextRequest, NextResponse } from 'next/server';
import { withErrorBoundary, HttpError } from '@/lib/api/error-boundary';
import { requireUser } from '@/lib/api/auth';
import {
  basicsSchema,
  locationSchema,
  onlineSchema,
  portfolioSchema,
  paymentModeSchema,
} from '@/lib/onboarding/validation';
import { generateSlug } from '@/lib/utils';

function slugWithSuffix(name: string): string {
  const base = generateSlug(name);
  const hex = Math.random().toString(16).slice(2, 8);
  return `${base}-${hex}`;
}

export const PATCH = withErrorBoundary(
  async (req: NextRequest, { params }: { params: Promise<{ step: string }> }) => {
    const { step } = await params;
    const { user, supabase } = await requireUser();
    const body = await req.json();

    if (step === 'basics') {
      let data;
      try {
        data = basicsSchema.parse(body);
      } catch (err: unknown) {
        const zodErr = err as { issues?: { message: string }[] };
        throw new HttpError(400, zodErr.issues?.[0]?.message ?? 'Validation failed');
      }

      const { data: existing } = await supabase
        .from('vendor_profiles')
        .select('id, slug')
        .eq('user_id', user.id)
        .maybeSingle();

      const payload = {
        user_id: user.id,
        business_name: data.businessName,
        category: data.category,
        bio: data.bio,
        slug: existing?.slug ?? slugWithSuffix(data.businessName),
      };

      const { error } = existing
        ? await supabase
            .from('vendor_profiles')
            .update(payload)
            .eq('id', existing.id)
        : await supabase.from('vendor_profiles').insert(payload);

      if (error) throw new HttpError(500, error.message);
      return NextResponse.json({ ok: true });
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
        .eq('user_id', user.id);

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
        .eq('user_id', user.id);

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
        .eq('user_id', user.id);

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
        .eq('user_id', user.id);

      if (error) throw new HttpError(500, error.message);
      return NextResponse.json({ ok: true });
    }

    throw new HttpError(400, `Unknown step: ${step}`);
  }
);
