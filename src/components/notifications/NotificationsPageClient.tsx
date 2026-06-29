'use client';

import { useState, useMemo } from 'react';
import { useQueryState, parseAsStringEnum, parseAsArrayOf, parseAsString } from 'nuqs';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { Database, NotificationType } from '@/types/database.types';
import { isHighPriority } from '@/lib/notifications/high-priority-types';
import { NotificationCard } from './NotificationCard';

type NotificationRow = Database['public']['Tables']['notifications']['Row'];

const ARCHIVE_AGE_DAYS = 30;

type Tab = 'action' | 'updates' | 'archived';

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

function groupByBooking(notifications: NotificationRow[]): Map<string, NotificationRow[]> {
  const groups = new Map<string, NotificationRow[]>();
  for (const n of notifications) {
    const bookingId = (n.metadata as { booking_id?: string })?.booking_id ?? '__other__';
    if (!groups.has(bookingId)) groups.set(bookingId, []);
    groups.get(bookingId)!.push(n);
  }
  // Sort each group's notifications newest first (already from query); preserve insertion order of groups
  return groups;
}

export function NotificationsPageClient({ initial }: Props) {
  const [notifications, setNotifications] = useState<NotificationRow[]>(initial);
  const [tab, setTab] = useQueryState<Tab>(
    'tab',
    parseAsStringEnum<Tab>(['action', 'updates', 'archived'])
      .withDefault('action')
      .withOptions({ clearOnDefault: true })
  );
  const [collapsedList, setCollapsedList] = useQueryState(
    'collapsed',
    parseAsArrayOf(parseAsString).withDefault([]).withOptions({ clearOnDefault: true })
  );
  const collapsedGroups = useMemo(() => new Set(collapsedList), [collapsedList]);

  const buckets = useMemo(() => partition(notifications), [notifications]);
  const current = buckets[tab === 'action' ? 'action' : tab === 'updates' ? 'updates' : 'archived'];
  const groups = useMemo(() => groupByBooking(current), [current]);

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

  function toggleGroup(key: string) {
    const next = new Set(collapsedGroups);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    void setCollapsedList(Array.from(next));
  }

  const tabCounts = {
    action: buckets.action.length,
    updates: buckets.updates.length,
    archived: buckets.archived.length,
  };

  return (
    <div className="space-y-4">
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {tabCounts.action} action needed, {tabCounts.updates} updates, {tabCounts.archived} archived
      </p>
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          {(['action', 'updates', 'archived'] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => void setTab(t)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo focus-visible:ring-offset-2 focus-visible:ring-offset-cream ${
                tab === t
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-accent'
              }`}
            >
              {t === 'action' ? 'Action needed' : t === 'updates' ? 'Updates' : 'Archived'}
              {tabCounts[t] > 0 && (
                <span className="ml-1.5 text-xs tabular-nums opacity-80">({tabCounts[t]})</span>
              )}
            </button>
          ))}
        </div>
        {buckets.action.length + buckets.updates.length > 0 && (
          <button
            type="button"
            onClick={markAllRead}
            className="text-sm text-muted-foreground hover:text-foreground hover:underline"
          >
            Mark all read
          </button>
        )}
      </div>

      <div className="space-y-3">
        {current.length === 0 ? (
          <p className="rounded-lg border bg-muted/30 p-8 text-center text-sm text-muted-foreground">
            {tab === 'action'
              ? 'Nothing needs your attention right now. 🎉'
              : tab === 'updates'
                ? "When bookings move through their lifecycle, you'll see updates here."
                : 'Read notifications older than 30 days appear here.'}
          </p>
        ) : (
          Array.from(groups.entries()).map(([bookingId, items]) => {
            const collapsed = collapsedGroups.has(bookingId);
            const headerLabel =
              bookingId === '__other__' ? 'Other' : `Booking ${bookingId.slice(0, 8)}…`;
            return (
              <div key={bookingId} className="overflow-hidden rounded-lg border bg-card">
                <button
                  type="button"
                  onClick={() => toggleGroup(bookingId)}
                  className="flex w-full items-center justify-between border-b bg-muted/30 px-4 py-2 text-left text-sm font-medium hover:bg-muted/50"
                >
                  <span>
                    {headerLabel}{' '}
                    <span className="text-xs text-muted-foreground">({items.length})</span>
                  </span>
                  {collapsed ? (
                    <ChevronRight className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </button>
                {!collapsed && (
                  <ul className="m-0 list-none divide-y p-0">
                    {items.map((n) => (
                      <NotificationCard
                        key={n.id}
                        notification={n}
                        onClick={() => markRead(n.id)}
                        showAllActions
                      />
                    ))}
                  </ul>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
