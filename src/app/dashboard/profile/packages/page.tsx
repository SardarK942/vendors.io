import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { listPackagesForVendor } from '@/services/packages.service';
import { PackageActiveToggle } from '@/components/dashboard/PackageActiveToggle';
import { getActiveVendorProfile } from '@/lib/vendor/active';

export const dynamic = 'force-dynamic';

interface PackagesPageProps {
  searchParams: Promise<{ just_onboarded?: string }>;
}

export default async function PackagesPage({ searchParams }: PackagesPageProps) {
  const { just_onboarded } = await searchParams;
  const justOnboarded = just_onboarded === '1';

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Sub-project I §5: per-business package list.
  const { profile: vendorProfile } = await getActiveVendorProfile(supabase, user.id);
  if (!vendorProfile) redirect('/dashboard/profile');

  const { data: packagesData } = await listPackagesForVendor(
    supabase,
    vendorProfile.id,
    /* includeInactive */ true
  );
  const packages = (packagesData ?? []) as unknown as PackageItem[];

  return (
    <div className="space-y-6">
      {justOnboarded && (
        <div className="mb-4 rounded-md border border-green-500/30 bg-green-500/10 p-4">
          <h3 className="font-semibold">🎉 Profile is live!</h3>
          <p className="text-sm">Create your first package to start receiving bookings.</p>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Your Packages</h1>
          <p className="text-muted-foreground">
            Customers can only book vendors with at least one active package.
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard/profile/packages/new">+ Add Package</Link>
        </Button>
      </div>

      {packages.length === 0 ? (
        <Card className="p-12 text-center">
          <h2 className="text-lg font-semibold">No packages yet</h2>
          <p className="mt-2 text-muted-foreground">Add your first package to go live in search.</p>
          <Button className="mt-6" asChild>
            <Link href="/dashboard/profile/packages/new">Add your first package</Link>
          </Button>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(packages as PackageItem[]).map((pkg) => (
            <PackageCard key={pkg.id} pkg={pkg} />
          ))}
        </div>
      )}
    </div>
  );
}

interface PackageItem {
  id: string;
  name: string;
  base_price_cents: number;
  duration_hours: number;
  max_guests: number;
  featured_image_url: string;
  is_active: boolean;
}

function PackageCard({ pkg }: { pkg: PackageItem }) {
  return (
    <Card className={`overflow-hidden ${!pkg.is_active ? 'opacity-60' : ''}`}>
      <div className="relative h-40 w-full bg-gray-100">
        <Image
          src={pkg.featured_image_url}
          alt={pkg.name}
          fill
          className="object-cover"
          unoptimized
        />
      </div>
      <CardContent className="space-y-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold leading-tight">{pkg.name}</h3>
          {!pkg.is_active && (
            <span className="shrink-0 text-xs uppercase text-muted-foreground">Inactive</span>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          ${(pkg.base_price_cents / 100).toLocaleString()}
        </p>
        <p className="text-xs text-muted-foreground">
          {pkg.duration_hours}h &middot; up to {pkg.max_guests} guests
        </p>
        <div className="flex items-center gap-2 pt-2">
          <Button size="sm" variant="outline" asChild>
            <Link href={`/dashboard/profile/packages/${pkg.id}`}>Edit</Link>
          </Button>
          <PackageActiveToggle packageId={pkg.id} isActive={pkg.is_active} />
        </div>
      </CardContent>
    </Card>
  );
}
