import { Bell, MailCheck } from 'lucide-react';

interface CaughtUpCardProps {
  /** Count of unread notifications at page load (server-computed). */
  unreadCount: number;
}

/**
 * Right-rail summary card. Mirrors the Figma "You're all caught up!" panel but
 * swaps the envelope illustration for a lucide icon chip (no new asset). The
 * unread count reflects server-load state (not live mark-read changes).
 */
export function CaughtUpCard({ unreadCount }: CaughtUpCardProps) {
  const caughtUp = unreadCount <= 0;

  return (
    <div className="rounded-2xl border border-hairline bg-cream-soft/60 p-6">
      <span className="mb-4 inline-flex size-12 items-center justify-center rounded-full bg-indigo/10">
        {caughtUp ? (
          <MailCheck className="size-6 text-indigo" aria-hidden="true" />
        ) : (
          <Bell className="size-6 text-indigo" aria-hidden="true" />
        )}
      </span>
      <h2 className="font-display text-xl text-ink">
        {caughtUp ? "You're all caught up!" : 'A few things to review'}
      </h2>
      <p className="mt-1 text-sm text-ink-soft">
        {caughtUp
          ? 'No new notifications at the moment.'
          : `${unreadCount} unread ${unreadCount === 1 ? 'notification' : 'notifications'}.`}
      </p>
    </div>
  );
}
