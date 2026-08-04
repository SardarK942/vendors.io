import crypto from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { recognizeProvider } from '@/lib/calendar-feed/ua-patterns';

function newToken(): string {
  // 16 random bytes → base64url, trimmed to 22 chars (drop the trailing '==')
  return crypto.randomBytes(16).toString('base64url');
}

export async function getOrCreateFeedToken(
  supabase: SupabaseClient,
  vendorProfileId: string
): Promise<string> {
  const { data, error } = await supabase
    .from('vendor_profiles')
    .select('calendar_feed_token')
    .eq('id', vendorProfileId)
    .single();
  if (error) throw new Error(`getOrCreateFeedToken: ${error.message}`);
  if (data?.calendar_feed_token) return data.calendar_feed_token;

  const token = newToken();
  const { error: updErr } = await supabase
    .from('vendor_profiles')
    .update({ calendar_feed_token: token })
    .eq('id', vendorProfileId);
  if (updErr) throw new Error(`getOrCreateFeedToken (update): ${updErr.message}`);
  return token;
}

export async function rotateFeedToken(
  supabase: SupabaseClient,
  vendorProfileId: string
): Promise<string> {
  const token = newToken();
  const { error } = await supabase
    .from('vendor_profiles')
    .update({
      calendar_feed_token: token,
      calendar_feed_state: 'not_connected',
      calendar_feed_intent_at: null,
      calendar_feed_intent_method: null,
      calendar_feed_connected_at: null,
      calendar_feed_connected_via_ua: null,
    })
    .eq('id', vendorProfileId);
  if (error) throw new Error(`rotateFeedToken: ${error.message}`);
  return token;
}

const LOCKING_STATUSES = [
  'accepted',
  'adjusted_quote_sent',
  'adjusted_quote_declined',
  'deposit_paid',
  'completed',
] as const;

function escapeIcsText(s: string | null | undefined): string {
  if (!s) return '';
  return s.replace(/\\/g, '\\\\').replace(/,/g, '\\,').replace(/;/g, '\\;').replace(/\n/g, '\\n');
}

function fmtDtUtc(iso: string): string {
  // 2026-08-15T16:00:00Z → 20260815T160000Z
  return new Date(iso)
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
}

function lastNameOf(fullName: string | null | undefined): string {
  if (!fullName) return '';
  const parts = fullName.trim().split(/\s+/);
  return parts[parts.length - 1] || '';
}

function foldLine(line: string): string {
  // RFC 5545 §3.1: lines > 75 octets are folded with CRLF + space.
  if (line.length <= 75) return line;
  const chunks: string[] = [];
  let i = 0;
  while (i < line.length) {
    chunks.push(line.slice(i, i + (i === 0 ? 75 : 74)));
    i += i === 0 ? 75 : 74;
  }
  return chunks.join('\r\n ');
}

