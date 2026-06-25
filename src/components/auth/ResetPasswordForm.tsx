'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createClient } from '@/lib/supabase/client';

export function ResetPasswordForm() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordInner />
    </Suspense>
  );
}

function ResetPasswordInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect') || '/dashboard';
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [sessionReady, setSessionReady] = useState<'pending' | 'ok' | 'missing'>('pending');

  // When the user clicks the email link, Supabase puts an access token in the URL
  // hash (#access_token=…&type=recovery). The Supabase client picks this up
  // automatically on initialization and establishes a session. We just check
  // that a session is present before letting the user submit.
  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSessionReady(data.session ? 'ok' : 'missing');
    });
    return () => {
      mounted = false;
    };
  }, [supabase]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    const password = formData.get('password') as string;
    const confirm = formData.get('confirm') as string;

    if (password.length < 8) {
      toast.error('Password must be at least 8 characters.');
      setLoading(false);
      return;
    }
    if (password !== confirm) {
      toast.error("The two passwords don't match.");
      setLoading(false);
      return;
    }

    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }

    toast.success('Password updated.');
    router.push(redirect);
    router.refresh();
  }

  if (sessionReady === 'missing') {
    return (
      <div className="flex flex-col gap-6">
        <Card className="border-ink/10 shadow-sm">
          <CardHeader>
            <CardTitle className="font-spectral text-2xl text-ink">Reset link expired</CardTitle>
            <CardDescription className="text-ink/70">
              This password reset link is no longer valid. They expire after a short while or after
              being used once. Request a fresh one and try again.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full">
              <Link href="/forgot-password">Get a new reset link</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className="border-ink/10 shadow-sm">
        <CardHeader>
          <CardTitle className="font-spectral text-2xl text-ink">Choose a new password</CardTitle>
          <CardDescription className="text-ink/70">
            At least 8 characters. Don&apos;t reuse an old one.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit}>
            <div className="flex flex-col gap-6">
              <div className="grid gap-2">
                <Label htmlFor="password">New password</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  minLength={8}
                  required
                  disabled={loading || sessionReady === 'pending'}
                  autoComplete="new-password"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="confirm">Confirm new password</Label>
                <Input
                  id="confirm"
                  name="confirm"
                  type="password"
                  minLength={8}
                  required
                  disabled={loading || sessionReady === 'pending'}
                  autoComplete="new-password"
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading || sessionReady !== 'ok'}>
                {loading ? 'Updating…' : 'Update password'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
