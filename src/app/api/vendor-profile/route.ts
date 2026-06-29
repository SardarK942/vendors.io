import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorBoundary, HttpError } from '@/lib/api/error-boundary';
import { requireUser } from '@/lib/api/auth';
import { validSubcategorySlugs } from '@/lib/vendor-subcategories';

const patchVendorProfileSchema = z.object({
  business_name: z.string().min(2).max(100).optional(),
  bio: z.string().max(2000).optional().nullable(),
  service_area: z.array(z.string()).optional(),
  instagram_handle: z.string().max(50).optional().nullable(),
  website_url: z.string().url().optional().nullable().or(z.literal('')),
  response_sla_hours: z.number().int().positive().optional(),
  portfolio_images: z.array(z.string().url()).optional(),
  // base_address fields
  base_address_line_1: z.string().max(200).optional().nullable(),
  base_city: z.string().max(80).optional().nullable(),
  base_state: z.string().max(80).optional().nullable(),
  base_postal_code: z.string().max(20).optional().nullable(),
  base_google_place_id: z.string().optional().nullable(),
  base_address_public: z.boolean().optional(),
  // pause toggle
  is_active: z.boolean().optional(),
  subcategories: z.array(z.string()).optional(),
});

export const PATCH = withErrorBoundary(async (request: NextRequest) => {
  const { user, supabase } = await requireUser();
  const parsed = patchVendorProfileSchema.parse(await request.json());

  // Find vendor profile by user_id
  const { data: existing } = await supabase
    .from('vendor_profiles')
    .select('id, user_id')
    .eq('user_id', user.id)
    .single();
  if (!existing) throw new HttpError(403, 'No vendor profile for this user');

  // Pause-toggle validation: if setting is_active=true, require at least 1 active package
  if (parsed.is_active === true) {
    const { count } = await supabase
      .from('packages')
      .select('id', { count: 'exact', head: true })
      .eq('vendor_profile_id', existing.id)
      .eq('is_active', true);
    if ((count ?? 0) < 1) {
      return NextResponse.json(
        {
          error: {
            code: 'NO_ACTIVE_PACKAGES',
            message: 'Add at least one active package before resuming your profile.',
          },
        },
        { status: 409 }
      );
    }
  }

  if (parsed.subcategories !== undefined) {
    // Re-load the row's category so validation isn't trusting client input.
    const { data: row } = await supabase
      .from('vendor_profiles')
      .select('category')
      .eq('id', existing.id)
      .single();
    const valid = validSubcategorySlugs((row?.category as string) ?? '');
    if (valid.size === 0 && parsed.subcategories.length > 0) {
      throw new HttpError(400, 'This category does not support subcategories');
    }
    if (!parsed.subcategories.every((s) => valid.has(s))) {
      throw new HttpError(400, 'Invalid subcategory slug');
    }
  }

  const { data, error } = await supabase
    .from('vendor_profiles')
    .update({ ...parsed, updated_at: new Date().toISOString() })
    .eq('id', existing.id)
    .select('*')
    .single();

  if (error) {
    return NextResponse.json(
      { error: { code: 'UPDATE_FAILED', message: error.message } },
      { status: 500 }
    );
  }

  return NextResponse.json({ data }, { status: 200 });
});
