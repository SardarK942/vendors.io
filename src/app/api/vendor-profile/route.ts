import { NextRequest, NextResponse } from 'next/server';
import { withErrorBoundary, HttpError } from '@/lib/api/error-boundary';
import { requireUser } from '@/lib/api/auth';
import { validSubcategorySlugs } from '@/lib/vendor-subcategories';
import { invalidateEmbeddingOnContentChange } from '@/lib/ai/embeddings';
import { vendorProfileUpdateSchema } from './schema';

// Historical note: this route previously refused is_active=true when the vendor
// had zero active packages (409 NO_ACTIVE_PACKAGES). Removed because the custom-
// request flow (src/lib/vendor-packages/with-custom-request.ts) lets couples
// send quote requests to zero-package vendors — the gate was blocking legit
// quote-only vendors (caterers, venues, planners) from resuming after a pause.

export const PATCH = withErrorBoundary(async (request: NextRequest) => {
  const { user, supabase } = await requireUser();
  const parsed = vendorProfileUpdateSchema.parse(await request.json());

  // Find vendor profile by user_id
  const { data: existing } = await supabase
    .from('vendor_profiles')
    .select('id, user_id')
    .eq('user_id', user.id)
    .single();
  if (!existing) throw new HttpError(403, 'No vendor profile for this user');

  if (parsed.subcategories != null) {
    // Validate subcategories against the category this request will end up with:
    // the new category if it's being changed in the same PATCH, else the stored
    // one (re-loaded so we don't trust client input for the fallback).
    const { data: row } = await supabase
      .from('vendor_profiles')
      .select('category')
      .eq('id', existing.id)
      .single();
    const effectiveCategory = parsed.category ?? (row?.category as string | undefined) ?? '';
    const valid = validSubcategorySlugs(effectiveCategory);
    if (valid.size === 0 && parsed.subcategories.length > 0) {
      throw new HttpError(400, 'This category does not support subcategories');
    }
    if (!parsed.subcategories.every((s) => valid.has(s))) {
      throw new HttpError(400, 'Invalid subcategory slug');
    }
  }

  const { data, error } = await supabase
    .from('vendor_profiles')
    // Null the vector if this edit changes any embedding-source field, so the
    // hourly cron rebuilds it — otherwise search keeps ranking on stale content.
    .update(invalidateEmbeddingOnContentChange({ ...parsed, updated_at: new Date().toISOString() }))
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
