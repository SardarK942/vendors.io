import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { PackageEditorForm } from '@/components/forms/PackageEditorForm';
import { getActiveVendorProfile } from '@/lib/vendor/active';
import { isCartVendor } from '@/lib/vendor/is-cart';

export const dynamic = 'force-dynamic';

export default async function NewPackagePage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Guard: vendor must complete profile setup before adding packages.
  // Sub-project I §5: active business (falls back to user's only profile).
  const { profile: vendorProfile } = await getActiveVendorProfile(supabase, user.id);
  if (!vendorProfile) redirect('/dashboard/profile?next=/dashboard/profile/packages/new');

  return (
    <div className="max-w-5xl">
      <Link
        href="/dashboard/profile/packages"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-ink"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back to packages
      </Link>
      <h1 className="mb-6 text-pretty text-2xl font-bold">Add Package</h1>
      <PackageEditorForm
        mode="create"
        capacityUnitEditable={isCartVendor(vendorProfile.category, vendorProfile.services)}
      />
    </div>
  );
}
