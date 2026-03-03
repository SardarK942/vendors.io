import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { generateEmbedding } from '@/lib/ai/embeddings';

/**
 * Admin-only endpoint to generate/refresh embeddings for all vendor profiles.
 * Should be called after vendor profile creation or batch update.
 */
export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();

  // Auth check — admin only
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: userProfile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (userProfile?.role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  // Get all vendor profiles that need embeddings
  const body = await request.json().catch(() => ({}));
  const forceRefresh = body?.forceRefresh === true;

  let query = supabase.from('vendor_profiles').select('id, business_name, bio, category');

  if (!forceRefresh) {
    query = query.is('embedding', null);
  }

  const { data: vendors, error } = await query;

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch vendors' }, { status: 500 });
  }

  if (!vendors || vendors.length === 0) {
    return NextResponse.json({
      data: { updated: 0, message: 'No vendors need embedding updates' },
    });
  }

  // Generate and update embeddings one at a time to keep costs predictable
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

      if (updateError) {
        errors.push(`${vendor.id}: ${updateError.message}`);
      } else {
        updated++;
      }
    } catch (err) {
      errors.push(`${vendor.id}: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  return NextResponse.json({
    data: { updated, total: vendors.length, errors: errors.length > 0 ? errors : undefined },
  });
}
