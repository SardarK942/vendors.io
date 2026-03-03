import { VendorGridSkeleton } from '@/components/marketplace/VendorGrid';

export default function VendorsLoading() {
  return (
    <div className="py-8">
      <div className="mb-6 space-y-2">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="h-5 w-32 animate-pulse rounded bg-muted" />
      </div>
      <VendorGridSkeleton />
    </div>
  );
}
