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
  already_claimed: 'This business has already been claimed. Sign in instead.',
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
    redirect('/dashboard/profile/setup');
  }

  return (
    <main className="mx-auto max-w-md p-8 text-center">
      <h1 className="mb-4 text-2xl font-semibold">Couldn&rsquo;t claim</h1>
      <p>{REASONS[result.reason ?? 'unknown']}</p>
    </main>
  );
}
