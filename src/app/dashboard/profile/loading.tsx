import { Skeleton } from '@/components/ui/skeleton';

/**
 * Route-level loading skeleton for /dashboard/profile. Header row + form
 * blocks matching VendorProfileForm's stacked sections.
 */
export default function ProfileLoading() {
  return (
    <div className="space-y-6" role="status" aria-live="polite">
      <span className="sr-only">Loading profile…</span>

      <div className="flex items-center justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-8 w-44" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="space-y-2 text-right">
          <Skeleton className="ml-auto h-4 w-28" />
          <Skeleton className="ml-auto h-6 w-12 rounded-full" />
        </div>
      </div>

      <div className="space-y-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-3 rounded-xl border border-hairline p-5">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-10 w-full rounded-md" />
            <Skeleton className="h-10 w-2/3 rounded-md" />
          </div>
        ))}
      </div>
    </div>
  );
}
