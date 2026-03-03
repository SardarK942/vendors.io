import Image from 'next/image';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { formatPrice, VENDOR_CATEGORY_LABELS } from '@/lib/utils';
import { CheckCircle, Clock, ExternalLink, Instagram, MapPin } from 'lucide-react';
import Link from 'next/link';
import type { Database } from '@/types/database.types';

type VendorRow = Database['public']['Tables']['vendor_profiles']['Row'];

interface VendorProfileProps {
  vendor: VendorRow;
  showBookingButton?: boolean;
}

export function VendorProfile({ vendor, showBookingButton = true }: VendorProfileProps) {
  return (
    <div className="mx-auto max-w-5xl space-y-8">
      {/* Hero Gallery */}
      {vendor.portfolio_images && vendor.portfolio_images.length > 0 && (
        <div className="grid grid-cols-2 gap-2 overflow-hidden rounded-lg md:grid-cols-3">
          {vendor.portfolio_images.slice(0, 6).map((img, i) => (
            <div
              key={i}
              className={`relative overflow-hidden bg-muted ${i === 0 ? 'col-span-2 row-span-2 aspect-[4/3]' : 'aspect-square'}`}
            >
              <Image
                src={img}
                alt={`${vendor.business_name} portfolio ${i + 1}`}
                fill
                className="object-cover"
              />
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-8 md:grid-cols-3">
        {/* Main Info */}
        <div className="space-y-6 md:col-span-2">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold">{vendor.business_name}</h1>
              {vendor.verified && (
                <Badge className="gap-1">
                  <CheckCircle className="h-3 w-3" /> Verified
                </Badge>
              )}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-muted-foreground">
              <Badge variant="outline">
                {VENDOR_CATEGORY_LABELS[vendor.category] || vendor.category}
              </Badge>
              <span className="flex items-center gap-1 text-sm">
                <MapPin className="h-4 w-4" />
                {vendor.service_area?.join(', ') || 'Chicago'}
              </span>
              <span className="flex items-center gap-1 text-sm">
                <Clock className="h-4 w-4" />
                Responds within {vendor.response_sla_hours}h
              </span>
            </div>
          </div>

          <Separator />

          {vendor.bio && (
            <div>
              <h2 className="mb-2 text-lg font-semibold">About</h2>
              <p className="whitespace-pre-wrap text-muted-foreground">{vendor.bio}</p>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Pricing</CardTitle>
            </CardHeader>
            <CardContent>
              {vendor.starting_price_min ? (
                <p className="text-2xl font-bold">
                  {formatPrice(vendor.starting_price_min)}
                  {vendor.starting_price_max && (
                    <span className="text-lg font-normal text-muted-foreground">
                      {' '}
                      – {formatPrice(vendor.starting_price_max)}
                    </span>
                  )}
                </p>
              ) : (
                <p className="text-muted-foreground">Contact for pricing</p>
              )}
              <p className="mt-1 text-xs text-muted-foreground">Starting price range</p>
            </CardContent>
          </Card>

          {showBookingButton && (
            <Button className="w-full" size="lg" asChild>
              <Link href={`/vendors/${vendor.slug}/book`}>Request Booking</Link>
            </Button>
          )}

          {/* External Links */}
          <div className="space-y-2">
            {vendor.instagram_handle && (
              <a
                href={`https://instagram.com/${vendor.instagram_handle}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary"
              >
                <Instagram className="h-4 w-4" />@{vendor.instagram_handle}
              </a>
            )}
            {vendor.website_url && (
              <a
                href={vendor.website_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary"
              >
                <ExternalLink className="h-4 w-4" /> Website
              </a>
            )}
          </div>

          {vendor.total_bookings > 0 && (
            <p className="text-center text-sm text-muted-foreground">
              {vendor.total_bookings} bookings completed
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
