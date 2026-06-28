import { VendorGridSkeleton } from '@/components/marketplace/VendorGrid';

export default function VendorsLoading() {
  return (
    <div className="py-8" role="status" aria-live="polite">
      <span className="sr-only">Loading vendors…</span>
      <div className="mb-6 space-y-2">
        <div className="h-8 w-48 animate-pulse rounded bg-muted motion-reduce:animate-none" />
        <div className="h-5 w-32 animate-pulse rounded bg-muted motion-reduce:animate-none" />
      </div>
      <VendorGridSkeleton />
    </div>
  );
}
