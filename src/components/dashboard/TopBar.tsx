'use client';

import * as React from 'react';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { ListFilter, Search } from 'lucide-react';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { BusinessSwitcher, type SwitcherBusiness } from '@/components/dashboard/BusinessSwitcher';

interface TopBarProps {
  /** Current user id — drives the notification bell + its dropdown. */
  userId: string;
}

interface BusinessesResponse {
  role: 'couple' | 'vendor' | 'admin' | null;
  activeBusinessId: string | null;
  businesses: SwitcherBusiness[];
  totalCount: number;
}

/**
 * Dashboard content-area top bar: mobile sidebar trigger + search + (multi-
 * business) switcher + notification bell + filter.
 *
 * The sidebar owns the brand wordmark; this bar carries the quick actions the
 * old floating BaazarChrome used to: the notification bell (with its dropdown
 * preview) and, for vendors who run more than one business, the business
 * switcher pill (Sub-project I §3).
 */
export function TopBar({ userId }: TopBarProps) {
  const pathname = usePathname();
  const [biz, setBiz] = useState<BusinessesResponse | null>(null);

  // Business list drives switcher visibility. Fetched client-side and
  // re-fetched on route change (a vendor may add/switch a business), mirroring
  // the old BaazarChrome wiring against the same endpoint.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/users/me/businesses', { credentials: 'include' });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as BusinessesResponse;
        if (!cancelled) setBiz(data);
      } catch {
        // Silent — the switcher simply won't show; retries on next route change.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  const showSwitcher =
    biz?.role === 'vendor' && biz.totalCount > 1 && biz.activeBusinessId !== null;

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
      <div className="flex items-center gap-2 pl-6 sm:gap-3">
        {showSwitcher && (
          <BusinessSwitcher
            activeBusinessId={biz!.activeBusinessId!}
            businesses={biz!.businesses}
          />
        )}
        <NotificationBell userId={userId} />
        {/* TODO(backend): wire dashboard filter */}
        <button type="button" aria-label="Filters" className="inline-flex text-ink">
          <ListFilter className="size-5" aria-hidden />
        </button>
      </div>
    </header>
  );
}
