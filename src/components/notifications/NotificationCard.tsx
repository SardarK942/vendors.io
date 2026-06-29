'use client';

import Link from 'next/link';
import type { Database, NotificationType } from '@/types/database.types';
import { getActionsFor } from './actions';
import { fmtRelative } from '@/lib/intl';

type NotificationRow = Database['public']['Tables']['notifications']['Row'];

const TYPE_ICON: Record<NotificationType, string> = {
  booking_request_received: '🎯',
  vendor_accepted: '✅',
  vendor_adjusted_quote: '💵',
  couple_accepted_adjusted: '✅',
  couple_declined_adjusted: '⚠️',
  deposit_paid: '💰',
  booking_confirmed: '🔒',
  booking_auto_cancelled: '⏱️',
  booking_cancelled: '❌',
  event_completed: '✓',
  booking_completed: '🎉',
  review_received: '⭐',
  custom_request_received: '📋',
  couple_countered: '↩️',
};

function timeAgo(iso: string): string {
  return fmtRelative(iso);
}

interface Props {
  notification: NotificationRow;
  onClick: () => void;
  showAllActions?: boolean;
}

export function NotificationCard({ notification, onClick, showAllActions = false }: Props) {
  const isUnread = !notification.read_at;

  const allActions = getActionsFor(notification);
  const visibleActions = showAllActions ? allActions : allActions.slice(0, 1);

  // Wrapper is a non-interactive list item. The primary click target is a
  // single stretched <Link> (or <button>) overlaid on the title/body so action
  // buttons can sit as SIBLINGS without nesting interactive elements.
  const titleAndBody = (
    <>
      <p className={`text-sm ${isUnread ? 'font-semibold' : 'font-normal'} truncate`}>
        {notification.title}
        {notification.email_status === 'failed' && (
          <span title="Email delivery failed" className="ml-1 text-hot-pink">
            ⚠
          </span>
        )}
      </p>
      <p className="truncate text-xs text-muted-foreground">{notification.body}</p>
      <p className="mt-0.5 text-[10px] uppercase tabular-nums tracking-wide text-muted-foreground">
        {timeAgo(notification.created_at)}
      </p>
    </>
  );

  const primaryClass =
    'absolute inset-0 z-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo focus-visible:ring-offset-2 focus-visible:ring-offset-cream';
  const srLabel = `${notification.title}${isUnread ? ' (unread)' : ''}`;

  return (
    <li
      className={`relative flex items-start gap-3 px-3 py-2 transition-colors focus-within:bg-accent hover:bg-accent ${
        isUnread ? 'bg-blue-50/50' : ''
      }`}
    >
      {/* Stretched primary action — sits behind action buttons via z-index. */}
      {notification.link ? (
        <Link
          href={notification.link}
          onClick={onClick}
          aria-label={srLabel}
          className={primaryClass}
        />
      ) : (
        <button type="button" onClick={onClick} aria-label={srLabel} className={primaryClass} />
      )}

      <span className="relative z-10 shrink-0 text-lg" aria-hidden>
        {TYPE_ICON[notification.type as NotificationType] ?? '🔔'}
      </span>
      <div className="relative z-0 min-w-0 flex-1">
        {titleAndBody}
        {visibleActions.length > 0 && (
          <div
            data-testid="notification-actions"
            className="relative z-10 mt-2 flex flex-wrap gap-2"
          >
            {visibleActions.map((action) => (
              <Link
                key={action.label}
                href={action.href(notification)}
                onClick={onClick}
                className={[
                  'inline-flex items-center rounded px-3 py-1.5 text-sm',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo focus-visible:ring-offset-2 focus-visible:ring-offset-cream',
                  action.variant === 'primary' && 'bg-ink text-cream',
                  action.variant === 'secondary' && 'border border-ink bg-cream text-ink',
                  action.variant === 'destructive' && 'bg-cream text-hot-pink',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                {action.label}
              </Link>
            ))}
          </div>
        )}
      </div>
      {isUnread && (
        <span
          className="relative z-10 h-2 w-2 shrink-0 rounded-full bg-blue-500"
          aria-hidden="true"
        >
          <span className="sr-only">Unread</span>
        </span>
      )}
    </li>
  );
}
