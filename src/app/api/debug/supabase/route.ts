import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? null;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? null;
  const anonKeyPrefix = anonKey?.slice(0, 20) ?? null;
  const anonKeyLen = anonKey?.length ?? 0;
  const serviceKeyPrefix = process.env.SUPABASE_SERVICE_ROLE_KEY?.slice(0, 20) ?? null;

  let sdkResult: { count: number | null; error: unknown } = { count: null, error: null };
  let restResult: {
    status: number | null;
    body: string | null;
    error: string | null;
  } = { status: null, body: null, error: null };

  try {
    const supabase = await createServerSupabaseClient();
    const { count, error } = await supabase
      .from('vendor_profiles')
      .select('id', { count: 'exact', head: true });

    sdkResult = {
      count: count ?? null,
      error: error ? JSON.parse(JSON.stringify(error)) : null,
    };
  } catch (err) {
    sdkResult.error = err instanceof Error ? err.message : String(err);
  }

  if (supabaseUrl && anonKey) {
    try {
      const res = await fetch(`${supabaseUrl}/rest/v1/vendor_profiles?select=id&limit=1`, {
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
        },
      });
      const body = await res.text();
      restResult = { status: res.status, body: body.slice(0, 500), error: null };
    } catch (err) {
      restResult.error = err instanceof Error ? err.message : String(err);
    }
  }

  return NextResponse.json({
    env: {
      supabaseUrl,
      anonKeyPrefix,
      anonKeyLen,
      serviceKeyPrefix,
    },
    sdkResult,
    restResult,
  });
}
