// src/components/marketplace/vendor-profile/VendorProfile.tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Star } from 'lucide-react';
import type { Database } from '@/types/database.types';
import { VENDOR_CATEGORY_LABELS } from '@/lib/utils';

import { OwnerBanner } from '@/components/marketplace/OwnerBanner';
import { ExitPreviewPill } from '@/components/marketplace/ExitPreviewPill';
import { PackageGrid } from '@/components/marketplace/PackageGrid';
import type { PackageWithAddons } from '@/components/marketplace/PackageGrid';

import { IdentityPanel } from './IdentityPanel';
import { PhotoGalleryHero } from './PhotoGalleryHero';
import { PhotoCarouselHero } from './PhotoCarouselHero';
import { BookingStickyCard } from './BookingStickyCard';
import { BookingBottomBar } from './BookingBottomBar';
import { getFeaturedPackage } from './helpers';
import { fmtDate } from '@/lib/intl';

type VendorRow = Database['public']['Tables']['vendor_profiles']['Row'];

interface ReviewItem {
  id: string;
  rating_overall: number;
  comment: string | null;
  created_at: string;
  users: { full_name: string | null } | { full_name: string | null }[] | null;
}

interface VendorProfileProps {
  vendor: VendorRow;
  showBookingButton?: boolean;
  reviews?: ReviewItem[];
  packages?: PackageWithAddons[];
  isOwner?: boolean;
  interactive?: boolean;
}

function reviewerName(users: ReviewItem['users']): string {
  const row = Array.isArray(users) ? users[0] : users;
  return row?.full_name?.split(' ')[0] || 'A customer';
}

