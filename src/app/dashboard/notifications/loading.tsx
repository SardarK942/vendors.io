import { Skeleton } from '@/components/ui/skeleton';

/**
 * Route-level loading skeleton for /dashboard/notifications. Header + a
 * stack of notification-row placeholders matching NotificationCard's shape.
 */
export default function NotificationsLoading() {
  return (
    <div className="space-y-6" role="status" aria-live="polite">
      <span className="sr-only">Loading notifications…</span>

      <Skeleton className="h-8 w-48" />

      <div className="divide-y divide-hairline rounded-xl border border-hairline">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex gap-3 p-4">
            <Skeleton className="size-10 shrink-0 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
            </div>
            <Skeleton className="h-3 w-12 shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}
