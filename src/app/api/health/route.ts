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

  // Resend health check — non-fatal: failing marks degraded but not 503
  const apiKey = process.env.RESEND_API_KEY;
  let resend: 'ok' | 'failing' | 'unset' = 'unset';
  if (apiKey) {
    try {
      const res = await fetch('https://api.resend.com/domains', {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(3000),
      });
      resend = res.ok ? 'ok' : 'failing';
    } catch {
      resend = 'failing';
    }
  }

  const criticalOk = supabase.ok && stripeCheck.ok;
  const allOk = criticalOk && resend !== 'failing';

  return NextResponse.json(
    {
      status: allOk ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      checks: { supabase, stripe: stripeCheck, resend },
    },
    { status: criticalOk ? 200 : 503 }
  );
}
