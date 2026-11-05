'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useQueryState, parseAsStringEnum } from 'nuqs';
import { Bell, CalendarCheck, MessageSquare, Wallet, type LucideIcon } from 'lucide-react';
import type { Database, NotificationType } from '@/types/database.types';
import { isHighPriority } from '@/lib/notifications/high-priority-types';
import { getActionsFor } from './actions';
import { fmtRelative } from '@/lib/intl';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type NotificationRow = Database['public']['Tables']['notifications']['Row'];

const ARCHIVE_AGE_DAYS = 30;

type Tab = 'all' | 'action' | 'updates' | 'archived';

interface Props {
  userId: string;
  initial: NotificationRow[];
}

function isArchived(n: NotificationRow): boolean {
  if (!n.read_at) return false;
  const age = Date.now() - new Date(n.read_at).getTime();
  return age > ARCHIVE_AGE_DAYS * 24 * 60 * 60 * 1000;
}

function partition(notifications: NotificationRow[]) {
  const action: NotificationRow[] = [];
  const updates: NotificationRow[] = [];
  const archived: NotificationRow[] = [];
  for (const n of notifications) {
    if (isArchived(n)) {
      archived.push(n);
    } else if (!n.read_at && isHighPriority(n.type as NotificationType)) {
      action.push(n);
    } else {
      updates.push(n);
    }
  }
  return { action, updates, archived };
}

/** Maps a notification type to a Figma type-chip icon. */
function iconFor(type: string): LucideIcon {
  if (type === 'deposit_paid') return Wallet;
  if (
    type === 'custom_request_received' ||
    type === 'vendor_adjusted_quote' ||
    type === 'review_received' ||
    type === 'couple_countered'
  ) {
    return MessageSquare;
  }
  if (
    type.startsWith('booking') ||
    type.startsWith('event') ||
    type.startsWith('couple') ||
    type === 'vendor_accepted'
  ) {
    return CalendarCheck;
  }
  return Bell;
}

function bookingIdOf(n: NotificationRow): string | undefined {
  return (n.metadata as { booking_id?: string } | null)?.booking_id ?? undefined;
}

export function NotificationsPageClient({ initial }: Props) {
  const [notifications, setNotifications] = useState<NotificationRow[]>(initial);
  const [tab, setTab] = useQueryState<Tab>(
    'tab',
    parseAsStringEnum<Tab>(['all', 'action', 'updates', 'archived'])
      .withDefault('all')
      .withOptions({ clearOnDefault: true })
  );

  const buckets = useMemo(() => partition(notifications), [notifications]);
  // "All" = everything that isn't archived (action + updates), newest first.
  const nonArchived = useMemo(() => notifications.filter((n) => !isArchived(n)), [notifications]);
  const current =
    tab === 'all'
      ? nonArchived
      : tab === 'action'
        ? buckets.action
        : tab === 'updates'
          ? buckets.updates
          : buckets.archived;

  async function markRead(id: string) {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n))
    );
    await fetch(`/api/notifications/${id}/read`, { method: 'PATCH' });
  }

  async function markAllRead() {
    setNotifications((prev) =>
      prev.map((n) => (n.read_at ? n : { ...n, read_at: new Date().toISOString() }))
    );
    await fetch('/api/notifications/mark-all-read', { method: 'POST' });
  }

  const tabCounts = {
    all: nonArchived.length,
    action: buckets.action.length,
    updates: buckets.updates.length,
    archived: buckets.archived.length,
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'action', label: 'Action needed' },
    { id: 'updates', label: 'Updates' },
    { id: 'archived', label: 'Archived' },
  ];

  const hasUnread = buckets.action.length + buckets.updates.length > 0;

  return (
    <div className="space-y-4">
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {tabCounts.action} action needed, {tabCounts.updates} updates, {tabCounts.archived} archived
      </p>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          {tabs.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => void setTab(t.id)}
                className={cn(
                  'rounded-full px-4 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo focus-visible:ring-offset-2 focus-visible:ring-offset-cream',
                  active ? 'bg-indigo text-cream' : 'text-ink-muted hover:bg-cream-soft'
                )}
              >
                {t.label}
                {t.id !== 'all' && tabCounts[t.id] > 0 && (
                  <span className="ml-1.5 text-xs tabular-nums opacity-80">
                    ({tabCounts[t.id]})
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {hasUnread && (
          <button
            type="button"
            onClick={markAllRead}
            className="inline-flex min-h-10 items-center px-2 text-sm text-ink-muted hover:text-ink hover:underline"
          >
            Mark all read
          </button>
        )}
      </div>

      {current.length === 0 ? (
        <p className="rounded-2xl border border-hairline bg-cream-soft/60 p-8 text-center text-sm text-ink-soft">
          {tab === 'action'
            ? 'Nothing needs your attention right now.'
            : tab === 'archived'
              ? 'Read notifications older than 30 days appear here.'
              : "When bookings move through their lifecycle, you'll see updates here."}
        </p>
      ) : (
        <ul className="m-0 list-none space-y-3 p-0">
          {current.map((n) => {
            const isUnread = !n.read_at;
            const Icon = iconFor(n.type);
            const bookingId = bookingIdOf(n);
            const actions = getActionsFor(n);
            const srLabel = `${n.title}${isUnread ? ' (unread)' : ''}`;
            const stretchedClass =
              'absolute inset-0 z-10 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo focus-visible:ring-offset-2 focus-visible:ring-offset-cream';

            return (
              <li
                key={n.id}
                className={cn(
                  'relative flex gap-3 rounded-2xl border border-hairline bg-white p-4 transition-colors hover:border-indigo/30',
                  isUnread && 'bg-indigo/5'
                )}
              >
                {/* Stretched primary click target — marks read (+ navigates when
                    the notification has a link). Sits above text at z-10; the
                    action buttons sit above it at z-20. */}
                {n.link ? (
                  <Link
                    href={n.link}
                    onClick={() => markRead(n.id)}
                    aria-label={srLabel}
                    className={stretchedClass}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => markRead(n.id)}
                    aria-label={srLabel}
                    className={stretchedClass}
                  />
                )}

                {isUnread && (
                  <span
                    className="pointer-events-none absolute left-2 top-5 size-2 rounded-full bg-indigo"
                    aria-hidden="true"
                  />
                )}

                <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-indigo/10">
                  <Icon className="size-5 text-indigo" aria-hidden="true" />
                </span>

                <div className="relative z-0 min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-semibold text-ink">{n.title}</p>
                    <span className="shrink-0 text-xs text-ink-soft">
                      {fmtRelative(n.created_at)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-ink-soft">{n.body}</p>

                  {bookingId && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <span className="rounded bg-cream-soft px-2 py-0.5 text-[11px] text-ink-muted">
                        Booking #{bookingId.slice(0, 8)}
                      </span>
                    </div>
                  )}

                  {actions.length > 0 && (
                    <div
                      data-testid="notification-actions"
                      className="relative z-20 mt-3 flex flex-wrap gap-2"
                    >
                      {actions.map((action) => (
                        <Button key={action.label} asChild variant={action.variant} size="sm">
                          <Link href={action.href(n)} onClick={() => markRead(n.id)}>
                            {action.label}
                          </Link>
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
