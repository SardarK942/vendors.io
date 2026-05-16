import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { WizardStepper } from '@/components/onboarding/WizardStepper';

export const dynamic = 'force-dynamic';

export default async function SetupLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('vendor_profiles')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  if (profile?.onboarding_complete) redirect('/dashboard/profile');

  return (
    <div className="flex min-h-screen">
      <aside className="hidden md:block w-64 border-r bg-muted/30 p-6">
        <WizardStepper profile={profile} />
      </aside>
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
