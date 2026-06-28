'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { createClient } from '@/lib/supabase/client';
import { GoogleIcon } from '@/components/auth/GoogleIcon';
import type { UserRole } from '@/types';

interface Props {
  returnTo: string | null;
  prefilledRole: UserRole | null;
  claimContext: { businessName: string } | null;
}

export function SignupForm({ returnTo, prefilledRole, claimContext }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [role, setRole] = useState<UserRole | null>(prefilledRole);
  const [agreed, setAgreed] = useState(false);

  // When the user arrived from a /claim/<token> URL, the role is locked to
  // 'vendor' (they're claiming a business) and the role picker is hidden.
  const roleLocked = prefilledRole !== null;

  // callbackUrl is the email-confirmation link destination.
  // We include signup_role so the auth callback can redirect to /signup/success
  // for fresh email signups (same logic as the Google OAuth cookie path).
  const buildCallbackUrl = (resolvedRole: UserRole | null) => {
    const params = new URLSearchParams();
    if (returnTo) params.set('redirect', returnTo);
    if (resolvedRole) params.set('signup_role', resolvedRole);
    const qs = params.toString();
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return `${origin}/api/auth/callback${qs ? `?${qs}` : ''}`;
  };

  const handleSignup = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!role) {
      toast.error('Please select whether you are planning an event or are a vendor.');
      return;
    }
    if (!agreed) {
      toast.error('Please accept the Terms and Privacy Policy to continue.');
      return;
    }
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;
    const fullName = formData.get('fullName') as string;

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName, role },
        emailRedirectTo: buildCallbackUrl(role),
      },
    });

    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }

    toast.success('Account created! Check your email to confirm.');
    router.push(`/login${returnTo ? `?return_to=${encodeURIComponent(returnTo)}` : ''}`);
  };

  const handleGoogleSignup = async () => {
    if (!role) {
      toast.error('Please select whether you are planning an event or are a vendor.');
      return;
    }
    if (!agreed) {
      toast.error('Please accept the Terms and Privacy Policy to continue.');
      return;
    }
    setLoading(true);
    // Persist role through the OAuth round-trip via cookie. URL query params
    // can be stripped by the Supabase auth proxy; a cookie is reliable.
    document.cookie = `signup_role=${role}; path=/; max-age=300; SameSite=Lax`;
    const oauthRedirect = `${window.location.origin}/api/auth/callback?signup_role=${role}${
      returnTo ? `&redirect=${encodeURIComponent(returnTo)}` : ''
    }`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: oauthRedirect },
    });
    if (error) {
      toast.error(error.message);
      setLoading(false);
    }
  };

  const submitLabel = loading
    ? 'Creating account…'
    : !role
      ? 'Choose an account type'
      : !agreed
        ? 'Accept the Terms to continue'
        : claimContext
          ? `Sign Up and Claim ${claimContext.businessName}`
          : `Sign up as ${role === 'couple' ? 'an event planner' : 'a vendor'}`;

  return (
    <Card className="border-ink/10 shadow-sm">
      {claimContext ? (
        <div className="-mb-2 rounded-t-[inherit] border-b border-indigo/20 bg-indigo/5 px-6 py-4">
          <p className="text-xs font-medium uppercase tracking-wide text-indigo">
            Claiming your business
          </p>
          <p className="mt-1 text-base font-semibold text-ink">{claimContext.businessName}</p>
          <p className="mt-1 text-xs text-ink/70">
            Sign up to take ownership of this listing. We&rsquo;ll link it to your new vendor
            account.
          </p>
        </div>
      ) : null}
      <CardHeader>
        <CardTitle className="font-spectral text-2xl text-ink">
          {claimContext ? 'Claim your listing' : 'Create your account'}
        </CardTitle>
        <CardDescription className="text-ink/70">
          {claimContext
            ? 'Create your vendor account to manage bookings and your profile.'
            : 'Join Baazar — the marketplace for culturally-focused wedding and event vendors.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Role Selection — hidden when the role is locked to 'vendor' from a claim URL */}
        {!roleLocked ? (
          <div className="space-y-2">
            <p className="text-center text-sm font-medium">
              First, tell us who you are
              <span className="ml-1 text-destructive">*</span>
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setRole('couple')}
                className={`rounded-lg border-2 p-4 text-center transition-colors ${
                  role === 'couple'
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50'
                }`}
              >
                <span className="block text-2xl" aria-hidden="true">
                  🎉
                </span>
                <span className="mt-1 block text-sm font-medium">Planning an Event</span>
              </button>
              <button
                type="button"
                onClick={() => setRole('vendor')}
                className={`rounded-lg border-2 p-4 text-center transition-colors ${
                  role === 'vendor'
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50'
                }`}
              >
                <span className="block text-2xl" aria-hidden="true">
                  🏪
                </span>
                <span className="mt-1 block text-sm font-medium">I’m a Vendor</span>
              </button>
            </div>
          </div>
        ) : null}

        <Button
          type="button"
          variant="outline"
          className="w-full bg-white text-foreground hover:bg-gray-50"
          disabled={loading || !role}
          onClick={handleGoogleSignup}
        >
          <GoogleIcon className="mr-2 h-4 w-4" />
          Continue with Google
        </Button>

        <div className="relative">
          <Separator />
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-xs text-muted-foreground">
            or
          </span>
        </div>

        <form onSubmit={handleSignup} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="fullName">Full Name</Label>
            <Input id="fullName" name="fullName" required placeholder="Your full name" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required placeholder="you@example.com" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              required
              minLength={8}
              placeholder="Min 8 characters"
            />
          </div>
          <div className="flex items-start gap-2">
            <input
              id="agree"
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-input"
            />
            <label htmlFor="agree" className="text-xs text-muted-foreground">
              I agree to the{' '}
              <Link href="/terms" target="_blank" className="underline">
                Terms of Service
              </Link>{' '}
              and{' '}
              <Link href="/privacy" target="_blank" className="underline">
                Privacy Policy
              </Link>
              .
            </label>
          </div>
          <Button type="submit" className="w-full" disabled={loading || !agreed || !role}>
            {submitLabel}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link
            href={`/login${returnTo ? `?return_to=${encodeURIComponent(returnTo)}` : ''}`}
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Log in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
