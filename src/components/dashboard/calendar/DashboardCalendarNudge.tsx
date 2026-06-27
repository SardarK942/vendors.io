'use client';

import { useState } from 'react';
import { ConnectCalendarModal } from './ConnectCalendarModal';
import type { FeedStatus } from '@/services/calendar-feed.service';

interface Props {
  feedStatus: FeedStatus;
  nudgeDismissed: boolean;
}

export function DashboardCalendarNudge({ feedStatus, nudgeDismissed }: Props) {
  const [hidden, setHidden] = useState(nudgeDismissed);
  const [modalOpen, setModalOpen] = useState(false);
  const [feedUrl, setFeedUrl] = useState<string | null>(feedStatus.feed_url);

  if (hidden || feedStatus.state !== 'not_connected') return null;

  async function ensureFeedUrl(): Promise<string> {
    if (feedUrl) return feedUrl;
    const r = await fetch('/api/vendor-calendar/feed/intent', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ method: 'copy' }),
    });
    const b = await r.json();
    setFeedUrl(b.feed_url);
    return b.feed_url;
  }

  async function dismiss() {
    setHidden(true);
    await fetch('/api/vendor-calendar/feed/dismiss-nudge', { method: 'POST' });
  }

  return (
    <>
      <div className="mb-4 flex items-center justify-between rounded-xl border border-ink/10 bg-white px-5 py-4 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="text-lg">📅</span>
          <div>
            <div className="text-sm font-semibold">Connect your calendar</div>
            <div className="mt-0.5 text-xs text-ink/60">
              Show Baazar bookings in Google, Apple, or Outlook automatically.
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={async () => {
              await ensureFeedUrl();
              setModalOpen(true);
            }}
            className="rounded-md bg-ink px-3 py-2 text-sm font-semibold text-white hover:bg-black"
          >
            Connect
          </button>
          <button
            onClick={dismiss}
            className="hover:bg-cream-2 rounded-md px-3 py-2 text-sm font-semibold text-ink/70"
          >
            Maybe later
          </button>
        </div>
      </div>
      {modalOpen && feedUrl && (
        <ConnectCalendarModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          feedUrl={feedUrl}
          onIntent={() => setModalOpen(false)}
        />
      )}
    </>
  );
}
