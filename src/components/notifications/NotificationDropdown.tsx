'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import type { Database } from '@/types/database.types';
import { NotificationCard } from './NotificationCard';

type NotificationRow = Database['public']['Tables']['notifications']['Row'];

interface Props {
  notifications: NotificationRow[];
  onClose: () => void;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
}

export function NotificationDropdown({ notifications, onClose, onMarkRead, onMarkAllRead }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  // Click outside closes
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const anyUnread = notifications.some((n) => !n.read_at);

  async function handleMarkAll() {
    onMarkAllRead(); // optimistic
    await fetch('/api/notifications/mark-all-read', { method: 'POST' });
  }

  async function handleRowClick(id: string, isUnread: boolean) {
    if (!isUnread) return;
    onMarkRead(id);
    await fetch(`/api/notifications/${id}/read`, { method: 'PATCH' });
  }

  return (
    <div
      ref={ref}
      className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-lg border bg-popover shadow-lg"
      role="dialog"
      aria-label="Notifications"
    >
      <div className="flex items-center justify-between border-b px-3 py-2">
        <h3 className="text-sm font-semibold">Notifications</h3>
        {anyUnread && (
          <button
            type="button"
            onClick={handleMarkAll}
            className="text-xs text-primary hover:underline"
          >
            Mark All Read
          </button>
        )}
      </div>

      <div className="max-h-96 overflow-y-auto">
        {notifications.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-muted-foreground">
            No notifications yet.
          </p>
        ) : (
          notifications
            .slice(0, 10)
            .map((n) => (
              <NotificationCard
                key={n.id}
                notification={n}
                onClick={() => handleRowClick(n.id, !n.read_at)}
              />
            ))
        )}
      </div>

      <div className="border-t">
        <Link
          href="/dashboard/notifications"
          onClick={onClose}
          className="block px-3 py-2 text-center text-xs font-medium text-primary hover:bg-accent"
        >
          See all →
        </Link>
      </div>
    </div>
  );
}
