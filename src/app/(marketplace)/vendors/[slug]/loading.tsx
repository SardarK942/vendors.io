import { Skeleton } from '@/components/ui/skeleton';

/**
 * Route-level loading skeleton for /vendors/[slug]. Shape-matches the
 * VendorProfile split layout (hero carousel, identity panel + content stack
 * on the left, sticky booking card on the right) so the jump to real
 * content is small.
 */
export default function VendorProfileLoading() {
  return (
    <div className="py-8" role="status" aria-live="polite">
      <span className="sr-only">Loading vendor…</span>

      {/* Hero carousel */}
      <Skeleton className="mb-8 aspect-[16/9] w-full rounded-2xl sm:aspect-[2.4/1]" />

      <div className="grid gap-10 lg:grid-cols-[1fr_360px]">
        {/* Left column: identity + body */}
        <div className="space-y-8">
          {/* Identity panel */}
          <div className="flex items-start gap-4">
            <Skeleton className="size-16 shrink-0 rounded-full" />
            <div className="flex-1 space-y-3">
              <Skeleton className="h-7 w-2/3" />
              <Skeleton className="h-4 w-1/2" />
              <div className="flex gap-2">
                <Skeleton className="h-6 w-20 rounded-full" />
                <Skeleton className="h-6 w-24 rounded-full" />
              </div>
            </div>
          </div>

          {/* About paragraph */}
          <div className="space-y-2">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
          </div>

          {/* Packages grid */}
          <div className="space-y-3">
            <Skeleton className="h-5 w-24" />
            <div className="grid gap-4 sm:grid-cols-2">
              <Skeleton className="h-44 rounded-xl" />
              <Skeleton className="h-44 rounded-xl" />
            </div>
          </div>
        </div>

        {/* Right column: sticky booking card */}
        <aside className="hidden lg:block">
          <div className="space-y-3 rounded-2xl border border-hairline p-5">
            <Skeleton className="h-7 w-32" />
            <Skeleton className="h-4 w-40" />
            <Skeleton className="my-3 h-px w-full rounded-none" />
            <Skeleton className="h-11 w-full rounded-full" />
            <Skeleton className="h-9 w-full rounded-full" />
          </div>
        </aside>
      </div>
    </div>
  );
}
