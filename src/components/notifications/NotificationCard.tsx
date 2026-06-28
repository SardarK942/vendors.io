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

  const inner = (
    <>
      <span className="shrink-0 text-lg" aria-hidden>
        {TYPE_ICON[notification.type as NotificationType] ?? '🔔'}
      </span>
      <div className="min-w-0 flex-1">
        <p className={`text-sm ${isUnread ? 'font-semibold' : 'font-normal'} truncate`}>
          {notification.title}
          {notification.email_status === 'failed' && (
            <span title="Email delivery failed" className="ml-1 text-hot-pink">
              ⚠
            </span>
          )}
        </p>
        <p className="truncate text-xs text-muted-foreground">{notification.body}</p>
        <p className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
          {timeAgo(notification.created_at)}
        </p>
        {visibleActions.length > 0 && (
          <div data-testid="notification-actions" className="mt-2 flex flex-wrap gap-2">
            {visibleActions.map((action) => (
              <Link
                key={action.label}
                href={action.href(notification)}
                onClick={onClick}
                className={[
                  'inline-flex items-center rounded px-3 py-1.5 text-sm',
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
        <span className="h-2 w-2 shrink-0 rounded-full bg-blue-500" aria-label="unread" />
      )}
    </>
  );

  return notification.link ? (
    <Link
      href={notification.link}
      onClick={onClick}
      className={`flex items-start gap-3 px-3 py-2 hover:bg-accent ${isUnread ? 'bg-blue-50/50' : ''}`}
    >
      {inner}
    </Link>
  ) : (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-start gap-3 px-3 py-2 text-left hover:bg-accent ${
        isUnread ? 'bg-blue-50/50' : ''
      }`}
    >
      {inner}
    </button>
  );
}
