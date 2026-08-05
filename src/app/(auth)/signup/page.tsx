import { parseTokenString } from '../../../../scripts/scraper/lib/claim-token';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { SignupExperience } from './signup-experience';
import type { UserRole } from '@/types';

interface Props {
  searchParams: Promise<{ return_to?: string; role?: string }>;
}

export default async function SignupPage({ searchParams }: Props) {
  const params = await searchParams;
  const returnTo = params.return_to ?? null;
  const roleHint = params.role ?? null;

  let claimContext: { businessName: string } | null = null;
  let prefilledRole: UserRole | null = null;

  // Marketing links can preselect a role via ?role=vendor|couple (e.g. /join-vendor
  // → /signup?role=vendor). This preselects the form + brand panel but does NOT lock
  // the role picker — only a claim token locks it (handled below, and it wins).
  if (params.role === 'vendor' || params.role === 'couple') {
    prefilledRole = params.role;
  }

  // If the user arrived here from a /claim/<token> redirect, decode the token
  // server-side to look up the business name. The vendor row id is encoded
  // (not encrypted) in the token; lookup is safe with service-role.
  if (returnTo?.startsWith('/claim/')) {
    // Defensive decode: the /claim route's redirect can result in the `:` in
    // the token being double-encoded (`%253A` instead of `%3A`), which would
    // leave us with %3A in the sliced string. Decoding is a no-op if the
    // string is already raw.
    const token = decodeURIComponent(returnTo.slice('/claim/'.length));
    const parsed = parseTokenString(token);
    if (parsed) {
      const supabase = createServiceRoleClient();
      const { data } = await supabase
        .from('scraped_vendors')
        .select('business_name')
        .eq('id', parsed.scrapedVendorId)
        .maybeSingle();
      if (data?.business_name) {
        claimContext = { businessName: data.business_name };
        prefilledRole = 'vendor';
      }
    }
  }

  // Marketing / DM-campaign entry: /signup?role=vendor (used by the
  // /join-vendor redirect). Only applied when no claim context has already
  // set the role — claim tokens take priority.
  if (!prefilledRole && (roleHint === 'vendor' || roleHint === 'couple')) {
    prefilledRole = roleHint;
  }

  return (
    <SignupExperience
      returnTo={returnTo}
      prefilledRole={prefilledRole}
      claimContext={claimContext}
    />
  );
}
