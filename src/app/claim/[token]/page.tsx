import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { verifyAndConsumeToken, type ClaimResult } from './claim-actions';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ token: string }>;
}

const REASONS: Record<NonNullable<ClaimResult['reason']>, string> = {
  invalid: 'This claim link is not valid. Make sure you used the link from your message.',
  expired: 'This claim link has expired. Reply to the original message and we’ll send a new one.',
  revoked:
    'This claim link has been revoked. Reply to the original message and we’ll send a new one.',
  already_claimed:
    'This business has already been claimed. If it’s yours, sign in with the account you used.',
  unknown: 'Something went wrong. Please try again or contact support.',
};

export default async function ClaimPage({ params }: Props) {
  const { token: rawToken } = await params;
  // Tokens contain `:` (b64url ID + b64url random). Browsers (notably Chromium)
  // sometimes encode `:` to %3A in path segments during navigation, and
  // Next.js doesn't auto-decode dynamic params. Decode defensively so both
  // forms (raw `:` and encoded `%3A`) reach parseTokenString correctly.
  const token = decodeURIComponent(rawToken);
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/signup?return_to=${encodeURIComponent(`/claim/${token}`)}`);
  }

  const result = await verifyAndConsumeToken(token, user.id);

  if (result.ok) {
    // Either a fresh claim, or the original claimer returning — the action
    // decides whether to resume onboarding or go to the live profile.
    redirect(result.redirectTo ?? '/dashboard/profile/setup');
  }

  const signInHref = `/login?redirect=${encodeURIComponent(`/claim/${token}`)}`;

  return (
    <main className="mx-auto max-w-md p-8 text-center">
      <h1 className="mb-4 text-2xl font-semibold">Couldn&rsquo;t claim</h1>
      <p className="text-ink-muted">{REASONS[result.reason ?? 'unknown']}</p>
      {result.reason === 'already_claimed' && (
        <Link
          href={signInHref}
          className="mt-6 inline-flex items-center justify-center rounded-md bg-ink px-5 py-2.5 text-sm font-medium text-cream transition-colors hover:bg-ink/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo focus-visible:ring-offset-2 focus-visible:ring-offset-cream"
        >
          Sign in
        </Link>
      )}
    </main>
  );
}
