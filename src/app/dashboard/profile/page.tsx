import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { VendorProfileForm } from '@/components/forms/VendorProfileForm';

export default async function VendorProfilePage() {
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{vendorProfile ? 'Edit Profile' : 'Create Profile'}</h1>
        <p className="text-muted-foreground">
          {vendorProfile
            ? 'Update your vendor profile information.'
            : 'Set up your vendor profile to start receiving bookings.'}
        </p>
      </div>

      <VendorProfileForm vendorProfile={vendorProfile} />
    </div>
  );
}