export function VendorProfile({
  vendor,
  showBookingButton = true,
  reviews = [],
  packages = [],
  isOwner = false,
  interactive: interactiveProp,
}: VendorProfileProps) {
  const router = useRouter();
  const [previewMode, setPreviewMode] = useState(false);
  const interactive = (interactiveProp ?? (!isOwner || previewMode)) && showBookingButton;
  const showBanner = isOwner && !previewMode;
  const featured = getFeaturedPackage(packages);

  function handleRequestBooking(pkgId: string | null) {
    if (!interactive) {
      toast('Preview mode — bookings disabled.');
      return;
    }
    if (pkgId) {
      // Booking-form route expects a selected package — push with query so the form pre-selects
      router.push(`/vendors/${vendor.slug}/book?package=${pkgId}`);
    } else {
      // Zero-packages fallback OR vendor sticky card "send a custom request"
      router.push(`/vendors/${vendor.slug}/request`);
    }
  }

  const images = vendor.portfolio_images ?? [];
  const hasReviews = vendor.review_count > 0 && vendor.average_rating != null;

  return (
    <>
      {showBanner && (
        <OwnerBanner
          onPreview={() => setPreviewMode(true)}
          editHref="/dashboard/profile/setup/basics"
        />
      )}

      <div className="mx-auto max-w-6xl px-4 py-4 pb-24 md:pb-4">
        {/* Breadcrumb */}
        <nav className="mb-4 text-xs text-ink/60">
          <Link href="/vendors" className="hover-pink-text">
            {VENDOR_CATEGORY_LABELS[vendor.category] || vendor.category}
          </Link>
          <span className="mx-1">·</span>
          <span>{vendor.service_area?.[0] || 'Chicago'}</span>
          <span className="mx-1">·</span>
          <span translate="no">{vendor.business_name}</span>
        </nav>

        {/* Mobile carousel + bio + packages (single column) */}
        <div className="md:hidden">
          <PhotoCarouselHero
            images={images}
            businessName={vendor.business_name ?? 'Vendor'}
            vendorId={vendor.id}
            interactive={interactive}
          />
          <div className="mt-6 space-y-8">
            <IdentityPanel vendor={vendor} />
            {packages.length > 0 && (
              <div id="packages-section">
                <h2 className="font-spectral text-xl font-semibold text-ink">
                  Choose your package
                </h2>
                <p className="mt-1 text-pretty text-xs text-ink/70">
                  Compare side-by-side. All prices include setup, breakdown, and one attendant.
                </p>
                <div className="mt-4">
                  <PackageGrid
                    packages={packages}
                    vendorSlug={vendor.slug ?? ''}
                    interactive={interactive}
                    featuredPackageId={featured?.id}
                  />
                </div>
                <p className="mt-4 text-center text-xs">
                  Don’t see what you need?{' '}
                  <Link
                    href={`/vendors/${vendor.slug}/request`}
                    className="text-ink underline hover-pink-text"
                  >
                    Send a custom request →
                  </Link>
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Desktop split layout */}
        <div className="hidden md:block">
          <div className="grid grid-cols-[1.6fr_1fr] gap-8">
            <div className="space-y-8">
              <PhotoGalleryHero images={images} businessName={vendor.business_name ?? 'Vendor'} />
              <IdentityPanel vendor={vendor} />

              {packages.length > 0 && (
                <div id="packages-section" className="pt-8 shadow-[0_-1px_0_rgba(0,0,0,0.06)]">
                  <h2 className="font-spectral text-xl font-semibold text-ink">
                    Choose your package
                  </h2>
                  <p className="mt-1 text-pretty text-xs text-ink/70">
                    Compare side-by-side. All prices include setup, breakdown, and one attendant.
                  </p>
                  <div className="mt-4">
                    <PackageGrid
                      packages={packages}
                      vendorSlug={vendor.slug ?? ''}
                      interactive={interactive}
                      featuredPackageId={featured?.id}
                    />
                  </div>
                  <p className="mt-4 text-center text-xs">
                    Don’t see what you need?{' '}
                    <Link
                      href={`/vendors/${vendor.slug}/request`}
                      className="text-ink underline hover-pink-text"
                    >
                      Send a custom request →
                    </Link>
                  </p>
                </div>
              )}
            </div>

            <div>
              <BookingStickyCard
                vendor={vendor}
                packages={packages}
                interactive={interactive}
                onRequestBooking={handleRequestBooking}
              />
            </div>
          </div>
        </div>

        {/* Reviews — full-width below everything on both layouts */}
        {hasReviews && (
          <div id="reviews-section" className="mt-12 pt-8 shadow-[0_-1px_0_rgba(0,0,0,0.06)]">
            <div className="mb-6 flex items-center gap-3">
              <h2 className="font-spectral text-xl font-semibold text-ink">Reviews</h2>
              <span className="text-2xl font-bold tabular-nums text-ink">
                {vendor.average_rating!.toFixed(1)}
              </span>
              <span className="flex text-amber-400">
                {[1, 2, 3, 4, 5].map((n) => (
                  <Star
                    key={n}
                    className={`h-5 w-5 ${
                      n <= Math.round(vendor.average_rating!) ? 'fill-current' : 'fill-none'
                    }`}
                  />
                ))}
              </span>
              <span className="text-sm tabular-nums text-ink/60">
                ({vendor.review_count} reviews)
              </span>
            </div>

            <div className="space-y-4">
              {reviews.map((r) => (
                <article key={r.id} className="rounded-lg border border-ink/10 bg-white p-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-1.5 font-semibold text-ink">
                      <span className="flex text-amber-400">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <Star
                            key={n}
                            className={`h-3.5 w-3.5 ${n <= Math.round(r.rating_overall) ? 'fill-current' : 'fill-none'}`}
                          />
                        ))}
                      </span>
                      {reviewerName(r.users)}
                    </span>
                    <span className="text-xs text-ink/50">{fmtDate(r.created_at)}</span>
                  </div>
                  {r.comment && (
                    <p className="mt-2 whitespace-pre-wrap text-sm text-ink/85">{r.comment}</p>
                  )}
                </article>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Mobile sticky bottom bar (rendered outside main padding) */}
      <BookingBottomBar
        packages={packages}
        interactive={interactive}
        onRequestBooking={handleRequestBooking}
      />

      {isOwner && previewMode && <ExitPreviewPill onExit={() => setPreviewMode(false)} />}
    </>
  );
}
