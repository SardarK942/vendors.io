'use client';

import { useEffect, useState, useRef } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Bell } from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import type { Database, NotificationType } from '@/types/database.types';
import { isHighPriority } from '@/lib/notifications/high-priority-types';
import { NotificationDropdown } from './NotificationDropdown';

type NotificationRow = Database['public']['Tables']['notifications']['Row'];

interface Props {
  userId: string;
}

export function NotificationBell({ userId }: Props) {
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [open, setOpen] = useState(false);
  const supabase = createClient();
  const isInitialLoad = useRef(true);

  // Initial fetch + realtime subscription
  useEffect(() => {
    let cancelled = false;

    async function loadInitial() {
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(10);
      if (cancelled) return;
      setNotifications((data ?? []) as NotificationRow[]);
      isInitialLoad.current = false;
    }
    loadInitial();

    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as NotificationRow;
          setNotifications((prev) => [row, ...prev].slice(0, 50));
          // Toast for high-priority types on REALTIME arrival only (not initial load)
          if (!isInitialLoad.current && isHighPriority(row.type as NotificationType)) {
            const isFirst = (row.metadata as { is_first?: boolean } | null)?.is_first === true;
            toast(row.title, {
              description: row.body,
              duration: isFirst ? 8000 : 4000,
              action: row.link
                ? {
                    label: 'View',
                    onClick: () => {
                      window.location.href = row.link!;
                    },
                  }
                : undefined,
            });
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as NotificationRow;
          setNotifications((prev) => prev.map((n) => (n.id === row.id ? row : n)));
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [userId, supabase]);

  const unreadCount = notifications.filter((n) => !n.read_at).length;
  const reducedMotion = useReducedMotion();
  const badgeEnter = reducedMotion
    ? { duration: 0 }
    : { type: 'spring' as const, duration: 0.3, bounce: 0 };
  const badgeExit = reducedMotion ? { duration: 0 } : { duration: 0.15 };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-md p-2.5 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo focus-visible:ring-offset-2 focus-visible:ring-offset-cream"
        aria-label={unreadCount > 0 ? `Notifications (${unreadCount} unread)` : 'Notifications'}
      >
        <Bell className="h-5 w-5" aria-hidden="true" />
        <AnimatePresence initial={false}>
          {unreadCount > 0 && (
            <motion.span
              key="badge"
              initial={{ scale: 0.25, opacity: 0, filter: 'blur(4px)' }}
              animate={{ scale: 1, opacity: 1, filter: 'blur(0px)', transition: badgeEnter }}
              exit={{ scale: 0.8, opacity: 0, transition: badgeExit }}
              className="absolute -right-1 -top-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold tabular-nums text-white"
              aria-live="polite"
              aria-atomic="true"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </motion.span>
          )}
        </AnimatePresence>
      </button>

      {open && (
        <NotificationDropdown
          notifications={notifications}
          onClose={() => setOpen(false)}
          onMarkRead={(id) => {
            setNotifications((prev) =>
              prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n))
            );
          }}
          onMarkAllRead={() => {
            setNotifications((prev) =>
              prev.map((n) => (n.read_at ? n : { ...n, read_at: new Date().toISOString() }))
            );
          }}
        />
      )}
    </div>
  );
}
