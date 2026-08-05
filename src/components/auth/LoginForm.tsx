'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import { createClient } from '@/lib/supabase/client';
import { GoogleIcon } from './GoogleIcon';

export function LoginForm(props: React.ComponentPropsWithoutRef<'div'>) {
  return (
    <Suspense fallback={null}>
      <LoginFormInner {...props} />
    </Suspense>
  );
}

function LoginFormInner({ className, ...props }: React.ComponentPropsWithoutRef<'div'>) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect') || '/dashboard';
  const supabase = createClient();
  const [loading, setLoading] = useState(false);

  async function handleEmailLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }
    toast.success('Signed in.');
    router.push(redirect);
    router.refresh();
  }

  async function handleGoogleLogin() {
    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/api/auth/callback?redirect=${redirect}`,
      },
    });
    if (error) {
      toast.error(error.message);
      setLoading(false);
    }
  }

  const forgotHref = `/forgot-password${redirect !== '/dashboard' ? `?redirect=${encodeURIComponent(redirect)}` : ''}`;
  const signupHref = `/signup${redirect !== '/dashboard' ? `?return_to=${encodeURIComponent(redirect)}` : ''}`;

  // Matches the signup form's Figma register: soft gray rounded fields, bold labels.
  const fieldClass = 'rounded-xl border-[#e5e7eb] bg-[#f6f8fa] text-ink placeholder:text-[#8a94a6]';
  const labelClass = 'text-sm font-semibold text-ink';

  return (
    <div className={cn('flex flex-col gap-6', className)} {...props}>
      <Card className="border-none bg-transparent p-0 shadow-none">
        <CardHeader>
          <CardTitle className="font-spectral text-balance text-2xl text-ink">
            Welcome back
          </CardTitle>
          <CardDescription className="text-ink/70">Sign in to your Baazar account.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleEmailLogin}>
            <div className="flex flex-col gap-6">
              <div className="grid gap-2">
                <Label htmlFor="email" className={labelClass}>
                  Email
                </Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="Enter your email address"
                  required
                  disabled={loading}
                  autoComplete="email"
                  inputMode="email"
                  spellCheck={false}
                  autoCapitalize="none"
                  className={fieldClass}
                />
              </div>
              <div className="grid gap-2">
                <div className="flex items-center">
                  <Label htmlFor="password" className={labelClass}>
                    Password
                  </Label>
                  <Link
                    href={forgotHref}
                    className="ml-auto inline-block text-sm text-ink/70 underline-offset-4 hover-pink-text hover:underline"
                  >
                    Forgot your password?
                  </Link>
                </div>
                <PasswordInput
                  id="password"
                  name="password"
                  required
                  disabled={loading}
                  autoComplete="current-password"
                  className={fieldClass}
                />
              </div>
              <Button
                type="submit"
                className="w-full bg-hot-pink text-cream hover:-translate-y-px hover:bg-hot-pink/90 hover:shadow-pink motion-reduce:hover:translate-y-0"
                disabled={loading}
              >
                {loading ? 'Signing in…' : 'Sign in'}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={loading}
                onClick={handleGoogleLogin}
              >
                <GoogleIcon className="mr-2 h-4 w-4" />
                Continue with Google
              </Button>
            </div>
            <div className="mt-4 text-center text-sm">
              Don’t have an account?{' '}
              <Link
                href={signupHref}
                className="font-medium underline underline-offset-4 hover-pink-text"
              >
                Sign up
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
