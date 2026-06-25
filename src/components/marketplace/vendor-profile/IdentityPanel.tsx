// src/components/marketplace/vendor-profile/IdentityPanel.tsx
import { Badge } from '@/components/ui/badge';
import { CheckCircle, MapPin, Languages, CalendarDays } from 'lucide-react';
import { VENDOR_CATEGORY_LABELS } from '@/lib/utils';
import type { Database } from '@/types/database.types';

type VendorRow = Database['public']['Tables']['vendor_profiles']['Row'];

interface IdentityPanelProps {
  vendor: VendorRow;
}

export function IdentityPanel({ vendor }: IdentityPanelProps) {
  const location = vendor.service_area?.length ? vendor.service_area.join(', ') : 'Chicago';
  return (
    <section data-testid="identity-panel" className="space-y-6">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="font-spectral text-3xl font-bold text-ink">{vendor.business_name}</h1>
          {vendor.verified && (
            <Badge className="gap-1">
              <CheckCircle className="h-3 w-3" /> Verified
            </Badge>
          )}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-ink/80">
          <Badge variant="outline">
            {VENDOR_CATEGORY_LABELS[vendor.category] || vendor.category}
          </Badge>
          <span className="flex items-center gap-1">
            <MapPin className="h-4 w-4" />
            {location}
          </span>
          {vendor.languages && vendor.languages.length > 0 && (
            <span className="flex items-center gap-1">
              <Languages className="h-4 w-4" />
              {vendor.languages.join(', ')}
            </span>
          )}
          {vendor.years_in_business != null && (
            <span className="flex items-center gap-1">
              <CalendarDays className="h-4 w-4" />
              {vendor.years_in_business} {vendor.years_in_business === 1 ? 'year' : 'years'} in
              business
            </span>
          )}
        </div>
      </div>

      {vendor.bio && (
        <div>
          <h2 className="font-spectral text-xl font-semibold text-ink">About</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink/85">
            {vendor.bio}
          </p>
          {vendor.languages && vendor.languages.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {vendor.languages.map((lang) => (
                <span
                  key={lang}
                  className="rounded-full border border-ink/20 bg-white px-3 py-1 text-xs text-ink"
                >
                  {lang}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
