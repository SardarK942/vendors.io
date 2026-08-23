// src/components/marketplace/vendor-profile/VendorProfile.tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Star, ArrowLeft } from 'lucide-react';
import type { Database } from '@/types/database.types';

import { OwnerBanner } from '@/components/marketplace/OwnerBanner';
import { ExitPreviewPill } from '@/components/marketplace/ExitPreviewPill';
import { PackageGrid } from '@/components/marketplace/PackageGrid';
import type { PackageWithAddons } from '@/components/marketplace/PackageGrid';
import { CustomRequestModal } from '@/components/booking/CustomRequestModal';
import type { EventOption } from '@/components/events/EventFunctionSelect';

import { IdentityPanel } from './IdentityPanel';
import { VendorHero } from './VendorHero';
import { HowBookingWorks } from './HowBookingWorks';
import { CustomRequestPanel } from './CustomRequestPanel';
import { VendorGallery } from './VendorGallery';
import { BookingStickyCard } from './BookingStickyCard';
import { BookingBottomBar } from './BookingBottomBar';
import { VendorSocials } from './VendorSocials';
import { getFeaturedPackage } from './helpers';
import { fmtDate } from '@/lib/intl';
import { track } from '@/lib/analytics/track';
import { ANALYTICS_EVENTS } from '@/lib/analytics/events';

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
  eventOptions?: EventOption[];
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
  eventOptions = [],
}: VendorProfileProps) {
  const router = useRouter();
  const [previewMode, setPreviewMode] = useState(false);
  const [customRequestOpen, setCustomRequestOpen] = useState(false);
  const interactive = (interactiveProp ?? (!isOwner || previewMode)) && showBookingButton;
  const showBanner = isOwner && !previewMode;
  const featured = getFeaturedPackage(packages);

  useEffect(() => {
    track(ANALYTICS_EVENTS.VENDOR_PROFILE_VIEWED, { slug: vendor.slug });
  }, [vendor.slug]);

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
      setCustomRequestOpen(true);
    }
  }

  const images = vendor.portfolio_images ?? [];
  const hasReviews = vendor.review_count > 0 && vendor.average_rating != null;
  // A single image is shown on the hero plate; only render a portfolio gallery
  // when there is genuinely more than one photo to show.
  const hasGallery = images.length >= 2;

  const packagesSection =
    packages.length > 0 ? (
      <div id="packages-section" className="border-t border-hairline pt-8">
        <h2 className="font-display text-2xl font-bold text-ink">Choose your package</h2>
        <p className="mt-1.5 text-pretty text-sm text-ink/70">
          Compare side-by-side. All prices include setup, breakdown, and one attendant.
        </p>
        <div className="mt-5">
          <PackageGrid
            packages={packages}
            vendorSlug={vendor.slug ?? ''}
            interactive={interactive}
            featuredPackageId={featured?.id}
            onRequestCustomQuote={() => setCustomRequestOpen(true)}
          />
        </div>
        <p className="mt-4 text-center text-sm">
          Don&rsquo;t see what you need?{' '}
          <Link
            href={`/vendors/${vendor.slug}/request`}
            onClick={(e) => {
              e.preventDefault();
              setCustomRequestOpen(true);
            }}
            className="text-ink underline hover-pink-text"
          >
            Request a quote &rarr;
          </Link>
        </p>
      </div>
    ) : (
      <div id="packages-section" className="border-t border-hairline pt-8">
        <CustomRequestPanel
          vendorSlug={vendor.slug ?? ''}
          interactive={interactive}
          onRequest={() => setCustomRequestOpen(true)}
        />
      </div>
    );

  return (
    <>
      {showBanner && (
        <OwnerBanner
          onPreview={() => setPreviewMode(true)}
          editHref="/dashboard/profile/setup/basics"
        />
      )}

      <div className="relative">
        {/* Faint hot-pink dotted texture behind the profile — the same element
            the homepage uses below its hero, for continuity and to lift the
            flat-cream ground so thin content doesn't read as empty. Opaque hero
            band + cards sit on top of it. */}
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-0 -z-10 h-full w-screen -translate-x-1/2"
          style={{
            backgroundColor: '#FBF6EC',
            backgroundImage:
              'radial-gradient(rgba(209,0,108,0.06) 1.5px, transparent 1.5px), radial-gradient(rgba(209,0,108,0.06) 1.5px, #FBF6EC 1.5px)',
            backgroundSize: '20px 20px',
            backgroundPosition: '0 0, 10px 10px',
          }}
        />

        <div className="mx-auto max-w-6xl px-4 py-4 pb-24 md:pb-4">
          {/* Back to the marketplace list. Explicit affordance — a breadcrumb
              read as too subtle to serve as the way back. */}
          <Link
            href="/vendors"
            className="mb-5 inline-flex items-center gap-1.5 text-sm font-medium text-ink/70 transition-colors hover-pink-text"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Browse vendors
          </Link>

          {/* Universal ink brand-band masthead */}
          <VendorHero vendor={vendor} interactive={interactive} />

          {/* Portfolio gallery — clickable, opens a full-screen lightbox */}
          {hasGallery && (
            <div className="mt-4">
              <VendorGallery images={images} businessName={vendor.business_name ?? 'Vendor'} />
            </div>
          )}

          {/* Instagram + website — the desktop rail carries these, but the rail
              is hidden on mobile, so surface them here on mobile only. */}
          <VendorSocials vendor={vendor} className="mt-6 md:hidden" />

          {/* Content + sticky rail. Rail is desktop-only; mobile uses the fixed
            bottom bar. Left column holds the vendor's own content (About +
            packages/custom quote). */}
          <div className="mt-8 grid gap-8 md:grid-cols-[1.6fr_1fr] lg:gap-12">
            <div className="min-w-0 space-y-10">
              <IdentityPanel vendor={vendor} />
              {packagesSection}
            </div>

            <div className="hidden md:block">
              <BookingStickyCard
                vendor={vendor}
                packages={packages}
                interactive={interactive}
                onRequestBooking={handleRequestBooking}
              />
            </div>
          </div>

          {/* Trust band — full width so the four steps breathe and the page
            stays balanced even for thin vendors with a short sticky rail. */}
          <div className="mt-12">
            <HowBookingWorks responseSlaHours={vendor.response_sla_hours} />
          </div>

          {/* Reviews — full-width below everything on both layouts */}
          {hasReviews && (
            <div id="reviews-section" className="mt-12 border-t border-hairline pt-8">
              <div className="mb-6 flex items-center gap-3">
                <h2 className="font-display text-2xl font-bold text-ink">Reviews</h2>
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
                  <article
                    key={r.id}
                    className="rounded-lg border border-hairline bg-cream-soft p-5"
                  >
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
      </div>

      {/* Mobile sticky bottom bar (rendered outside main padding) */}
      <BookingBottomBar
        packages={packages}
        interactive={interactive}
        onRequestBooking={handleRequestBooking}
      />

      {isOwner && previewMode && <ExitPreviewPill onExit={() => setPreviewMode(false)} />}

      <CustomRequestModal
        open={customRequestOpen}
        onOpenChange={setCustomRequestOpen}
        vendorSlug={vendor.slug ?? ''}
        vendorBusinessName={vendor.business_name}
        vendorResponseSlaHours={vendor.response_sla_hours ?? null}
        eventOptions={eventOptions}
      />
    </>
  );
}
