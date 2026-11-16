import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { PageTitle } from '@/components/dashboard/PageTitle';
import { getSavedVendorsForUser } from '@/services/vendor.service';
import { VendorGrid } from '@/components/marketplace/VendorGrid';
import { SavedVendorsProvider } from '@/components/marketplace/SavedVendorsProvider';

export const dynamic = 'force-dynamic';

export default async function SavedPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?redirect=/dashboard/saved');

  const vendors = await getSavedVendorsForUser(supabase, user.id);

  if (vendors.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <PageTitle>Saved Vendors</PageTitle>
          <p className="mt-1 text-sm text-ink-soft">
            Keep track of your favorite vendors for the big day.
          </p>
        </div>
        <div className="rounded-2xl border border-dashed border-hairline bg-cream-soft/40 p-12 text-center">
          <h2 className="font-display text-xl text-ink">No saved vendors yet</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-ink-soft">
            Heart vendors to remember them. Your shortlist lives here.
          </p>
          <Button asChild variant="primary" className="mt-5">
            <Link href="/vendors">
              <Plus aria-hidden className="mr-1.5 size-4" />
              Find vendors
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <SavedVendorsProvider>
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <PageTitle>Saved Vendors</PageTitle>
            <p className="mt-1 text-sm text-ink-soft">
              Keep track of your favorite vendors for the big day.
            </p>
          </div>
          <Button asChild variant="primary">
            <Link href="/vendors">
              <Plus aria-hidden className="mr-1.5 size-4" />
              Find More
            </Link>
          </Button>
        </div>
        <VendorGrid vendors={vendors} />
      </div>
    </SavedVendorsProvider>
  );
}
