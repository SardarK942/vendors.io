import { NextRequest, NextResponse } from 'next/server';
import { generateEmbedding } from '@/lib/ai/embeddings';
import { withErrorBoundary, HttpError } from '@/lib/api/error-boundary';
import { requireUser } from '@/lib/api/auth';

/**
 * Admin-only endpoint to generate/refresh embeddings for all vendor profiles.
 * Should be called after vendor profile creation or batch update.
 */
export const POST = withErrorBoundary(async (request: NextRequest) => {
  const { user, supabase } = await requireUser();

  const { data: userProfile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (userProfile?.role !== 'admin') {
    throw new HttpError(403, 'Admin access required');
  }

  const body = await request.json().catch(() => ({}));
  const forceRefresh = body?.forceRefresh === true;

  let query = supabase.from('vendor_profiles').select('id, business_name, bio, category');
  if (!forceRefresh) query = query.is('embedding', null);

  const { data: vendors, error } = await query;
  if (error) throw new HttpError(500, 'Failed to fetch vendors');

  if (!vendors || vendors.length === 0) {
    return NextResponse.json({
      data: { updated: 0, message: 'No vendors need embedding updates' },
    });
  }

  let updated = 0;
  const errors: string[] = [];

  for (const vendor of vendors) {
    try {
      const text = `${vendor.business_name} ${vendor.bio ?? ''} ${vendor.category}`;
      const embedding = await generateEmbedding(text);

      const { error: updateError } = await supabase
        .from('vendor_profiles')
        .update({ embedding: JSON.stringify(embedding) } as Record<string, unknown>)
        .eq('id', vendor.id);

      if (updateError) errors.push(`${vendor.id}: ${updateError.message}`);
      else updated++;
    } catch (err) {
      errors.push(`${vendor.id}: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  return NextResponse.json({
    data: { updated, total: vendors.length, errors: errors.length > 0 ? errors : undefined },
  });
});
