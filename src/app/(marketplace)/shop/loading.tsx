import { ProductGridSkeleton } from '@/components/marketplace/ProductGrid';

export default function ShopLoading() {
  return (
    <div className="py-8" role="status" aria-live="polite">
      <span className="sr-only">Loading shop…</span>
      <div className="mb-6 space-y-2">
        <div className="h-8 w-56 animate-pulse rounded bg-muted motion-reduce:animate-none" />
        <div className="h-5 w-80 max-w-full animate-pulse rounded bg-muted motion-reduce:animate-none" />
      </div>
      <div className="mb-8 flex flex-wrap gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-8 w-20 animate-pulse rounded-full bg-muted motion-reduce:animate-none"
          />
        ))}
      </div>
      <ProductGridSkeleton />
    </div>
  );
}
