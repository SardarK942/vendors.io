import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { EventWizard } from '@/components/events/wizard/EventWizard';

export const dynamic = 'force-dynamic';

export default async function NewEventPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?redirect=/events/new');

  const { data: profile } = await supabase
    .from('users')
    .select('role, full_name')
    .eq('id', user.id)
    .single();

  // Couples only — vendors have no use for the event-planning wizard.
  if (profile?.role === 'vendor') redirect('/dashboard');

  return <EventWizard coupleName={profile?.full_name ?? null} defaultCity="Chicago" />;
}
