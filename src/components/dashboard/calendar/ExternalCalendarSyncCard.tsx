'use client';

import { useEffect, useRef, useState } from 'react';
import { ConnectCalendarModal } from './ConnectCalendarModal';
import { GoogleCalIcon, AppleCalIcon, OutlookCalIcon } from './CalendarProviderIcons';
import type { FeedStatus } from '@/services/calendar-feed.service';

interface Props {
  initialStatus: FeedStatus;
}

function providerLabel(ua: string | null): string {
  if (!ua) return 'your calendar app';
  if (/Google-Calendar-Importer/i.test(ua)) return 'Google Calendar';
  if (/iCal|CalendarAgent|CalendarFramework/i.test(ua)) return 'Apple Calendar';
  if (/Outlook/i.test(ua)) return 'Outlook';
  return 'your calendar app';
}

function timeAgo(iso: string | null): string {
  if (!iso) return '—';
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
  const days = Math.round(hrs / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

export function ExternalCalendarSyncCard({ initialStatus }: Props) {
  const [status, setStatus] = useState<FeedStatus>(initialStatus);
  const [modalOpen, setModalOpen] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const start = () => {
      if (pollRef.current) return;
      pollRef.current = setInterval(async () => {
        try {
          const r = await fetch('/api/vendor-calendar/feed/status', { cache: 'no-store' });
          if (r.ok) {
            const next: FeedStatus = await r.json();
            setStatus(next);
            if (next.state !== 'pending') stop();
          }
        } catch {}
      }, 10_000);
    };
    const stop = () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
    if (status.state === 'pending' && !document.hidden) start();
    const onVis = () => {
      if (document.hidden) stop();
      else if (status.state === 'pending') start();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [status.state]);

  async function postIntent(method: 'google' | 'apple' | 'outlook' | 'copy') {
    await fetch('/api/vendor-calendar/feed/intent', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ method }),
    });
    setStatus((s) => ({ ...s, state: 'pending', intent_method: method }));
  }

  async function disconnect() {
    await fetch('/api/vendor-calendar/feed/disconnect', { method: 'POST' });
    setStatus((s) => ({
      ...s,
      state: 'not_connected',
      intent_method: null,
      connected_at: null,
      connected_via_ua: null,
    }));
  }

  async function rotate() {
    const r = await fetch('/api/vendor-calendar/feed/rotate', { method: 'POST' });
    const body = await r.json();
    setStatus((s) => ({
      ...s,
      state: 'not_connected',
      feed_url: body.feed_url,
      intent_method: null,
      connected_at: null,
      connected_via_ua: null,
    }));
  }

  const pill = (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
        status.state === 'connected'
          ? 'bg-emerald-100 text-emerald-800'
          : status.state === 'pending'
            ? 'bg-amber-100 text-amber-800'
            : 'bg-cream-2 text-ink/70'
      }`}
    >
      <span
        className={`h-2 w-2 rounded-full ${
          status.state === 'connected'
            ? 'bg-emerald-600'
            : status.state === 'pending'
              ? 'animate-pulse bg-amber-500'
              : 'bg-ink/40'
        }`}
      />
      {status.state === 'connected'
        ? 'Connected'
        : status.state === 'pending'
          ? 'Pending verification'
          : 'Not connected'}
    </span>
  );

  return (
    <div className="rounded-2xl border border-ink/10 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-display text-base font-semibold tracking-tight">
          📲 See Baazar bookings in your calendar app
        </h3>
        {pill}
      </div>

      {status.state === 'not_connected' && (
        <>
          <p className="mb-4 text-sm text-ink/70">
            Every confirmed Baazar booking will appear automatically in your existing calendar app —
            no double-entry, no password sharing. Subscribe once; new bookings flow in forever.
          </p>
          <div className="mb-4 flex items-center gap-2">
            <GoogleCalIcon size={22} />
            <AppleCalIcon size={22} />
            <OutlookCalIcon size={22} />
            <span className="ml-2 text-xs text-ink/60">
              Google · Apple · Outlook · and any app that supports calendar feeds
            </span>
          </div>
          <button
            onClick={() => setModalOpen(true)}
            className="rounded-lg bg-ink px-4 py-2.5 text-sm font-semibold text-white hover:bg-black"
          >
            Choose your calendar app →
          </button>
        </>
      )}

      {status.state === 'pending' && (
        <>
          <p className="mb-2 text-sm text-ink">
            <strong>Waiting for confirmation…</strong>
          </p>
          <p className="mb-4 text-sm text-ink/70">
            We&apos;ve opened{' '}
            {status.intent_method === 'google'
              ? 'Google Calendar'
              : status.intent_method === 'apple'
                ? 'Apple Calendar'
                : status.intent_method === 'outlook'
                  ? 'Outlook'
                  : 'your calendar app'}{' '}
            in a new tab. Once you confirm the subscription, your calendar app will poll our feed
            within a few minutes and we&apos;ll mark this as connected automatically.
          </p>
          {status.feed_url && (
            <div className="mb-3 flex items-center gap-2 rounded-lg bg-cream px-3 py-2.5">
              <code className="flex-1 truncate font-mono text-xs text-ink/70">
                {status.feed_url}
              </code>
              <button
                onClick={() => navigator.clipboard?.writeText(status.feed_url!)}
                className="hover:bg-cream-2 rounded-md border border-ink/10 px-3 py-1.5 text-sm font-semibold"
              >
                Copy
              </button>
            </div>
          )}
          <button
            onClick={disconnect}
            className="hover:bg-cream-2 rounded-md border border-ink/10 px-3 py-2 text-sm font-semibold"
          >
            Cancel — disconnect
          </button>
        </>
      )}

      {status.state === 'connected' && (
        <>
          <p className="mb-1 text-sm text-ink">
            {`✓ Connected via ${providerLabel(status.connected_via_ua)}`}
          </p>
          <p className="mb-3 text-xs text-ink/60">
            First detected sync: {timeAgo(status.connected_at)} · Last poll:{' '}
            {timeAgo(status.last_poll_at)}
          </p>
          <div className="mb-4 grid grid-cols-3 gap-3">
            <Stat k="User-Agent" v={status.connected_via_ua ?? '—'} small />
            <Stat k="Polls (24h)" v={String(status.polls_24h)} />
            <Stat
              k="Avg interval"
              v={status.polls_24h > 0 ? `~${Math.round(24 / status.polls_24h)}h` : '—'}
            />
          </div>
          <div className="mb-4 flex flex-wrap gap-2">
            <button
              onClick={() => status.feed_url && navigator.clipboard?.writeText(status.feed_url)}
              className="hover:bg-cream-2 rounded-md border border-ink/10 px-3 py-2 text-sm font-semibold"
            >
              Copy feed URL
            </button>
            <button
              onClick={rotate}
              className="hover:bg-cream-2 rounded-md border border-ink/10 px-3 py-2 text-sm font-semibold"
            >
              Rotate URL
            </button>
            <button
              onClick={disconnect}
              className="rounded-md px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
            >
              Disconnect
            </button>
          </div>
          <p className="rounded-md bg-indigo-50 px-3 py-2 text-xs text-indigo-900 text-ink/60">
            💡 How we know it&apos;s working: your calendar app fetched our feed and identified
            itself in its <code>User-Agent</code> header. No OAuth, no password — the request itself
            is the proof.
          </p>
        </>
      )}

      {modalOpen && status.feed_url && (
        <ConnectCalendarModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          feedUrl={status.feed_url}
          onIntent={(m) => {
            postIntent(m);
            setModalOpen(false);
          }}
        />
      )}
      {modalOpen && !status.feed_url && (
        // If no feed_url yet (vendor never had a token), fetch intent first to generate one then open.
        <FetchIntentAndOpen
          onReady={(feedUrl) => setStatus((s) => ({ ...s, feed_url: feedUrl }))}
          method="copy"
        />
      )}
    </div>
  );
}

function Stat({ k, v, small }: { k: string; v: string; small?: boolean }) {
  return (
    <div className="rounded-lg bg-cream px-3 py-2">
      <div className="text-xs text-ink/60">{k}</div>
      <div className={`font-semibold ${small ? 'text-sm' : 'text-lg'} mt-0.5`}>{v}</div>
    </div>
  );
}

function FetchIntentAndOpen({
  onReady,
  method,
}: {
  onReady: (feedUrl: string) => void;
  method: 'copy';
}) {
  useEffect(() => {
    fetch('/api/vendor-calendar/feed/intent', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ method }),
    })
      .then((r) => r.json())
      .then((b) => onReady(b.feed_url));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
