import Link from 'next/link';
import { VENDOR_CATEGORY_LABELS } from '@/lib/utils';

interface UnclaimedVendor {
  id: string;
  slug: string;
  business_name: string;
  category: string | null;
  city: string | null;
  state: string;
  instagram_handle: string | null;
  bio: string | null;
  photos: string[];
}

interface Props {
  vendor: UnclaimedVendor;
}

export function UnclaimedVendorCard({ vendor }: Props) {
  const heroPhoto = vendor.photos[0];
  const categoryLabel =
    (vendor.category && (VENDOR_CATEGORY_LABELS as Record<string, string>)[vendor.category]) ||
    vendor.category ||
    'Vendor';

  return (
    <Link
      href={`/vendors/${vendor.slug}`}
      className="group block overflow-hidden rounded-lg border bg-card transition hover:shadow-md"
    >
      <div className="relative aspect-[4/5] bg-muted">
        {heroPhoto ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={heroPhoto} alt={vendor.business_name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
            No photo
          </div>
        )}
        <span className="absolute right-2 top-2 rounded bg-background/95 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Unclaimed
        </span>
      </div>
      <div className="p-3">
        <p className="font-medium">{vendor.business_name}</p>
        <p className="text-xs text-muted-foreground">
          {categoryLabel}
          {vendor.city ? ` · ${vendor.city}` : ''}
        </p>
      </div>
    </Link>
  );
}
