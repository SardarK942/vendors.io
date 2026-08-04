import crypto from 'node:crypto';
import { NextRequest } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { buildIcsForVendor, recordPoll } from '@/services/calendar-feed.service';

const DAILY_SALT = process.env.CAL_FEED_IP_SALT || 'baazar-cal-feed-default-salt';

function hashIp(ip: string): string {
  return crypto
    .createHash('sha256')
    .update(ip + ':' + DAILY_SALT)
    .digest('hex')
    .slice(0, 24);
}

function extractIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return req.headers.get('x-real-ip') ?? 'unknown';
}

export async function GET(
  req: NextRequest | Request,
  ctx: { params: { token: string } }
): Promise<Response> {
  const rawToken = ctx.params.token;
  const token = rawToken.endsWith('.ics') ? rawToken.slice(0, -4) : rawToken;
  if (!/^[A-Za-z0-9_-]{20,32}$/.test(token)) return new Response('Not Found', { status: 404 });

  const sb = createServiceRoleClient();
  const { data: vp } = await sb
    .from('vendor_profiles')
    .select('id')
    .eq('calendar_feed_token', token)
    .maybeSingle();
  if (!vp) return new Response('Not Found', { status: 404 });

  const ua = req.headers.get('user-agent');
  const ipHash = hashIp(extractIp(req));

  // Per-IP hard cap: 600 polls / hour
  const since = new Date(Date.now() - 3600_000).toISOString();
  const { count = 0 } = await sb
    .from('vendor_calendar_feed_polls')
    .select('id', { count: 'exact', head: true })
    .eq('ip_hash', ipHash)
    .eq('vendor_profile_id', vp.id)
    .gte('polled_at', since);
  if ((count ?? 0) >= 600) {
    await recordPoll({
      supabase: sb,
      vendorProfileId: vp.id,
      userAgent: ua,
      ipHash,
      statusReturned: 429,
    });
    return new Response('Too Many Requests', { status: 429 });
  }

  const ics = await buildIcsForVendor(sb, vp.id);
  await recordPoll({
    supabase: sb,
    vendorProfileId: vp.id,
    userAgent: ua,
    ipHash,
    statusReturned: 200,
  });

  return new Response(ics, {
    status: 200,
    headers: {
      'content-type': 'text/calendar; charset=utf-8',
      'cache-control': 'private, max-age=3600',
      'x-robots-tag': 'noindex',
    },
  });
}
