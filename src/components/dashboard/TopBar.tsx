'use client';

import * as React from 'react';
import Link from 'next/link';
import { Bell, ListFilter, Search } from 'lucide-react';
import { SidebarTrigger } from '@/components/ui/sidebar';

interface TopBarProps {
  /** Drives the hot-pink unread dot on the bell. Computed server-side in layout. */
  hasUnreadNotifications: boolean;
}

/**
 * Dashboard content-area top bar: mobile sidebar trigger + search + bell + filter.
 *
 * The sidebar owns the brand wordmark; this bar owns search and the quick
 * notification/filter actions that the old floating BaazarChrome used to carry.
 */
export function TopBar({ hasUnreadNotifications }: TopBarProps) {
  return (
    <header className="flex h-[78px] items-center justify-between border-b border-hairline bg-cream px-4 sm:px-8">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <SidebarTrigger className="text-ink md:hidden" />
        {/* TODO(backend): wire dashboard search */}
        <div className="flex h-[42px] w-full max-w-[540px] items-center gap-2 rounded-lg border border-hairline bg-white px-3">
          <Search className="size-4 shrink-0 text-ink-soft" aria-hidden />
          <span className="truncate font-sans text-xs text-ink-soft">
            Search bookings, packages, or events…
          </span>
        </div>
      </div>
      <div className="flex items-center gap-6 pl-6">
        <Link
          href="/dashboard/notifications"
          aria-label="Notifications"
          className="relative inline-flex"
        >
          <Bell className="size-5 text-ink" aria-hidden />
          {hasUnreadNotifications ? (
            <span
              aria-hidden
              className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-hot-pink shadow-[0_0_0_3px_rgba(209,0,108,0.18)]"
            />
          ) : null}
        </Link>
        {/* TODO(backend): wire dashboard filter */}
        <button type="button" aria-label="Filters" className="inline-flex text-ink">
          <ListFilter className="size-5" aria-hidden />
        </button>
      </div>
    </header>
  );
}
