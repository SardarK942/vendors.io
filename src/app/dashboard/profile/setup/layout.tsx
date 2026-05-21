import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { WizardStepper } from '@/components/onboarding/WizardStepper';
import { getOrCreateWizardProfile, type WizardMode } from '@/lib/onboarding/resume';

export const dynamic = 'force-dynamic';

interface SetupLayoutProps {
  children: React.ReactNode;
  searchParams?: Promise<{ next?: string }>;
}

export default async function SetupLayout({ children, searchParams }: SetupLayoutProps) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Sub-project I §6: detect "Add another business" via ?next=true. In that
  // mode we resolve or create a NEW (second) vendor_profile rather than the
  // user's primary one.
  const sp = (await searchParams) ?? {};
  const mode: WizardMode = sp.next === 'true' ? 'next' : 'first';

  const { profileId } = await getOrCreateWizardProfile(supabase, user.id, mode);

  // Load THIS profile (not the user's "single" one). Used by WizardStepper to
  // determine which step to highlight.
  const { data: profile } = await supabase
    .from('vendor_profiles')
    .select('*')
    .eq('id', profileId)
    .maybeSingle();

  // For 'first' mode: if the resolved profile is already complete, the legacy
  // behavior is to redirect away. Preserved.
  // For 'next' mode: never redirect away — the user is intentionally starting
  // a new wizard for a second business; the resolved profile is the new (still
  // incomplete) one.
  if (mode === 'first' && profile?.onboarding_complete) {
    redirect('/dashboard/profile');
  }

  return (
    <div className="flex min-h-screen">
      <aside className="hidden md:block w-64 border-r bg-muted/30 p-6">
        <WizardStepper profile={profile} />
        {mode === 'next' && (
          <p className="mt-6 text-xs text-muted-foreground">
            Setting up an additional business.
          </p>
        )}
      </aside>
      <main className="flex-1 p-8">
        {mode === 'next' && (
          <div className="mb-6 rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
            Setting up your <strong>next business</strong>.
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
