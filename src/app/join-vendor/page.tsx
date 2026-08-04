import { redirect } from 'next/navigation';

// Marketing entry for the vendor DM outreach campaign — every DM points to
// baazar.io/join-vendor. Prefer this page-based redirect over next.config.mjs
// redirects() because the config-level version was silently no-oping on prod
// (PR #105 shipped that path; verified 404 on prod after deploy). Server-side
// redirect() cannot silently fail — either the page renders and redirects,
// or the route is not deployed at all (loud 404).
//
// force-dynamic prevents the redirect from being pre-rendered / cached at
// build time — the redirect always fires at request time.
export const dynamic = 'force-dynamic';

export default function JoinVendorRedirect() {
  redirect('/signup?role=vendor');
}
