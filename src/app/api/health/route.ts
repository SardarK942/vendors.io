import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { stripe } from '@/lib/stripe/client';

export const dynamic = 'force-dynamic';

type Check = { ok: boolean; latencyMs: number; error?: string };

async function time<T>(fn: () => Promise<T>): Promise<Check> {
  const start = Date.now();
  try {
    await fn();
    return { ok: true, latencyMs: Date.now() - start };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function GET() {
  const [supabase, stripeCheck] = await Promise.all([
    time(async () => {
      const client = createServiceRoleClient();
      const { error } = await client.from('vendor_profiles').select('id').limit(1);
      if (error) throw new Error(error.message);
    }),
    time(async () => {
      await stripe.balance.retrieve();
    }),
  ]);

  const allOk = supabase.ok && stripeCheck.ok;

  return NextResponse.json(
    {
      status: allOk ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      checks: { supabase, stripe: stripeCheck },
    },
    { status: allOk ? 200 : 503 }
  );
}
