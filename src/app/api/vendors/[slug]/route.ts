import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getVendorBySlug } from '@/services/vendor.service';
import { withErrorBoundary } from '@/lib/api/error-boundary';

export const GET = withErrorBoundary(
  async (_request: NextRequest, { params }: { params: Promise<{ slug: string }> }) => {
    const { slug } = await params;
    const supabase = await createServerSupabaseClient();
    const result = await getVendorBySlug(supabase, slug);

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ data: result.data }, { status: 200 });
  }
);
