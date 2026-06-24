'use client';

import { useEffect, useState, useRef } from 'react';
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

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-md p-2 hover:bg-accent"
        aria-label={unreadCount > 0 ? `Notifications (${unreadCount} unread)` : 'Notifications'}
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
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
