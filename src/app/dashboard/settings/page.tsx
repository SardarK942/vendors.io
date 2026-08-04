import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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

      <Card className="border-l-[3px] border-l-indigo/70">
        <CardHeader>
          <CardTitle>Password</CardTitle>
        </CardHeader>
        <CardContent>
          <PasswordChangeForm />
        </CardContent>
      </Card>

      <Card className="border-l-[3px] border-l-indigo/70">
        <CardHeader>
          <CardTitle>Email address</CardTitle>
        </CardHeader>
        <CardContent>
          <EmailChangeForm currentEmail={user.email ?? ''} />
        </CardContent>
      </Card>
    </div>
  );
}
