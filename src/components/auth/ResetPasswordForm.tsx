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
  // Memoize the Supabase client — createClient() returns a new instance every
  // call. Without this, the useEffect below (which depends on `supabase`) re-runs
  // on every state update and the timeout fallback retriggers in a loop.
  const [supabase] = useState(() => createClient());
  const [loading, setLoading] = useState(false);
  const [sessionReady, setSessionReady] = useState<'pending' | 'ok' | 'missing'>('pending');

  // Supabase's recovery email link redirects here with an implicit-flow URL hash:
  //   /reset-password#access_token=…&refresh_token=…&type=recovery
  //
  // @supabase/ssr's createBrowserClient is configured for PKCE + cookie-backed
  // sessions, so it does NOT auto-process implicit-flow hash tokens. We parse
  // the hash ourselves and feed the tokens to setSession() — that establishes
  // the recovery session and writes it to cookies so the rest of the app sees
  // it immediately.
  //
  // We also keep an onAuthStateChange subscription in case any future Supabase
  // version starts handling the hash automatically, AND a getSession() fast
  // path for the (unlikely) case where the user navigates here from an
  // already-recovering tab. Functional setState (prev → next) is intentional —
  // React 18 StrictMode runs effects twice in dev and a naive setter would
  // clobber the success state.
  useEffect(() => {
    let cancelled = false;

    async function processHash() {
      if (typeof window === 'undefined') return;
      const hash = window.location.hash.replace(/^#/, '');
      if (!hash) return;
      const params = new URLSearchParams(hash);
      const access_token = params.get('access_token');
      const refresh_token = params.get('refresh_token');
      if (!access_token || !refresh_token) return;

      const { error } = await supabase.auth.setSession({ access_token, refresh_token });
      if (cancelled) return;
      if (!error) {
        setSessionReady((prev) => (prev === 'pending' ? 'ok' : prev));
        // Clear the hash so reloading the page doesn't re-trigger.
        history.replaceState(null, '', window.location.pathname + window.location.search);
      }
    }

    void processHash();

    // Fast path / fallback for tabs where a session already exists.
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (data.session) setSessionReady((prev) => (prev === 'pending' ? 'ok' : prev));
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (
        session &&
        (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN' || event === 'INITIAL_SESSION')
      ) {
        setSessionReady((prev) => (prev === 'pending' ? 'ok' : prev));
      }
    });

    // Belt and suspenders: if nothing resolves after 5s, treat as expired.
    const timeout = setTimeout(() => {
      setSessionReady((prev) => (prev === 'pending' ? 'missing' : prev));
    }, 5000);

    return () => {
      cancelled = true;
      subscription.unsubscribe();
      clearTimeout(timeout);
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
            At least 8 characters. Don’t reuse an old one.
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
