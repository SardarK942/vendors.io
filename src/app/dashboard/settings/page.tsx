import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { Lock, Mail } from 'lucide-react';
import { SectionCard } from '@/components/dashboard/kit';
import { PageTitle } from '@/components/dashboard/PageTitle';
import { PasswordChangeForm } from '@/components/settings/PasswordChangeForm';
import { EmailChangeForm } from '@/components/settings/EmailChangeForm';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  return (
    <div className="space-y-6">
      <PageTitle subtitle="Update your password and email address.">Settings</PageTitle>

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard className="p-6">
          <div className="mb-5 flex items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-indigo/10">
              <Lock className="size-4 text-indigo" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h2 className="font-display text-lg text-ink">Change password</h2>
              <p className="text-sm text-ink-muted">Keep your account secure.</p>
            </div>
          </div>
          <PasswordChangeForm />
        </SectionCard>

        <SectionCard className="p-6">
          <div className="mb-5 flex items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-indigo/10">
              <Mail className="size-4 text-indigo" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h2 className="font-display text-lg text-ink">Email address</h2>
              <p className="text-sm text-ink-muted">Update the email you sign in with.</p>
            </div>
          </div>
          <EmailChangeForm currentEmail={user.email ?? ''} />
        </SectionCard>
      </div>
    </div>
  );
}
