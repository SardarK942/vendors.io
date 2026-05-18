import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle } from 'lucide-react';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function StripeSuccessPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: vendorProfile } = await supabase
    .from('vendor_profiles')
    .select('payment_mode')
    .eq('user_id', user.id)
    .maybeSingle();

  if ((vendorProfile as { payment_mode?: string | null } | null)?.payment_mode === 'cash') {
    redirect('/dashboard');
  }

  return (
    <div className="mx-auto max-w-md">
      <Card>
        <CardHeader className="text-center">
          <CheckCircle className="mx-auto h-12 w-12 text-green-600" />
          <CardTitle className="mt-4">Stripe Setup Complete</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-center">
          <p className="text-muted-foreground">
            Your Stripe Connect account is set up. You can now receive payments from booking
            deposits.
          </p>
          <Button asChild>
            <Link href="/dashboard">Go to Dashboard</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
