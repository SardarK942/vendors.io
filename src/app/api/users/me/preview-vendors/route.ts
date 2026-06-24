import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getVendorsByCategory, getRecentActiveVendors } from '@/services/vendor.service';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { searchParams } = new URL(req.url);
  const categoriesParam = searchParams.get('categories');
  const categories = categoriesParam ? categoriesParam.split(',').filter(Boolean) : [];

  const vendors =
    categories.length > 0
      ? await getVendorsByCategory(supabase, categories, 3)
      : await getRecentActiveVendors(supabase, 3);

  return NextResponse.json({ data: vendors });
}
