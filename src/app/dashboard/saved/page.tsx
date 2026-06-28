import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createServerSupabaseClient } from '@/lib/supabase/server';
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
      <div className="rounded-lg border border-ink/10 bg-cream p-12 text-center">
        <h2 className="text-xl font-semibold text-ink">No saved vendors yet</h2>
        <p className="mt-2 text-sm text-ink/70">
          Heart vendors to remember them. Your shortlist lives here.
        </p>
        <Link
          href="/vendors"
          className="mt-4 inline-block rounded-md bg-ink px-4 py-2 text-sm font-medium text-cream transition-colors hover:bg-hot-pink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo focus-visible:ring-offset-2 focus-visible:ring-offset-cream"
        >
          Browse Vendors
        </Link>
      </div>
    );
  }

  return (
    <SavedVendorsProvider>
      <h1 className="mb-6 text-2xl font-bold text-ink">Your Saved Vendors</h1>
      <VendorGrid vendors={vendors} />
    </SavedVendorsProvider>
  );
}
