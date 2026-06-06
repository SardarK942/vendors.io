import { parseTokenString } from '../../../../scripts/scraper/lib/claim-token';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { SignupForm } from './signup-form';
import type { UserRole } from '@/types';

interface Props {
  searchParams: Promise<{ return_to?: string }>;
}

export default async function SignupPage({ searchParams }: Props) {
  const params = await searchParams;
  const returnTo = params.return_to ?? null;

  let claimContext: { businessName: string } | null = null;
  let prefilledRole: UserRole | null = null;

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

  return (
    <SignupForm returnTo={returnTo} prefilledRole={prefilledRole} claimContext={claimContext} />
  );
}
