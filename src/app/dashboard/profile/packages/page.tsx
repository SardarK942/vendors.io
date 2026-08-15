import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageTitle } from '@/components/dashboard/PageTitle';
import { listPackagesForVendor } from '@/services/packages.service';
import {
  PackageListSortable,
  type SortablePackage,
} from '@/components/dashboard/PackageListSortable';
import { PricingModelChoice } from '@/components/onboarding/PricingModelChoice';
import { PublishConfetti } from '@/components/celebration/PublishConfetti';
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
  const packages = (packagesData ?? []) as unknown as SortablePackage[];
  const vendorSlug = vendorProfile.slug ?? '';

  // just_onboarded=1 shows only the pricing-model choice cards — the "Your Packages"
  // header + empty state would repeat the same "add a package" CTA the choice card
  // already provides. Once the vendor navigates away (or lands here without the flag),
  // the regular listing takes over.
  if (justOnboarded) {
    return (
      <div className="space-y-6">
        <PublishConfetti />
        <PricingModelChoice vendorSlug={vendorSlug} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <PageTitle>Your Packages</PageTitle>
          <p className="text-muted-foreground">
            Packages let couples book fixed pricing tiers in one click. Vendors without packages
            still receive quote requests directly.
          </p>
        </div>
        <Button
          asChild
          className="bg-hot-pink text-cream hover:-translate-y-px hover:bg-hot-pink/90 hover:shadow-pink motion-reduce:hover:translate-y-0"
        >
          <Link href="/dashboard/profile/packages/new">+ Add Package</Link>
        </Button>
      </div>

      {packages.length === 0 ? (
        <Card className="p-12 text-center">
          <h2 className="text-lg font-semibold">No packages — that&rsquo;s OK</h2>
          <p className="mx-auto mt-2 max-w-md text-muted-foreground">
            Couples can already send quote requests from your live profile. Add a package here only
            if you sell fixed pricing tiers (like a 3-hour photobooth or a bridal MUA package).
          </p>
          <Button
            asChild
            size="lg"
            className="mt-6 bg-hot-pink text-cream hover:-translate-y-px hover:bg-hot-pink/90 hover:shadow-pink motion-reduce:hover:translate-y-0"
          >
            <Link href="/dashboard/profile/packages/new">+ Add a package</Link>
          </Button>
        </Card>
      ) : (
        <PackageListSortable packages={packages} vendorSlug={vendorSlug} />
      )}
    </div>
  );
}
