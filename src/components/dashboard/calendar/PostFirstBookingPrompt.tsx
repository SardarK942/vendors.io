'use client';

import { useState, useEffect } from 'react';
import { ConnectCalendarModal } from './ConnectCalendarModal';
import type { FeedStatus } from '@/services/calendar-feed.service';

const DISMISS_KEY = 'baazar.calendarFeed.postFirstBookingPrompt.dismissed';

interface Props {
  feedStatus: FeedStatus;
  bookingId: string;
  isFirstConfirmedBooking: boolean;
}

export function PostFirstBookingPrompt({
  feedStatus,
  bookingId: _bookingId,
  isFirstConfirmedBooking,
}: Props) {
  const [dismissed, setDismissed] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [feedUrl, setFeedUrl] = useState<string | null>(feedStatus.feed_url);

  useEffect(() => {
    if (typeof window !== 'undefined' && localStorage.getItem(DISMISS_KEY) === '1')
      setDismissed(true);
  }, []);

  if (dismissed || !isFirstConfirmedBooking || feedStatus.state !== 'not_connected') return null;

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

  function dismiss() {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {} // eslint-disable-line no-empty
  }

  return (
    <>
      <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-sm font-semibold text-emerald-900">
              &#10003; Your first Baazar booking is confirmed
            </div>
            <div className="mt-0.5 text-xs text-emerald-800/80">
              Want this on your phone calendar? Connect Google, Apple, or Outlook in one tap.
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
              Connect calendar
            </button>
            <button
              onClick={dismiss}
              className="rounded-md px-3 py-2 text-sm font-semibold text-emerald-900/70 hover:bg-emerald-100"
            >
              Dismiss
            </button>
          </div>
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
