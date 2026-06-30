import { Skeleton } from '@/components/ui/skeleton';

/**
 * Route-level loading skeleton for /dashboard/money. Header stack + earnings
 * card placeholder (stat blocks + chart area).
 */
export default function MoneyLoading() {
  return (
    <div className="space-y-6" role="status" aria-live="polite">
      <span className="sr-only">Loading earnings…</span>

      <div className="space-y-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-72" />
      </div>

      {/* Earnings card */}
      <div className="space-y-6 rounded-xl border border-hairline p-6">
        <div className="grid gap-6 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-32" />
              <Skeleton className="h-3 w-16" />
            </div>
          ))}
        </div>
        <Skeleton className="h-48 w-full rounded-lg" />
      </div>
    </div>
  );
}
