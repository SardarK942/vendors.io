'use client';

import { Button } from '@/components/ui/button';
import type { Database } from '@/types/database.types';
import type { PackageWithAddons } from '@/components/marketplace/PackageGrid';
import {
  getFeaturedPackage,
  calculateDeposit,
  calculateRemaining,
  formatPrice,
  scrollToPackages,
} from './helpers';

type VendorRow = Database['public']['Tables']['vendor_profiles']['Row'];

interface BookingStickyCardProps {
  vendor: VendorRow;
  packages: PackageWithAddons[];
  interactive: boolean;
  onRequestBooking: (pkgId: string | null) => void;
}

export function BookingStickyCard({
  vendor,
  packages,
  interactive,
  onRequestBooking,
}: BookingStickyCardProps) {
  const featured = getFeaturedPackage(packages);

  // Fallback variant — vendor with zero packages
  if (!featured || featured.base_price_cents == null) {
    return (
      <aside
        data-testid="vendor-sticky-card"
        className="sticky top-6 rounded-lg border-2 border-ink bg-white p-5 shadow-md"
      >
        <p className="text-sm text-ink">
          This vendor hasn&apos;t listed packages yet. Reach out to ask about availability and
          pricing.
        </p>
        <Button
          className="mt-4 w-full"
          size="lg"
          onClick={() => onRequestBooking(null)}
          disabled={!interactive}
        >
          Send a custom request →
        </Button>
        <TrustRow vendor={vendor} />
      </aside>
    );
  }

  const total = featured.base_price_cents;
  const deposit = calculateDeposit(total);
  const remaining = calculateRemaining(total);

  return (
    <aside
      data-testid="vendor-sticky-card"
      className="sticky top-6 rounded-lg border-2 border-ink bg-white p-5 shadow-md"
    >
      <span className="inline-block rounded-full bg-hot-pink/10 px-2.5 py-1 text-xs font-medium text-hot-pink">
        Most popular
      </span>
      <h3 className="mt-3 text-base font-semibold text-ink">{featured.name}</h3>
      {featured.duration_hours != null && (
        <p className="text-xs text-ink/70">{featured.duration_hours} hours</p>
      )}

      <p className="mt-3 text-3xl font-bold text-ink">{formatPrice(total)}</p>
      <p className="text-xs text-ink/60">Total cost (everything included)</p>

      <div className="my-4 rounded-md bg-cream p-3 text-center text-xs text-ink">
        Pay <b className="text-hot-pink">{formatPrice(deposit)}</b> deposit today ·{' '}
        {formatPrice(remaining)} due to vendor at event
      </div>

      <Button
        className="w-full"
        size="lg"
        onClick={() => onRequestBooking(featured.id)}
        disabled={!interactive}
      >
        Request Booking →
      </Button>

      {packages.length > 1 && (
        <button
          type="button"
          onClick={scrollToPackages}
          className="mt-3 block w-full text-center text-xs text-ink underline hover-pink-text"
        >
          or compare all {packages.length} packages ↓
        </button>
      )}

      <TrustRow vendor={vendor} />
    </aside>
  );
}

function TrustRow({ vendor }: { vendor: VendorRow }) {
  return (
    <div className="mt-4 flex items-start justify-around border-t border-ink/10 pt-4 text-center text-xs text-ink">
      {vendor.average_rating != null && vendor.review_count != null && vendor.review_count > 0 && (
        <div>
          <div className="font-semibold">★ {vendor.average_rating.toFixed(1)}</div>
          <div className="text-ink/60">{vendor.review_count} reviews</div>
        </div>
      )}
      {vendor.response_sla_hours != null && (
        <div>
          <div className="font-semibold">⚡ {vendor.response_sla_hours}h</div>
          <div className="text-ink/60">Response time</div>
        </div>
      )}
      {vendor.total_bookings != null && vendor.total_bookings > 0 && (
        <div>
          <div className="font-semibold">✓ {vendor.total_bookings.toLocaleString()}</div>
          <div className="text-ink/60">Events</div>
        </div>
      )}
    </div>
  );
}
