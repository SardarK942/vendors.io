'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { createClient } from '@/lib/supabase/client';
import { GoogleIcon } from '@/components/auth/GoogleIcon';
import type { UserRole } from '@/types';

interface Props {
  returnTo: string | null;
  prefilledRole: UserRole | null;
  claimContext: { businessName: string } | null;
  /** Selected role, lifted to the page so the brand panel can follow the picker. */
  role: UserRole | null;
  setRole: (role: UserRole) => void;
}

export function SignupForm({ returnTo, prefilledRole, claimContext, role, setRole }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [agreed, setAgreed] = useState(false);

  // Hide the couple/vendor picker whenever the entry point already decides the
  // role: a /claim/<token> URL (locked to 'vendor'), or an explicit
  // ?role=vendor|couple marketing link. Only the bare /signup shows the picker.
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
    const formData = new FormData(e.currentTarget);
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;
    const confirmPassword = formData.get('confirmPassword') as string;
    const fullName = formData.get('fullName') as string;

    if (password !== confirmPassword) {
      toast.error('Passwords do not match.');
      return;
    }

    setLoading(true);
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
          : role === 'vendor'
            ? 'Create Vendor Account'
            : 'Create Account';

  // Figma form register: soft gray rounded fields with bold dark labels, on the
  // white form column. Neutral grays match the Figma; text uses the ink token.
  const fieldClass = 'rounded-xl border-[#e5e7eb] bg-[#f6f8fa] text-ink placeholder:text-[#8a94a6]';
  const labelClass = 'text-sm font-semibold text-ink';

  return (
    <Card className="border-none bg-transparent p-0 shadow-none">
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
          {claimContext
            ? 'Claim your listing'
            : role === 'vendor'
              ? 'Create your vendor account'
              : 'Create your account'}
        </CardTitle>
        <CardDescription className="text-ink/70">
          {claimContext
            ? 'Create your vendor account to manage bookings and your profile.'
            : role === 'vendor'
              ? 'Complete the details below to start building your vendor profile.'
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
                aria-pressed={role === 'couple'}
                className={`rounded-md border-2 p-4 text-center transition-[transform,border-color,background-color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo focus-visible:ring-offset-2 focus-visible:ring-offset-cream active:scale-[0.98] motion-reduce:active:scale-100 ${
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
                aria-pressed={role === 'vendor'}
                className={`rounded-md border-2 p-4 text-center transition-[transform,border-color,background-color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo focus-visible:ring-offset-2 focus-visible:ring-offset-cream active:scale-[0.98] motion-reduce:active:scale-100 ${
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
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white px-2 text-xs text-muted-foreground">
            or
          </span>
        </div>

        <form onSubmit={handleSignup} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="fullName" className={labelClass}>
              Full Name
            </Label>
            <Input
              id="fullName"
              name="fullName"
              required
              placeholder="eg. Jane Doe"
              autoComplete="name"
              className={fieldClass}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email" className={labelClass}>
              Email
            </Label>
            <Input
              id="email"
              name="email"
              type="email"
              required
              placeholder="Enter your email address"
              autoComplete="email"
              inputMode="email"
              spellCheck={false}
              autoCapitalize="none"
              className={fieldClass}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password" className={labelClass}>
              Password
            </Label>
            <PasswordInput
              id="password"
              name="password"
              required
              minLength={8}
              placeholder="Min 8 characters"
              autoComplete="new-password"
              className={fieldClass}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword" className={labelClass}>
              Confirm Password
            </Label>
            <PasswordInput
              id="confirmPassword"
              name="confirmPassword"
              required
              minLength={8}
              placeholder="Re-enter your password"
              autoComplete="new-password"
              className={fieldClass}
            />
          </div>
          <div className="flex items-start gap-2">
            <input
              id="agree"
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-input focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo focus-visible:ring-offset-2 focus-visible:ring-offset-cream"
            />
            <label htmlFor="agree" className="text-xs text-muted-foreground">
              I agree to the{' '}
              <Link href="/terms" target="_blank" rel="noopener noreferrer" className="underline">
                Terms of Service
              </Link>{' '}
              and{' '}
              <Link href="/privacy" target="_blank" rel="noopener noreferrer" className="underline">
                Privacy Policy
              </Link>
              .
            </label>
          </div>
          <Button
            type="submit"
            className="w-full bg-hot-pink text-cream hover:-translate-y-px hover:bg-hot-pink/90 hover:shadow-pink motion-reduce:hover:translate-y-0"
            disabled={loading || !agreed || !role}
          >
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
