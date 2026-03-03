import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default async function DashboardPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('users').select('*').eq('id', user.id).single();

  const role = profile?.role || 'couple';

  // Get booking counts
  let bookingCount = 0;
  if (role === 'couple') {
    const { count } = await supabase
      .from('booking_requests')
      .select('*', { count: 'exact', head: true })
      .eq('couple_user_id', user.id);
    bookingCount = count ?? 0;
  } else if (role === 'vendor') {
    const { data: vendorProfile } = await supabase
      .from('vendor_profiles')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (vendorProfile) {
      const { count } = await supabase
        .from('booking_requests')
        .select('*', { count: 'exact', head: true })
        .eq('vendor_profile_id', vendorProfile.id);
      bookingCount = count ?? 0;
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Welcome back, {profile?.full_name || user.email}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Total Bookings</CardDescription>
            <CardTitle className="text-3xl">{bookingCount}</CardTitle>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Account Type</CardDescription>
            <CardTitle className="capitalize">{role}</CardTitle>
          </CardHeader>
        </Card>

        {role === 'vendor' && (
          <Card>
            <CardHeader>
              <CardDescription>Quick Action</CardDescription>
            </CardHeader>
            <CardContent>
              <a
                href="/dashboard/profile"
                className="text-sm font-medium text-primary hover:underline"
              >
                Edit your profile &rarr;
              </a>
            </CardContent>
          </Card>
        )}

        {role === 'couple' && (
          <Card>
            <CardHeader>
              <CardDescription>Quick Action</CardDescription>
            </CardHeader>
            <CardContent>
              <a href="/vendors" className="text-sm font-medium text-primary hover:underline">
                Browse vendors &rarr;
              </a>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
