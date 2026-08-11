import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import Link from 'next/link';
import { WizardStepper } from '@/components/onboarding/WizardStepper';
import { WizardMobileBar } from '@/components/onboarding/WizardMobileBar';
import { OnboardingPreview } from '@/components/onboarding/OnboardingPreview';
import { PreviewRefresher } from '@/components/onboarding/PreviewRefresher';
import { getOrCreateWizardProfile, type WizardMode } from '@/lib/onboarding/resume';

export const dynamic = 'force-dynamic';

interface SetupLayoutProps {
  children: React.ReactNode;
}

export default async function SetupLayout({ children }: SetupLayoutProps) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Sub-project I §6: detect "Add another business" via ?next=true. Next.js 14
  // layouts don't receive searchParams, so middleware (updateSession) mirrors
  // the URL into the x-wizard-mode request header.
  const mode: WizardMode = headers().get('x-wizard-mode') === 'next' ? 'next' : 'first';

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
    <div className="mx-auto flex min-h-screen w-full max-w-7xl gap-8 px-4 md:px-8">
      <PreviewRefresher />
      {/* Left rail — the only nav during onboarding */}
      <aside className="hidden w-56 shrink-0 py-8 md:block">
        <div className="sticky top-8">
          <Link
            href="/"
            aria-label="Baazar home"
            className="mb-8 block font-display text-3xl font-medium lowercase tracking-tight text-ink"
          >
            baazar<span className="text-hot-pink">.</span>
          </Link>
          <WizardStepper profile={profile} />
          {mode === 'next' && (
            <p className="mt-6 text-xs text-muted-foreground">Setting up an additional business.</p>
          )}
        </div>
      </aside>

      {/* Center — the step form */}
      <main className="min-w-0 flex-1 pb-16 pt-4 md:py-10">
        {profile && <WizardMobileBar profile={profile} />}
        {mode === 'next' && (
          <div className="mb-6 rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
            Setting up your <strong>next business</strong>.
          </div>
        )}
        {children}
      </main>

      {/* Right — live listing preview (desktop only; mobile uses the bar's toggle) */}
      {profile && (
        <aside className="hidden w-[380px] shrink-0 py-8 lg:block">
          <div className="sticky top-8">
            <OnboardingPreview profile={profile} />
          </div>
        </aside>
      )}
    </div>
  );
}
