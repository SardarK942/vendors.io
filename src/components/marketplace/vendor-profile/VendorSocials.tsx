import { Instagram, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Database } from '@/types/database.types';

type VendorRow = Database['public']['Tables']['vendor_profiles']['Row'];

/**
 * Vendor Instagram + website links. Shared between the desktop sticky rail and
 * the mobile profile flow — previously the socials lived only inside
 * BookingStickyCard (desktop-only), so Instagram never showed on mobile.
 * Returns null when the vendor has neither, so callers can drop it in without
 * leaving an empty gap.
 */
export function VendorSocials({ vendor, className }: { vendor: VendorRow; className?: string }) {
  if (!vendor.instagram_handle && !vendor.website_url) return null;
  return (
    <div className={cn('flex items-center gap-4 text-sm', className)}>
      {vendor.instagram_handle && (
        <a
          href={`https://instagram.com/${vendor.instagram_handle}`}
          target="_blank"
          rel="noopener noreferrer"
          translate="no"
          className="flex items-center gap-1.5 text-ink/70 hover-pink-text"
        >
          <Instagram className="h-4 w-4" aria-hidden="true" />@{vendor.instagram_handle}
        </a>
      )}
      {vendor.website_url && (
        <a
          href={vendor.website_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-ink/70 hover-pink-text"
        >
          <ExternalLink className="h-4 w-4" aria-hidden="true" /> Website
        </a>
      )}
    </div>
  );
}
