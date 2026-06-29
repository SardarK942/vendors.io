'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
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
  const reducedMotion = useReducedMotion();
  const enterSpring = reducedMotion
    ? { duration: 0 }
    : { type: 'spring' as const, duration: 0.22, bounce: 0 };

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
    <motion.div
      ref={ref}
      className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-lg border bg-popover shadow-lg"
      role="dialog"
      aria-label="Notifications"
      initial={{ y: -4, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={enterSpring}
    >
      <motion.div
        className="flex items-center justify-between border-b px-3 py-2"
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...enterSpring, delay: reducedMotion ? 0 : 0.06 }}
      >
        <h3 className="text-sm font-semibold">Notifications</h3>
        {anyUnread && (
          <button
            type="button"
            onClick={handleMarkAll}
            className="inline-flex min-h-10 items-center rounded px-3 text-xs text-primary transition-[transform,color] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo focus-visible:ring-offset-2 focus-visible:ring-offset-cream active:scale-[0.96] motion-reduce:active:scale-100"
          >
            Mark All Read
          </button>
        )}
      </motion.div>

      <motion.div
        className="max-h-96 overflow-y-auto"
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...enterSpring, delay: reducedMotion ? 0 : 0.06 }}
      >
        {notifications.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-muted-foreground">
            No notifications yet.
          </p>
        ) : (
          <ul className="m-0 list-none p-0">
            {notifications.slice(0, 10).map((n) => (
              <NotificationCard
                key={n.id}
                notification={n}
                onClick={() => handleRowClick(n.id, !n.read_at)}
              />
            ))}
          </ul>
        )}
      </motion.div>

      <motion.div
        className="border-t"
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...enterSpring, delay: reducedMotion ? 0 : 0.12 }}
      >
        <Link
          href="/dashboard/notifications"
          onClick={onClose}
          className="block min-h-10 px-3 py-2 text-center text-xs font-medium leading-6 text-primary transition-[transform,background-color] hover:bg-accent active:scale-[0.96] motion-reduce:active:scale-100"
        >
          See all →
        </Link>
      </motion.div>
    </motion.div>
  );
}