export async function buildIcsForVendor(
  supabase: SupabaseClient,
  vendorProfileId: string
): Promise<string> {
  const { data: profile } = await supabase
    .from('vendor_profiles')
    .select('timezone, business_name')
    .eq('id', vendorProfileId)
    .single();

  const tz = profile?.timezone || 'America/Chicago';
  const businessName = profile?.business_name || 'Vendor';

  const now = new Date();
  const minStart = new Date(now.getTime() - 60 * 86400_000).toISOString();
  const maxStart = new Date(now.getTime() + 730 * 86400_000).toISOString();

  const { data: events = [] } = await supabase
    .from('booking_events')
    .select(
      `
      id, event_start_time, event_end_time, event_type, venue_name, venue_address,
      booking_id, status, couple_name, couple_phone, package_name
    `
    )
    .eq('vendor_profile_id', vendorProfileId)
    .in('status', LOCKING_STATUSES as unknown as string[])
    .gte('event_start_time', minStart)
    .lte('event_start_time', maxStart)
    .order('event_start_time', { ascending: true });

  const lines: string[] = [];
  lines.push('BEGIN:VCALENDAR');
  lines.push('VERSION:2.0');
  lines.push('PRODID:-//Baazar//Vendor Calendar Feed//EN');
  lines.push('CALSCALE:GREGORIAN');
  lines.push('METHOD:PUBLISH');
  lines.push(foldLine(`X-WR-CALNAME:Baazar Bookings — ${escapeIcsText(businessName)}`));
  lines.push(`X-WR-TIMEZONE:${tz}`);
  lines.push('REFRESH-INTERVAL;VALUE=DURATION:PT12H');
  lines.push('X-PUBLISHED-TTL:PT12H');

  const dtStamp = fmtDtUtc(now.toISOString());
  for (const e of events ?? []) {
    const isPaid = e.status === 'deposit_paid' || e.status === 'completed';
    const summary = `[Baazar] ${e.package_name || e.event_type || 'Booking'} — ${lastNameOf(e.couple_name)}`;
    const descLines = [
      e.couple_name ? `Couple: ${e.couple_name}` : null,
      e.couple_phone ? `Phone: ${e.couple_phone}` : null,
      e.package_name ? `Package: ${e.package_name}` : null,
      `Deposit: ${isPaid ? 'PAID' : 'PENDING'}`,
      `Manage in Baazar: https://baazar.io/dashboard/bookings/${e.booking_id}`,
    ]
      .filter(Boolean)
      .join('\\n');

    const location = [e.venue_name, e.venue_address].filter(Boolean).join(', ');

    lines.push('BEGIN:VEVENT');
    lines.push(`UID:booking-event-${e.id}@baazar.io`);
    lines.push(`DTSTAMP:${dtStamp}`);
    lines.push(`DTSTART:${fmtDtUtc(e.event_start_time)}`);
    lines.push(`DTEND:${fmtDtUtc(e.event_end_time)}`);
    lines.push(foldLine(`SUMMARY:${escapeIcsText(summary)}`));
    lines.push(foldLine(`DESCRIPTION:${escapeIcsText(descLines)}`));
    if (location) lines.push(foldLine(`LOCATION:${escapeIcsText(location)}`));
    lines.push(`STATUS:${isPaid ? 'CONFIRMED' : 'TENTATIVE'}`);
    lines.push('TRANSP:OPAQUE');
    lines.push(`URL:https://baazar.io/dashboard/bookings/${e.booking_id}`);
    lines.push('CATEGORIES:Baazar,Booking');
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}

export interface FeedStatus {
  state: 'not_connected' | 'pending' | 'connected';
  intent_method: string | null;
  connected_at: string | null;
  connected_via_ua: string | null;
  last_poll_at: string | null;
  polls_24h: number;
  feed_url: string | null;
  has_first_booking: boolean;
}

export async function recordPoll(args: {
  supabase: SupabaseClient;
  vendorProfileId: string;
  userAgent: string | null;
  ipHash: string | null;
  statusReturned: number;
}): Promise<void> {
  const { supabase, vendorProfileId, userAgent, ipHash, statusReturned } = args;
  const provider = recognizeProvider(userAgent);

  await supabase.from('vendor_calendar_feed_polls').insert({
    vendor_profile_id: vendorProfileId,
    user_agent: userAgent,
    recognized_provider: provider,
    ip_hash: ipHash,
    status_returned: statusReturned,
  });

  if (statusReturned !== 200 || !provider) return;

  const { data } = await supabase
    .from('vendor_profiles')
    .select('calendar_feed_state')
    .eq('id', vendorProfileId)
    .single();

  if (data?.calendar_feed_state === 'pending') {
    await supabase
      .from('vendor_profiles')
      .update({
        calendar_feed_state: 'connected',
        calendar_feed_connected_at: new Date().toISOString(),
        calendar_feed_connected_via_ua: userAgent,
      })
      .eq('id', vendorProfileId)
      .eq('calendar_feed_state', 'pending'); // guard against concurrent flips
  }
}

export async function getFeedStatus(
  supabase: SupabaseClient,
  vendorProfileId: string,
  publicBaseUrl: string
): Promise<FeedStatus> {
  const { data: vp } = await supabase
    .from('vendor_profiles')
    .select(
      `
      calendar_feed_token, calendar_feed_state, calendar_feed_intent_method,
      calendar_feed_connected_at, calendar_feed_connected_via_ua, first_confirmed_booking_at
    `
    )
    .eq('id', vendorProfileId)
    .single();

  const since = new Date(Date.now() - 86400_000).toISOString();
  const { count: polls24h = 0 } = await supabase
    .from('vendor_calendar_feed_polls')
    .select('id', { count: 'exact', head: true })
    .eq('vendor_profile_id', vendorProfileId)
    .gte('polled_at', since);

  const { data: lastPoll } = await supabase
    .from('vendor_calendar_feed_polls')
    .select('polled_at')
    .eq('vendor_profile_id', vendorProfileId)
    .order('polled_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    state: vp?.calendar_feed_state ?? 'not_connected',
    intent_method: vp?.calendar_feed_intent_method ?? null,
    connected_at: vp?.calendar_feed_connected_at ?? null,
    connected_via_ua: vp?.calendar_feed_connected_via_ua ?? null,
    last_poll_at: lastPoll?.polled_at ?? null,
    polls_24h: polls24h ?? 0,
    feed_url: vp?.calendar_feed_token
      ? `${publicBaseUrl}/api/cal/${vp.calendar_feed_token}.ics`
      : null,
    has_first_booking: !!vp?.first_confirmed_booking_at,
  };
}
