'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createClient } from '@/lib/supabase/client';

export function ForgotPasswordForm() {
  return (
    <Suspense fallback={null}>
      <ForgotPasswordInner />
    </Suspense>
  );
}

function ForgotPasswordInner() {
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect') || '/dashboard';
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    const email = (formData.get('email') as string).trim().toLowerCase();

    // Supabase will email the user a link; the link bounces through
    // /reset-password where we accept the new password.
    const callbackQs = new URLSearchParams({ redirect });
    const redirectUrl = `${window.location.origin}/reset-password?${callbackQs.toString()}`;

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: redirectUrl,
    });

    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }

    setSent(email);
    setLoading(false);
  }

  if (sent) {
    return (
      <div className="flex flex-col gap-6" role="status" aria-live="polite">
        <Card className="border-ink/10 shadow-sm">
          <CardHeader>
            <CardTitle className="font-spectral text-2xl text-ink">Check your email</CardTitle>
            <CardDescription className="text-ink/70">
              We sent a password reset link to <span className="font-medium text-ink">{sent}</span>.
              Open it on any device to choose a new password.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-muted-foreground">
              Didn’t get the email? Check your spam folder, or{' '}
              <button
                type="button"
                onClick={() => setSent(null)}
                className="rounded font-medium text-ink underline underline-offset-4 hover-pink-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo focus-visible:ring-offset-2 focus-visible:ring-offset-cream"
              >
                try a different address
              </button>
              .
            </div>
            <div className="mt-6 text-center text-sm">
              <Link
                href="/login"
                className="font-medium underline underline-offset-4 hover-pink-text"
              >
                <span aria-hidden="true" className="inline-block -translate-x-0.5">
                  ←
                </span>{' '}
                Back to sign in
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className="border-ink/10 shadow-sm">
        <CardHeader>
          <CardTitle className="font-spectral text-2xl text-ink">Forgot your password?</CardTitle>
          <CardDescription className="text-ink/70">
            Enter the email you signed up with and we’ll send you a link to choose a new one.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit}>
            <div className="flex flex-col gap-6">
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="you@example.com"
                  required
                  disabled={loading}
                  autoComplete="email"
                  inputMode="email"
                  spellCheck={false}
                  autoCapitalize="none"
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Sending…' : 'Send reset link'}
              </Button>
            </div>
            <div className="mt-4 text-center text-sm">
              Remembered it?{' '}
              <Link
                href="/login"
                className="font-medium underline underline-offset-4 hover-pink-text"
              >
                Back to sign in
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
