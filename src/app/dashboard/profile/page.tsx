import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { VendorProfileForm } from '@/components/forms/VendorProfileForm';
import { PauseProfileToggle } from '@/components/dashboard/PauseProfileToggle';
import { getActiveVendorProfile } from '@/lib/vendor/active';

export const dynamic = 'force-dynamic';

export default async function VendorProfilePage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  // Sub-project I §5: resolve active business (falls back to user's only profile).
  const { profile: vendorProfile } = await getActiveVendorProfile(supabase, user.id);

  if (!vendorProfile) redirect('/dashboard/profile/setup');
  if (!(vendorProfile as Record<string, unknown>).onboarding_complete) redirect('/dashboard/profile/setup');

  const isActive = (vendorProfile as Record<string, unknown>).is_active !== false;
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Edit Profile</h1>
          <p className="text-muted-foreground">Update your vendor profile information.</p>
        </div>
        <div className="text-right">
          <p className="text-sm font-medium">Search visibility</p>
          <p className="text-xs text-muted-foreground mb-2">
            {isActive ? 'Active — visible in search' : 'Paused — hidden from search'}
          </p>
          <PauseProfileToggle isActive={isActive} />
        </div>
      </div>
      <VendorProfileForm vendorProfile={vendorProfile} />
    </div>
  );
}
