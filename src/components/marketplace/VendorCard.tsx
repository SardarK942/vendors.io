'use client';

import * as React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Heart, ArrowRight, Camera } from 'lucide-react';
import { cn, VENDOR_CATEGORY_LABELS } from '@/lib/utils';
import { formatShortDate, formatWeddingCount, formatPriceFromCents } from './vendor-card-helpers';
import type { Database } from '@/types/database.types';

type VendorRow = Database['public']['Tables']['vendor_profiles']['Row'];

export interface VendorCardProps {
  vendor: VendorRow & {
    vendor_packages_price_band?: {
      min_price_cents: number | null;
      max_price_cents: number | null;
    } | null;
    /** Derived: count of confirmed bookings for this vendor. */
    confirmed_wedding_count?: number | null;
    /** Derived: true when the user's ?date= search matches a date this vendor has open. */
    is_available_for_date?: boolean | null;
  };
  /** ISO YYYY-MM-DD — set when user has ?date= in search. Drives the haldi pill. */
  searchDate?: string;
  /** Locally-tracked save state. No persistence in Day-1. */
  isSaved?: boolean;
  /** Save toggle handler. Parent decides what to do with it. */
  onSaveToggle?: (next: boolean) => void;
}

export function VendorCard({ vendor, searchDate, isSaved = false, onSaveToggle }: VendorCardProps) {
  const heroImage = vendor.portfolio_images?.[0];
  const categoryLabel = VENDOR_CATEGORY_LABELS[vendor.category] ?? vendor.category;
  const neighborhood = vendor.base_city ?? vendor.service_area?.[0] ?? 'Chicago';
  const respondsIn = vendor.response_sla_hours ? `Responds in ${vendor.response_sla_hours}h` : null;
  const weddingCount = formatWeddingCount(vendor.confirmed_wedding_count);
  const minPrice = formatPriceFromCents(vendor.vendor_packages_price_band?.min_price_cents);
  const showAvailablePill = !!searchDate && vendor.is_available_for_date === true;

  const handleSaveClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onSaveToggle?.(!isSaved);
  };

  return (
    <Link
      href={`/vendors/${vendor.slug}`}
      className={cn(
        'group relative block overflow-hidden rounded-lg border border-hairline bg-cream',
        'duration-[320ms] ease-[cubic-bezier(.22,1,.36,1)] transition-all',
        // HV-B hover (md+ only — touch devices skip)
        'md:hover:-translate-y-[3px] md:hover:border-transparent',
        'md:hover:shadow-[rgba(27,20,20,0.02)_0_0_0_1px,rgba(27,20,20,0.04)_0_2px_6px_0,rgba(27,20,20,0.10)_0_4px_8px_0]',
        'motion-reduce:md:hover:transform-none'
      )}
    >
      {/* Photo */}
      <div className="relative aspect-[4/5] overflow-hidden bg-cream-soft">
        {heroImage ? (
          <Image
            src={heroImage}
            alt={`${vendor.business_name} — ${categoryLabel}`}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
            className={cn(
              'duration-[320ms] ease-[cubic-bezier(.22,1,.36,1)] object-cover transition-transform',
              'md:group-hover:scale-[1.04] motion-reduce:md:group-hover:scale-100'
            )}
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-ink-muted">
            <Camera className="size-8 stroke-current" strokeWidth={1.5} />
            <span className="text-xs">Photo coming soon</span>
          </div>
        )}

        {/* Verified pill */}
        {vendor.verified && (
          <span
            className={cn(
              'absolute left-3 top-3 inline-flex items-center gap-1.5',
              'rounded-full border border-ink/10 bg-cream/95 px-2.5 py-1 backdrop-blur',
              'text-[11px] font-semibold tracking-wide text-ink'
            )}
          >
            <span aria-hidden="true" className="size-[7px] rounded-full bg-indigo" />
            Verified
          </span>
        )}

        {/* "Available {date}" haldi pill — conditional */}
        {showAvailablePill && searchDate && (
          <span
            className={cn(
              'absolute left-3 top-[46px] inline-flex items-center gap-1.5',
              'rounded-full bg-haldi px-2.5 py-1',
              'text-[11px] font-bold tracking-wide text-ink',
              'shadow-[0_2px_6px_rgba(27,20,20,0.12)]'
            )}
          >
            <span aria-hidden="true" className="size-[7px] rounded-full bg-ink" />
            Available {formatShortDate(searchDate)}
          </span>
        )}

        {/* Save heart */}
        <button
          type="button"
          onClick={handleSaveClick}
          aria-label={isSaved ? 'Unsave vendor' : 'Save vendor'}
          aria-pressed={isSaved}
          className={cn(
            'absolute right-3 top-3 inline-flex size-[34px] items-center justify-center rounded-full',
            'border border-ink/10 bg-cream/95 backdrop-blur',
            'transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo focus-visible:ring-offset-2 focus-visible:ring-offset-cream',
            isSaved ? 'text-hot-pink' : 'text-ink hover:text-ink-muted'
          )}
        >
          <Heart className={cn('size-4', isSaved ? 'fill-current' : 'fill-none')} strokeWidth={2} />
        </button>

        {/* HV-B arrow orb — hover only */}
        <span
          aria-hidden="true"
          className={cn(
            'absolute bottom-3.5 right-3.5 inline-flex size-10 items-center justify-center rounded-full',
            'bg-indigo text-cream',
            'duration-[320ms] ease-[cubic-bezier(.22,1,.36,1)] -translate-x-2 opacity-0 transition-all',
            'md:group-hover:translate-x-0 md:group-hover:opacity-100',
            'motion-reduce:md:group-hover:translate-x-0'
          )}
        >
          <ArrowRight className="size-[18px] stroke-current" strokeWidth={2} />
        </span>
      </div>

      {/* Body */}
      <div className="px-[18px] py-4 pb-5">
        <div className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-indigo">
          {categoryLabel}
        </div>
        <h3 className="mb-2 font-display text-[21px] font-bold leading-[1.18] tracking-[-0.014em] text-ink">
          {vendor.business_name}
        </h3>
        <div
          className="mt-2.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12px] text-ink-muted"
          aria-label={[neighborhood, respondsIn, weddingCount].filter(Boolean).join(', ')}
        >
          <span>{neighborhood}</span>
          {respondsIn && (
            <>
              <span aria-hidden="true" className="text-ink-soft">
                ·
              </span>
              <span className="inline-flex items-center gap-1.5 font-semibold text-ink">
                <span aria-hidden="true" className="size-[6px] rounded-full bg-indigo" />
                {respondsIn}
              </span>
            </>
          )}
          {weddingCount && (
            <>
              <span aria-hidden="true" className="text-ink-soft">
                ·
              </span>
              <span>{weddingCount}</span>
            </>
          )}
        </div>
        {minPrice && (
          <p className="mt-3 text-[14px] font-semibold text-ink">
            <span className="text-[12px] font-normal text-ink-muted">From </span>
            {minPrice}
          </p>
        )}
      </div>
    </Link>
  );
}
