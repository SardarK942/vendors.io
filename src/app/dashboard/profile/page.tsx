import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { ProfileSetup } from '@/components/dashboard/ProfileSetup';
import { VendorProfileForm } from '@/components/forms/VendorProfileForm';

export const dynamic = 'force-dynamic';

interface ProfilePageProps {
  searchParams: Promise<{ mode?: string }>;
}

export default async function VendorProfilePage({ searchParams }: ProfilePageProps) {
  const { mode } = await searchParams;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: vendorProfile } = await supabase
    .from('vendor_profiles')
    .select('*')
    .eq('user_id', user.id)
    .single();

  if (vendorProfile) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Edit Profile</h1>
          <p className="text-muted-foreground">Update your vendor profile information.</p>
        </div>
        <VendorProfileForm vendorProfile={vendorProfile} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Set Up Your Profile</h1>
        <p className="text-muted-foreground">
          Claim an existing listing or create a new one to start receiving bookings.
        </p>
      </div>
      <ProfileSetup initialMode={mode === 'create' ? 'create' : 'claim'} />
    </div>
  );
}
