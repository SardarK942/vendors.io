import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? null;
  const anonKeyPrefix = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.slice(0, 20) ?? null;
  const anonKeyLen = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.length ?? 0;
  const serviceKeyPrefix = process.env.SUPABASE_SERVICE_ROLE_KEY?.slice(0, 20) ?? null;

  let queryResult: {
    count: number | null;
    errorMessage: string | null;
    errorCode: string | null;
  } = { count: null, errorMessage: null, errorCode: null };

  try {
    const supabase = await createServerSupabaseClient();
    const { count, error } = await supabase
      .from('vendor_profiles')
      .select('id', { count: 'exact', head: true });

    queryResult = {
      count: count ?? null,
      errorMessage: error?.message ?? null,
      errorCode: (error as { code?: string })?.code ?? null,
    };
  } catch (err) {
    queryResult.errorMessage = err instanceof Error ? err.message : String(err);
  }

  return NextResponse.json({
    env: {
      supabaseUrl,
      anonKeyPrefix,
      anonKeyLen,
      serviceKeyPrefix,
      appUrl: process.env.NEXT_PUBLIC_APP_URL ?? null,
    },
    query: queryResult,
  });
}
