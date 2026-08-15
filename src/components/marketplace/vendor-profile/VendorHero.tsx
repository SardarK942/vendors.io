'use client';

import Image from 'next/image';
import { useRouter, usePathname } from 'next/navigation';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Heart, BadgeCheck, MapPin, Languages, CalendarDays, Zap, Star } from 'lucide-react';
import { useSavedVendors } from '@/components/marketplace/SavedVendorsProvider';
import { VENDOR_CATEGORY_LABELS } from '@/lib/utils';
import { fmtCount } from '@/lib/intl';
import type { Database } from '@/types/database.types';

type VendorRow = Database['public']['Tables']['vendor_profiles']['Row'];

interface VendorHeroProps {
  vendor: VendorRow;
  interactive: boolean;
}

/** Two initials from the business name, for the no-image monogram fallback. */
function monogram(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '·';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

/**
 * Universal ink brand-band masthead for the vendor profile.
 * A photo-less vendor's single image (usually a logo) sits on a plate at left;
 * the identity — oversized Spectral name, indigo category kicker, and a spec
 * row of trust signals — reverses out in cream on the ink band. Vendors WITH a
 * real portfolio show their gallery in a separate section below this band.
 */
export function VendorHero({ vendor, interactive }: VendorHeroProps) {
  const { savedIds, toggle, authenticated } = useSavedVendors();
  const router = useRouter();
  const pathname = usePathname();
  const reducedMotion = useReducedMotion();

  const images = vendor.portfolio_images ?? [];
  const plateImage = images[0] ?? null;
  const isSaved = savedIds.has(vendor.id);
  const category = VENDOR_CATEGORY_LABELS[vendor.category] || vendor.category;
  const location = vendor.service_area?.length ? vendor.service_area.join(' · ') : 'Chicago';
  const heartTransition = reducedMotion
    ? { duration: 0 }
    : { type: 'spring' as const, duration: 0.3, bounce: 0 };

  async function handleHeart() {
    if (!interactive) return;
    if (!authenticated) {
      router.push(`/login?redirect=${encodeURIComponent(pathname)}`);
      return;
    }
    await toggle(vendor.id);
  }

  const enter = reducedMotion
    ? {}
    : {
        initial: { opacity: 0, y: 12 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as const },
      };

  return (
    <motion.section
      {...enter}
      data-testid="vendor-hero"
      className="relative overflow-hidden rounded-lg bg-ink text-cream"
    >
      {/* faint textile-derived corner glow — cultural anchor, not ornament */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full opacity-[0.16] blur-2xl"
        style={{ background: 'radial-gradient(closest-side, #D1006C, transparent)' }}
      />

      <button
        type="button"
        onClick={handleHeart}
        disabled={!interactive}
        aria-label={isSaved ? 'Unsave vendor' : 'Save vendor'}
        className="absolute right-4 top-4 z-10 flex h-11 w-11 items-center justify-center rounded-full border border-cream/20 bg-ink/40 backdrop-blur transition-colors hover:border-cream/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cream focus-visible:ring-offset-2 focus-visible:ring-offset-ink active:scale-[0.96] disabled:opacity-50 motion-reduce:active:scale-100"
      >
        <AnimatePresence initial={false} mode="popLayout">
          <motion.span
            key={isSaved ? 'filled' : 'outline'}
            initial={{ scale: 0.25, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.25, opacity: 0 }}
            transition={heartTransition}
            className="inline-flex"
            aria-hidden="true"
          >
            <Heart className={`h-5 w-5 ${isSaved ? 'fill-red-500 text-red-500' : 'text-cream'}`} />
          </motion.span>
        </AnimatePresence>
      </button>

      <div className="flex flex-col gap-6 p-6 sm:flex-row sm:items-center sm:gap-8 sm:p-8 lg:p-10">
        {/* Brand plate */}
        <div className="shrink-0">
          <div className="relative h-36 w-36 overflow-hidden rounded-md bg-cream-soft ring-1 ring-inset ring-cream/10 sm:h-44 sm:w-44 lg:h-48 lg:w-48">
            {plateImage ? (
              <Image
                src={plateImage}
                alt={vendor.business_name ?? 'Vendor'}
                fill
                sizes="192px"
                className="object-cover"
                priority
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <span className="font-display text-5xl font-bold text-ink/70" translate="no">
                  {monogram(vendor.business_name ?? '')}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Identity */}
        <div className="min-w-0 flex-1">
          {/* Light indigo keeps the system-color identity while clearing WCAG AA
              on the ink band (indigo/indigo-soft are too dark on ink). */}
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#A6B1F2]">
            {category}
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
            <h1
              className="font-display text-3xl font-bold leading-[0.95] tracking-tight text-cream sm:text-4xl lg:text-5xl"
              translate="no"
            >
              {vendor.business_name}
            </h1>
            {vendor.verified && (
              <span className="inline-flex items-center gap-1 rounded-full border border-cream/20 bg-cream/10 px-2.5 py-1 text-xs font-medium text-cream">
                <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" /> Verified
              </span>
            )}
          </div>

          {/* Spec row */}
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-cream/75">
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="h-4 w-4 text-cream/50" aria-hidden="true" />
              {location}
            </span>
            {vendor.languages && vendor.languages.length > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <Languages className="h-4 w-4 text-cream/50" aria-hidden="true" />
                {vendor.languages.join(', ')}
              </span>
            )}
            {vendor.years_in_business != null && (
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="h-4 w-4 text-cream/50" aria-hidden="true" />
                {vendor.years_in_business} {vendor.years_in_business === 1 ? 'yr' : 'yrs'} in
                business
              </span>
            )}
            {vendor.response_sla_hours != null && (
              <span className="inline-flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-haldi" aria-hidden="true" />
                <Zap className="h-4 w-4 text-cream/50" aria-hidden="true" />
                Responds in ~{vendor.response_sla_hours}h
              </span>
            )}
            {vendor.average_rating != null &&
              vendor.review_count != null &&
              vendor.review_count > 0 && (
                <span className="inline-flex items-center gap-1.5 tabular-nums">
                  <Star className="h-4 w-4 fill-cream text-cream" aria-hidden="true" />
                  {vendor.average_rating.toFixed(1)}
                  <span className="text-cream/50">({fmtCount(vendor.review_count)})</span>
                </span>
              )}
          </div>
        </div>
      </div>
    </motion.section>
  );
}
