'use client';

import { Button } from '@/components/ui/button';
import { ArrowRight, ChevronDown } from 'lucide-react';
import type { Database } from '@/types/database.types';
import { VendorSocials } from './VendorSocials';
import type { PackageWithAddons } from '@/components/marketplace/PackageGrid';
import {
  getFeaturedPackage,
  calculateDeposit,
  calculateRemaining,
  formatPrice,
  scrollToPackages,
} from './helpers';
import { fmtCount } from '@/lib/intl';

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
        className="sticky top-6 z-30 rounded-lg border border-hairline bg-cream-soft p-5 shadow-[rgba(27,20,20,0.04)_0_2px_6px_0,rgba(27,20,20,0.10)_0_4px_16px_0]"
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo">
          Request to book
        </p>
        <p className="mt-2 text-sm leading-relaxed text-ink">
          Every booking with this vendor starts with a custom quote. Send your event details and
          they&rsquo;ll get back to you with pricing.
        </p>
        <Button
          className="mt-4 w-full"
          size="lg"
          onClick={() => onRequestBooking(null)}
          disabled={!interactive}
        >
          <span className="inline-flex items-center gap-1.5">
            Request a quote
            <ArrowRight className="size-4 translate-y-px" aria-hidden="true" />
          </span>
        </Button>
        <TrustRow vendor={vendor} />
        <VendorSocials
          vendor={vendor}
          className="mt-3 justify-center pt-3 text-xs shadow-[inset_0_1px_0_rgba(0,0,0,0.04)]"
        />
      </aside>
    );
  }

  const total = featured.base_price_cents;
  const deposit = calculateDeposit(total);
  const remaining = calculateRemaining(total);

  return (
    <aside
      data-testid="vendor-sticky-card"
      className="sticky top-6 z-30 rounded-lg border border-hairline bg-cream-soft p-5 shadow-[rgba(27,20,20,0.04)_0_2px_6px_0,rgba(27,20,20,0.10)_0_4px_16px_0]"
    >
      <span className="inline-block rounded-full bg-hot-pink/10 px-2.5 py-1 text-xs font-medium text-hot-pink">
        Most popular
      </span>
      <h3 className="mt-3 text-base font-semibold text-ink">{featured.name}</h3>
      {featured.duration_hours != null && (
        <p className="text-xs tabular-nums text-ink/70">
          {featured.duration_hours}
          {' '}hours
        </p>
      )}

      <p className="mt-6 text-3xl font-bold tabular-nums text-ink">{formatPrice(total)}</p>
      <p className="text-xs text-ink/60">Total cost (everything included)</p>

      <div className="my-4 rounded-md border border-hairline bg-cream p-3 text-center text-xs text-ink">
        Pay <b className="tabular-nums text-hot-pink">{formatPrice(deposit)}</b> deposit today.{' '}
        <span className="text-ink/80">
          Vendor will arrange the remaining{' '}
          <span className="tabular-nums">{formatPrice(remaining)}</span> with you.
        </span>
      </div>

      <Button
        className="w-full"
        size="lg"
        onClick={() => onRequestBooking(featured.id)}
        disabled={!interactive}
      >
        <span className="inline-flex items-center gap-1.5">
          Request Booking
          <ArrowRight className="size-4 translate-y-px" aria-hidden="true" />
        </span>
      </Button>

      {packages.length > 1 && (
        <button
          type="button"
          onClick={scrollToPackages}
          className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded text-center text-xs text-ink underline transition-colors hover-pink-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo focus-visible:ring-offset-2 focus-visible:ring-offset-cream"
        >
          or compare all {packages.length} packages
          <ChevronDown className="size-4 translate-y-px" aria-hidden="true" />
        </button>
      )}

      <TrustRow vendor={vendor} />
      <VendorSocials
        vendor={vendor}
        className="mt-3 justify-center pt-3 text-xs shadow-[inset_0_1px_0_rgba(0,0,0,0.04)]"
      />
    </aside>
  );
}

function TrustRow({ vendor }: { vendor: VendorRow }) {
  return (
    <div className="mt-4 flex items-start justify-around pt-4 text-center text-xs tabular-nums text-ink shadow-[inset_0_1px_0_rgba(0,0,0,0.04)]">
      {vendor.average_rating != null && vendor.review_count != null && vendor.review_count > 0 && (
        <div>
          <div className="font-semibold">★ {vendor.average_rating.toFixed(1)}</div>
          <div className="text-ink/60">{fmtCount(vendor.review_count)} reviews</div>
        </div>
      )}
      {vendor.response_sla_hours != null && (
        <div>
          <div className="font-semibold">
            ⚡ {vendor.response_sla_hours}
            {' '}h
          </div>
          <div className="text-ink/60">Response time</div>
        </div>
      )}
      {vendor.total_bookings != null && vendor.total_bookings > 0 && (
        <div>
          <div className="font-semibold">
            <span aria-hidden="true">✓</span> {fmtCount(vendor.total_bookings)}
          </div>
          <div className="text-ink/60">Events</div>
        </div>
      )}
    </div>
  );
}
