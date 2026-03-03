import Link from 'next/link';
import Image from 'next/image';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { formatPrice, VENDOR_CATEGORY_LABELS } from '@/lib/utils';
import { CheckCircle, Clock, MapPin } from 'lucide-react';
import type { Database } from '@/types/database.types';

type VendorRow = Database['public']['Tables']['vendor_profiles']['Row'];

interface VendorCardProps {
  vendor: VendorRow;
}

export function VendorCard({ vendor }: VendorCardProps) {
  const heroImage = vendor.portfolio_images?.[0];

  return (
    <Link href={`/vendors/${vendor.slug}`}>
      <Card className="group overflow-hidden transition-shadow hover:shadow-lg">
        {/* Image */}
        <div className="relative aspect-[4/3] overflow-hidden bg-muted">
          {heroImage ? (
            <Image
              src={heroImage}
              alt={vendor.business_name}
              fill
              className="object-cover transition-transform group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-muted-foreground">
              No Image
            </div>
          )}
          {vendor.verified && (
            <Badge className="absolute right-2 top-2 gap-1" variant="secondary">
              <CheckCircle className="h-3 w-3" /> Verified
            </Badge>
          )}
        </div>

        <CardContent className="p-4">
          <h3 className="font-semibold leading-tight">{vendor.business_name}</h3>

          <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="outline" className="text-xs">
              {VENDOR_CATEGORY_LABELS[vendor.category] || vendor.category}
            </Badge>
          </div>

          {/* Price */}
          {vendor.starting_price_min && (
            <p className="mt-2 text-sm font-medium">
              Starting at {formatPrice(vendor.starting_price_min)}
            </p>
          )}

          {/* Meta */}
          <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {vendor.service_area?.[0] || 'Chicago'}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {vendor.response_sla_hours}h response
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
