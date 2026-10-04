# Shop Connect Onboarding (SP1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a local bridal-wear vendor link a Stripe **Standard** connected account so the shop can pay them, tracking charge-readiness — the money prerequisite for shop checkout (SP2).

**Architecture:** A new `vendor_stripe_accounts` table stores the connected-account id + three Stripe readiness flags. A `connect.service.ts` creates the account (gated to `bridal_wear` + `local`), mints Stripe-hosted onboarding links, and syncs status. A thin `POST /api/connect/onboard` route returns a link; the existing Stripe webhook gains an `account.updated` case to keep flags fresh; a `/dashboard/profile/payments` page shows status. No charges, ledger, escrow, or transfers (SP2).

**Tech Stack:** Next.js 14 App Router, Supabase (Postgres + RLS), Stripe Node SDK (`@/lib/stripe/client`), Vitest + RTL, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-04-shop-connect-onboarding-design.md`

## Global Constraints

- `any` type is forbidden — use `unknown` + narrowing. All params/returns typed.
- API inputs validated with Zod; business logic in `services/`/`lib/`, routes handle request/response only; no direct DB calls from routes — use `getActiveVendorProfileId` + service functions.
- Service functions return `ServiceResult<T>` (`{ data?, error?, status }`) from `@/types`.
- Stripe account type is **`standard`**, `country: 'US'` (local = Chicago-area).
- Onboarding is gated: `category === 'bridal_wear' && vendor_origin === 'local'` → else `403`.
- Status writes (account create row + webhook sync) use the **service-role** client (`createServiceRoleClient`); vendor reads go through the RLS client.
- The "Payouts" nav entry is gated behind `NEXT_PUBLIC_SHOP_ENABLED` (`SHOP_ENABLED` from `@/lib/flags`).
- Migration apply policy: Claude applies **dev** via psql; the **user** applies **prod**. Additive only, no down-migration.
- `database.types.ts` is hand-patched for the new table (regen-pending convention).
- Git: feature branch `feat/shop-connect-onboarding` (already created off `origin/main`); commit per task; pre-commit hooks must pass.

## Review Focus

- **Expired/abandoned onboarding link** — a vendor returns to `/dashboard/profile/payments?refresh=1` after the single-use Account Link expired; the page must offer a fresh link, not a dead end. (Task 5)
- **`account.updated` for an untracked account** — a webhook for a `stripe_account_id` with no `vendor_stripe_accounts` row (or any non-shop Connect account) must no-op, not throw/500. (Task 4)
- **Double-submit of "Set up payouts"** — two rapid POSTs must not create two Stripe accounts for one vendor; `getOrCreateConnectAccount` returns the existing row's id. (Task 2)
- **International or non-bridal vendor hitting the route directly** — `POST /api/connect/onboard` must return `403`, never create an account. (Task 2 service gate; Task 3 propagation)
- **Partially-onboarded account** (`details_submitted` true, `charges_enabled` false) — status UI must show "finish verification", not "ready". (Task 5)

---

## File Structure

- Create `supabase/migrations/00086_vendor_stripe_accounts.sql` — the table + RLS.
- Modify `src/types/database.types.ts` — add the `vendor_stripe_accounts` table types.
- Create `src/services/connect.service.ts` — account create/link/status (the logic).
- Create `src/__tests__/services/connect.service.test.ts` — service unit tests.
- Create `src/app/api/connect/onboard/route.ts` — the onboard endpoint.
- Create `src/__tests__/api/connect-onboard.test.ts` — route test.
- Modify `src/app/api/webhooks/stripe/route.ts` — add `account.updated` case.
- Create `src/__tests__/api/webhooks/stripe-account-updated.test.ts` — webhook test.
- Create `src/app/dashboard/profile/payments/page.tsx` — server page (loads status, handles `?return=1`).
- Create `src/app/dashboard/profile/payments/PaymentsClient.tsx` — client UI (three states, POSTs onboard).
- Modify `src/components/dashboard/SidebarNav.tsx` — add Payouts link for local bridal vendors behind the flag.
- Modify `src/app/dashboard/layout.tsx` — pass `isLocalBridalVendor` to `SidebarNav`.
- Modify `src/__tests__/components/dashboard/SidebarNav.test.tsx` — cover the new link.
- Modify `src/app/dashboard/profile/shop/page.tsx` — soft "set up payouts" banner when not charge-ready.
- Create `tests/e2e/shop-connect-onboarding.spec.ts` — flow e2e (stubbed Stripe).
- Modify `tests/e2e/helpers/seed.ts` — allow seeding `vendor_origin` + a `vendor_stripe_accounts` row.

---

### Task 1: Migration + database types

**Files:**

- Create: `supabase/migrations/00086_vendor_stripe_accounts.sql`
- Modify: `src/types/database.types.ts`

**Interfaces:**

- Produces: table `vendor_stripe_accounts(id, vendor_profile_id, stripe_account_id, charges_enabled, payouts_enabled, details_submitted, created_at, updated_at)`; TS row/insert/update types at `Database['public']['Tables']['vendor_stripe_accounts']`.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/00086_vendor_stripe_accounts.sql
-- Stripe Connect Standard onboarding for local bridal-wear vendors (Shop SP1).
-- Rebuilds the connected-account record dropped in 00058 (fresh name to avoid
-- the stale scripts that referenced the old `stripe_accounts`). Stores the
-- account id + Stripe readiness flags. No funds/ledger here — see SP2.
CREATE TABLE vendor_stripe_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_profile_id uuid NOT NULL UNIQUE REFERENCES vendor_profiles(id) ON DELETE CASCADE,
  stripe_account_id text NOT NULL UNIQUE,
  charges_enabled   boolean NOT NULL DEFAULT false,
  payouts_enabled   boolean NOT NULL DEFAULT false,
  details_submitted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX vendor_stripe_accounts_vendor_idx ON vendor_stripe_accounts(vendor_profile_id);

ALTER TABLE vendor_stripe_accounts ENABLE ROW LEVEL SECURITY;

-- Vendor may read their own row (status display).
CREATE POLICY "Vendors view own stripe account" ON vendor_stripe_accounts
  FOR SELECT TO authenticated
  USING (vendor_profile_id IN (SELECT id FROM vendor_profiles WHERE user_id = auth.uid()));

-- Server owns writes (onboarding route + webhook use the service-role client,
-- which bypasses RLS; this permissive policy mirrors the historical 00004 shape).
CREATE POLICY "Service role manages stripe accounts" ON vendor_stripe_accounts
  FOR ALL USING (true) WITH CHECK (true);
```

- [ ] **Step 2: Apply to dev**

Run (per migration-apply policy; connection per the Supabase-prod/dev memory):
`psql "$SUPABASE_DEV_DB_URL" -f supabase/migrations/00086_vendor_stripe_accounts.sql`
Expected: `CREATE TABLE` / `CREATE INDEX` / `ALTER TABLE` / `CREATE POLICY` ×2, no error. If the dev DB password isn't in `.env.local`, stop and ask the user to apply it.

- [ ] **Step 3: Hand-patch `database.types.ts`**

Add to `Database['public']['Tables']` (alphabetical-ish, near other vendor tables). Match the existing generated style:

```typescript
vendor_stripe_accounts: {
  Row: {
    id: string;
    vendor_profile_id: string;
    stripe_account_id: string;
    charges_enabled: boolean;
    payouts_enabled: boolean;
    details_submitted: boolean;
    created_at: string;
    updated_at: string;
  };
  Insert: {
    id?: string;
    vendor_profile_id: string;
    stripe_account_id: string;
    charges_enabled?: boolean;
    payouts_enabled?: boolean;
    details_submitted?: boolean;
    created_at?: string;
    updated_at?: string;
  };
  Update: {
    id?: string;
    vendor_profile_id?: string;
    stripe_account_id?: string;
    charges_enabled?: boolean;
    payouts_enabled?: boolean;
    details_submitted?: boolean;
    created_at?: string;
    updated_at?: string;
  };
  Relationships: [];
};
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: PASS (0 errors).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/00086_vendor_stripe_accounts.sql src/types/database.types.ts
git commit -m "feat(shop): vendor_stripe_accounts table + types (Connect SP1)"
```

---

### Task 2: `connect.service.ts`

**Files:**

- Create: `src/services/connect.service.ts`
- Test: `src/__tests__/services/connect.service.test.ts`

**Interfaces:**

- Consumes: `stripe` from `@/lib/stripe/client`; `ServiceResult` from `@/types`; `Database` from `@/types/database.types`.
- Produces:
  - `getOrCreateConnectAccount(supabase, serviceClient, vendorProfileId): Promise<ServiceResult<{ accountId: string }>>`
  - `createOnboardingLink(accountId: string, origin: string): Promise<ServiceResult<{ url: string }>>`
  - `refreshAccountStatus(serviceClient, stripeAccountId: string): Promise<void>`
  - `getConnectStatus(supabase, vendorProfileId): Promise<ServiceResult<ConnectStatus>>` where `ConnectStatus = { connected: boolean; charges_enabled: boolean; payouts_enabled: boolean; details_submitted: boolean }`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/__tests__/services/connect.service.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const accountsCreate = vi.fn();
const accountsRetrieve = vi.fn();
const accountLinksCreate = vi.fn();
vi.mock('@/lib/stripe/client', () => ({
  stripe: {
    accounts: {
      create: (...a: unknown[]) => accountsCreate(...a),
      retrieve: (...a: unknown[]) => accountsRetrieve(...a),
    },
    accountLinks: { create: (...a: unknown[]) => accountLinksCreate(...a) },
  },
}));

import {
  getOrCreateConnectAccount,
  createOnboardingLink,
  refreshAccountStatus,
} from '@/services/connect.service';

// Minimal chainable fake for the one-table reads/writes the service makes.
function fakeClient(opts: {
  profile?: { category: string; vendor_origin: string } | null;
  existingAccount?: { stripe_account_id: string } | null;
}) {
  const updates: Array<Record<string, unknown>> = [];
  const inserts: Array<Record<string, unknown>> = [];
  const client = {
    updates,
    inserts,
    from(table: string) {
      if (table === 'vendor_profiles') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: opts.profile ?? null }) }),
          }),
        };
      }
      // vendor_stripe_accounts
      return {
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: opts.existingAccount ?? null }) }),
        }),
        insert: (v: Record<string, unknown>) => {
          inserts.push(v);
          return { select: () => ({ single: async () => ({ data: { ...v }, error: null }) }) };
        },
        update: (patch: Record<string, unknown>) => ({
          eq: async () => {
            updates.push(patch);
            return { error: null };
          },
        }),
      };
    },
  };
  return client as unknown as Parameters<typeof getOrCreateConnectAccount>[0];
}

beforeEach(() => {
  accountsCreate.mockReset();
  accountsRetrieve.mockReset();
  accountLinksCreate.mockReset();
});

describe('getOrCreateConnectAccount — gating', () => {
  it('rejects a non-bridal vendor with 403 and never creates an account', async () => {
    const c = fakeClient({ profile: { category: 'photography', vendor_origin: 'local' } });
    const res = await getOrCreateConnectAccount(c, c, 'vp_1');
    expect(res.status).toBe(403);
    expect(accountsCreate).not.toHaveBeenCalled();
  });

  it('rejects an international bridal vendor with 403', async () => {
    const c = fakeClient({ profile: { category: 'bridal_wear', vendor_origin: 'international' } });
    const res = await getOrCreateConnectAccount(c, c, 'vp_1');
    expect(res.status).toBe(403);
    expect(accountsCreate).not.toHaveBeenCalled();
  });
});

describe('getOrCreateConnectAccount — idempotency', () => {
  it('returns the existing account id without creating a second Stripe account', async () => {
    const c = fakeClient({
      profile: { category: 'bridal_wear', vendor_origin: 'local' },
      existingAccount: { stripe_account_id: 'acct_existing' },
    });
    const res = await getOrCreateConnectAccount(c, c, 'vp_1');
    expect(res.data?.accountId).toBe('acct_existing');
    expect(accountsCreate).not.toHaveBeenCalled();
  });

  it('creates a Standard US account for a local bridal vendor with no row yet', async () => {
    accountsCreate.mockResolvedValueOnce({ id: 'acct_new' });
    const c = fakeClient({
      profile: { category: 'bridal_wear', vendor_origin: 'local' },
      existingAccount: null,
    });
    const res = await getOrCreateConnectAccount(c, c, 'vp_1');
    expect(accountsCreate).toHaveBeenCalledWith({ type: 'standard', country: 'US' });
    expect(res.data?.accountId).toBe('acct_new');
    expect((c as unknown as { inserts: Array<Record<string, unknown>> }).inserts[0]).toMatchObject({
      vendor_profile_id: 'vp_1',
      stripe_account_id: 'acct_new',
    });
  });
});

describe('createOnboardingLink', () => {
  it('requests an account_onboarding link with return/refresh urls', async () => {
    accountLinksCreate.mockResolvedValueOnce({ url: 'https://connect.stripe.com/setup/x' });
    const res = await createOnboardingLink('acct_1', 'https://app.test');
    expect(accountLinksCreate).toHaveBeenCalledWith({
      account: 'acct_1',
      type: 'account_onboarding',
      return_url: 'https://app.test/dashboard/profile/payments?return=1',
      refresh_url: 'https://app.test/dashboard/profile/payments?refresh=1',
    });
    expect(res.data?.url).toBe('https://connect.stripe.com/setup/x');
  });
});

describe('refreshAccountStatus', () => {
  it('writes the three readiness flags from the retrieved account', async () => {
    accountsRetrieve.mockResolvedValueOnce({
      id: 'acct_1',
      charges_enabled: true,
      payouts_enabled: false,
      details_submitted: true,
    });
    const c = fakeClient({});
    await refreshAccountStatus(c, 'acct_1');
    const patch = (c as unknown as { updates: Array<Record<string, unknown>> }).updates[0];
    expect(patch).toMatchObject({
      charges_enabled: true,
      payouts_enabled: false,
      details_submitted: true,
    });
  });

  it('no-ops when the account is not tracked (no row) without throwing', async () => {
    accountsRetrieve.mockResolvedValueOnce({
      id: 'acct_unknown',
      charges_enabled: true,
      payouts_enabled: true,
      details_submitted: true,
    });
    const c = fakeClient({});
    await expect(refreshAccountStatus(c, 'acct_unknown')).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/services/connect.service.test.ts`
Expected: FAIL (`connect.service` has no exports yet).

- [ ] **Step 3: Implement the service**

```typescript
// src/services/connect.service.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';
import type { ServiceResult } from '@/types';
import { stripe } from '@/lib/stripe/client';

type Client = SupabaseClient<Database>;

export interface ConnectStatus {
  connected: boolean;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
}

/**
 * Create (or fetch) the vendor's Stripe Standard connected account.
 *
 * `supabase` is the RLS client (gate lookup); `serviceClient` is the
 * service-role client that writes the row (vendors have no INSERT policy).
 * Gated to local bridal-wear vendors — the only lane that uses Connect.
 */
export async function getOrCreateConnectAccount(
  supabase: Client,
  serviceClient: Client,
  vendorProfileId: string
): Promise<ServiceResult<{ accountId: string }>> {
  const { data: profile } = await supabase
    .from('vendor_profiles')
    .select('category, vendor_origin')
    .eq('id', vendorProfileId)
    .maybeSingle();

  if (!profile) return { error: 'Vendor profile not found', status: 404 };
  if (profile.category !== 'bridal_wear' || profile.vendor_origin !== 'local') {
    return { error: 'Payouts are only available to local bridal wear vendors', status: 403 };
  }

  const { data: existing } = await serviceClient
    .from('vendor_stripe_accounts')
    .select('stripe_account_id')
    .eq('vendor_profile_id', vendorProfileId)
    .maybeSingle();

  if (existing) return { data: { accountId: existing.stripe_account_id }, status: 200 };

  const account = await stripe.accounts.create({ type: 'standard', country: 'US' });

  const { error } = await serviceClient
    .from('vendor_stripe_accounts')
    .insert({ vendor_profile_id: vendorProfileId, stripe_account_id: account.id })
    .select('stripe_account_id')
    .single();

  if (error) return { error: error.message, status: 500 };
  return { data: { accountId: account.id }, status: 201 };
}

/** Mint a single-use Stripe-hosted onboarding link. */
export async function createOnboardingLink(
  accountId: string,
  origin: string
): Promise<ServiceResult<{ url: string }>> {
  const link = await stripe.accountLinks.create({
    account: accountId,
    type: 'account_onboarding',
    return_url: `${origin}/dashboard/profile/payments?return=1`,
    refresh_url: `${origin}/dashboard/profile/payments?refresh=1`,
  });
  return { data: { url: link.url }, status: 200 };
}

/**
 * Sync the three readiness flags from Stripe onto our row. No-ops if the
 * account isn't one we track (webhook may deliver events for accounts created
 * by other flows). Writes with the service-role client.
 */
export async function refreshAccountStatus(
  serviceClient: Client,
  stripeAccountId: string
): Promise<void> {
  const account = await stripe.accounts.retrieve(stripeAccountId);
  await serviceClient
    .from('vendor_stripe_accounts')
    .update({
      charges_enabled: account.charges_enabled ?? false,
      payouts_enabled: account.payouts_enabled ?? false,
      details_submitted: account.details_submitted ?? false,
      updated_at: new Date().toISOString(),
    })
    .eq('stripe_account_id', stripeAccountId);
}

/** Read the vendor's payout status for the dashboard. */
export async function getConnectStatus(
  supabase: Client,
  vendorProfileId: string
): Promise<ServiceResult<ConnectStatus>> {
  const { data } = await supabase
    .from('vendor_stripe_accounts')
    .select('charges_enabled, payouts_enabled, details_submitted')
    .eq('vendor_profile_id', vendorProfileId)
    .maybeSingle();

  return {
    data: {
      connected: data != null,
      charges_enabled: data?.charges_enabled ?? false,
      payouts_enabled: data?.payouts_enabled ?? false,
      details_submitted: data?.details_submitted ?? false,
    },
    status: 200,
  };
}
```

> Note: the `.update().eq()` with no matching row is a successful no-op in supabase-js (affects 0 rows), satisfying the untracked-account test.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/services/connect.service.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/services/connect.service.ts src/__tests__/services/connect.service.test.ts
git commit -m "feat(shop): connect.service — Standard account create/link/status"
```

---

### Task 3: `POST /api/connect/onboard`

**Files:**

- Create: `src/app/api/connect/onboard/route.ts`
- Test: `src/__tests__/api/connect-onboard.test.ts`

**Interfaces:**

- Consumes: `getOrCreateConnectAccount`, `createOnboardingLink` (Task 2); `requireUser` (`@/lib/api/auth`); `getActiveVendorProfileId` (`@/lib/vendor/active`); `createServiceRoleClient` (`@/lib/supabase/server`); `withErrorBoundary`, `HttpError` (`@/lib/api/error-boundary`); `checkRateLimit` (`@/lib/rate-limit`).
- Produces: `POST` handler returning `{ data: { url } }` or `{ error }` with the service status.

- [ ] **Step 1: Write the failing test**

```typescript
// src/__tests__/api/connect-onboard.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const requireUser = vi.fn();
vi.mock('@/lib/api/auth', () => ({ requireUser: () => requireUser() }));

const getActiveVendorProfileId = vi.fn();
vi.mock('@/lib/vendor/active', () => ({
  getActiveVendorProfileId: (...a: unknown[]) => getActiveVendorProfileId(...a),
}));

vi.mock('@/lib/supabase/server', () => ({ createServiceRoleClient: () => ({}) }));

vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: async () => ({ ok: true }) }));

const getOrCreateConnectAccount = vi.fn();
const createOnboardingLink = vi.fn();
vi.mock('@/services/connect.service', () => ({
  getOrCreateConnectAccount: (...a: unknown[]) => getOrCreateConnectAccount(...a),
  createOnboardingLink: (...a: unknown[]) => createOnboardingLink(...a),
}));

import { POST } from '@/app/api/connect/onboard/route';

function req() {
  return new NextRequest('http://localhost/api/connect/onboard', { method: 'POST' });
}

beforeEach(() => {
  requireUser.mockResolvedValue({ user: { id: 'u1' }, supabase: {} });
  getActiveVendorProfileId.mockResolvedValue('vp_1');
  getOrCreateConnectAccount.mockReset();
  createOnboardingLink.mockReset();
});

describe('POST /api/connect/onboard', () => {
  it('returns the onboarding url for a valid local bridal vendor', async () => {
    getOrCreateConnectAccount.mockResolvedValue({ data: { accountId: 'acct_1' }, status: 201 });
    createOnboardingLink.mockResolvedValue({ data: { url: 'https://stripe/x' }, status: 200 });
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect((await res.json()).data.url).toBe('https://stripe/x');
  });

  it('propagates the service 403 for a non-eligible vendor and does not mint a link', async () => {
    getOrCreateConnectAccount.mockResolvedValue({ error: 'not eligible', status: 403 });
    const res = await POST(req());
    expect(res.status).toBe(403);
    expect(createOnboardingLink).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/api/connect-onboard.test.ts`
Expected: FAIL (route module not found).

- [ ] **Step 3: Implement the route**

```typescript
// src/app/api/connect/onboard/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { withErrorBoundary, HttpError } from '@/lib/api/error-boundary';
import { requireUser } from '@/lib/api/auth';
import { getActiveVendorProfileId } from '@/lib/vendor/active';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { getOrCreateConnectAccount, createOnboardingLink } from '@/services/connect.service';

export const POST = withErrorBoundary(async (request: NextRequest) => {
  const { user, supabase } = await requireUser();

  const gate = await checkRateLimit(
    request,
    'connect:onboard',
    { limit: 5, window: '10 m' },
    user.id
  );
  if (!gate.ok) throw new HttpError(429, gate.message!);

  const vendorProfileId = await getActiveVendorProfileId(supabase, user.id);
  if (!vendorProfileId) throw new HttpError(403, 'No vendor profile found for this user');

  const serviceClient = createServiceRoleClient();
  const account = await getOrCreateConnectAccount(supabase, serviceClient, vendorProfileId);
  if (account.error) {
    return NextResponse.json({ error: account.error }, { status: account.status });
  }

  const origin = process.env.NEXT_PUBLIC_APP_URL!;
  const link = await createOnboardingLink(account.data!.accountId, origin);
  if (link.error) {
    return NextResponse.json({ error: link.error }, { status: link.status });
  }

  return NextResponse.json({ data: link.data }, { status: 200 });
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/api/connect-onboard.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/connect/onboard/route.ts src/__tests__/api/connect-onboard.test.ts
git commit -m "feat(shop): POST /api/connect/onboard returns Stripe onboarding link"
```

---

### Task 4: Webhook `account.updated` case

**Files:**

- Modify: `src/app/api/webhooks/stripe/route.ts`
- Test: `src/__tests__/api/webhooks/stripe-account-updated.test.ts`

**Interfaces:**

- Consumes: `refreshAccountStatus` (Task 2).
- Produces: the webhook handles `event.type === 'account.updated'` by calling `refreshAccountStatus(serviceClient, event.account)`.

- [ ] **Step 1: Write the failing test**

```typescript
// src/__tests__/api/webhooks/stripe-account-updated.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const FAKE_EVENT = {
  id: 'evt_acct_1',
  type: 'account.updated',
  account: 'acct_42',
  data: { object: { id: 'acct_42', charges_enabled: true } },
} as unknown;

vi.mock('@/lib/stripe/client', () => ({
  stripe: { webhooks: { constructEvent: vi.fn(() => FAKE_EVENT) } },
}));

const refreshAccountStatus = vi.fn();
vi.mock('@/services/payment.service', () => ({
  handlePaymentSuccess: vi.fn(),
  handlePaymentFailure: vi.fn(),
  handleChargeRefunded: vi.fn(),
  handlePayoutEvent: vi.fn(),
}));
vi.mock('@/services/connect.service', () => ({
  refreshAccountStatus: (...a: unknown[]) => refreshAccountStatus(...a),
}));

const store: { row: Record<string, unknown> | null } = { row: null };
vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: store.row }) }) }),
      insert: async (v: Record<string, unknown>) => {
        store.row = { ...v, handled_at: null, error: null };
        return { error: null };
      },
      update: (patch: Record<string, unknown>) => ({
        eq: async () => {
          store.row = { ...(store.row ?? {}), ...patch };
          return { error: null };
        },
      }),
    }),
  }),
}));

import { POST } from '@/app/api/webhooks/stripe/route';

beforeEach(() => {
  store.row = null;
  refreshAccountStatus.mockReset();
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
});

it('calls refreshAccountStatus with the event account on account.updated', async () => {
  const res = await POST(
    new NextRequest('http://localhost/api/webhooks/stripe', {
      method: 'POST',
      headers: { 'stripe-signature': 'sig' },
      body: '{}',
    })
  );
  expect(res.status).toBe(200);
  expect(refreshAccountStatus).toHaveBeenCalledWith(expect.anything(), 'acct_42');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/api/webhooks/stripe-account-updated.test.ts`
Expected: FAIL (no `account.updated` case → `refreshAccountStatus` not called).

- [ ] **Step 3: Add the case**

In `src/app/api/webhooks/stripe/route.ts`, add the import near the other service imports:

```typescript
import { refreshAccountStatus } from '@/services/connect.service';
```

Add a case inside the `switch (event.type)` block (before `default`):

```typescript
      case 'account.updated': {
        // Connect Standard account readiness changed (onboarding progress).
        // event.account is the connected account id. No-ops if untracked.
        if (event.account) await refreshAccountStatus(supabase, event.account);
        break;
      }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/api/webhooks/stripe-account-updated.test.ts src/__tests__/api/webhooks/stripe-retry.test.ts`
Expected: PASS (new case works; the existing retry test still passes).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/webhooks/stripe/route.ts src/__tests__/api/webhooks/stripe-account-updated.test.ts
git commit -m "feat(shop): sync connect status on account.updated webhook"
```

---

### Task 5: `/dashboard/profile/payments` page + client UI

**Files:**

- Create: `src/app/dashboard/profile/payments/page.tsx`
- Create: `src/app/dashboard/profile/payments/PaymentsClient.tsx`
- Test: `src/__tests__/components/dashboard/PaymentsClient.test.tsx`

**Interfaces:**

- Consumes: `getConnectStatus`, `refreshAccountStatus` (Task 2); `requireUser`, `getActiveVendorProfileId`, `createServiceRoleClient`.
- Produces: `PaymentsClient({ status }: { status: ConnectStatus })` rendering three states and POSTing `/api/connect/onboard`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/__tests__/components/dashboard/PaymentsClient.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PaymentsClient } from '@/app/dashboard/profile/payments/PaymentsClient';

describe('PaymentsClient', () => {
  it('shows the connect CTA when not connected', () => {
    render(
      <PaymentsClient
        status={{
          connected: false,
          charges_enabled: false,
          payouts_enabled: false,
          details_submitted: false,
        }}
      />
    );
    expect(screen.getByRole('button', { name: /set up payouts/i })).toBeInTheDocument();
  });

  it('shows "finish verification" when details submitted but not charge-ready', () => {
    render(
      <PaymentsClient
        status={{
          connected: true,
          charges_enabled: false,
          payouts_enabled: false,
          details_submitted: true,
        }}
      />
    );
    expect(screen.getByText(/finish verif/i)).toBeInTheDocument();
  });

  it('shows the ready state when charges are enabled', () => {
    render(
      <PaymentsClient
        status={{
          connected: true,
          charges_enabled: true,
          payouts_enabled: true,
          details_submitted: true,
        }}
      />
    );
    expect(screen.getByText(/set up to get paid/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/components/dashboard/PaymentsClient.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the client component**

```tsx
// src/app/dashboard/profile/payments/PaymentsClient.tsx
'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import type { ConnectStatus } from '@/services/connect.service';

export function PaymentsClient({ status }: { status: ConnectStatus }) {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function startOnboarding() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/connect/onboard', { method: 'POST' });
      const body = (await res.json()) as { data?: { url: string }; error?: string };
      if (!res.ok || !body.data) throw new Error(body.error ?? 'Could not start setup');
      window.location.href = body.data.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
      setLoading(false);
    }
  }

  if (status.charges_enabled) {
    return (
      <div>
        <h1 className="text-2xl font-semibold">Payouts</h1>
        <p className="mt-2 text-muted-foreground">
          You&rsquo;re set up to get paid. Customer payments for your shop will be sent to your
          connected Stripe account.
        </p>
      </div>
    );
  }

  const pending = status.connected && status.details_submitted;

  return (
    <div>
      <h1 className="text-2xl font-semibold">Payouts</h1>
      <p className="mt-2 text-muted-foreground">
        {pending
          ? 'Almost there — finish verification with Stripe so you can receive payments. Any earnings from early sales are held until this is complete.'
          : 'Set up payouts with Stripe to receive payments for your shop. You can build your catalog first, but customers can only buy once this is done — and any earnings before then are held for you until you finish setup.'}
      </p>
      <Button className="mt-4" onClick={startOnboarding} disabled={loading}>
        {loading
          ? 'Opening Stripe…'
          : pending
            ? 'Finish verification'
            : 'Set up payouts with Stripe'}
      </Button>
      {error ? <p className="mt-2 text-sm text-hot-pink">{error}</p> : null}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/components/dashboard/PaymentsClient.test.tsx`
Expected: PASS.

- [ ] **Step 5: Implement the server page**

```tsx
// src/app/dashboard/profile/payments/page.tsx
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { getActiveVendorProfileId } from '@/lib/vendor/active';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getConnectStatus, refreshAccountStatus } from '@/services/connect.service';
import { PaymentsClient } from './PaymentsClient';

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ return?: string }>;
}) {
  const { user, supabase } = await requireUser();
  const vendorProfileId = await getActiveVendorProfileId(supabase, user.id);
  if (!vendorProfileId) redirect('/dashboard');

  const sp = await searchParams;

  // On return from Stripe, pull the freshest status before rendering (the
  // webhook may not have landed yet).
  if (sp.return === '1') {
    const service = createServiceRoleClient();
    const { data: row } = await service
      .from('vendor_stripe_accounts')
      .select('stripe_account_id')
      .eq('vendor_profile_id', vendorProfileId)
      .maybeSingle();
    if (row) await refreshAccountStatus(service, row.stripe_account_id);
  }

  const status = await getConnectStatus(supabase, vendorProfileId);
  return <PaymentsClient status={status.data!} />;
}
```

> The `?refresh=1` case needs no server branch: the page renders the not-ready state whose button re-POSTs `/api/connect/onboard` for a fresh link (Review Focus: expired link).

- [ ] **Step 6: Typecheck + commit**

Run: `npm run typecheck`
Expected: PASS.

```bash
git add src/app/dashboard/profile/payments src/__tests__/components/dashboard/PaymentsClient.test.tsx
git commit -m "feat(shop): /dashboard/profile/payments status page + onboarding CTA"
```

---

### Task 6: SidebarNav "Payouts" link

**Files:**

- Modify: `src/components/dashboard/SidebarNav.tsx`
- Modify: `src/app/dashboard/layout.tsx:81`
- Modify: `src/__tests__/components/dashboard/SidebarNav.test.tsx`

**Interfaces:**

- Consumes: `SHOP_ENABLED` (`@/lib/flags`).
- Produces: `SidebarNav` accepts `isLocalBridalVendor?: boolean`; renders a "Payouts" link (`/dashboard/profile/payments`, `CreditCard` icon) for vendors when `isLocalBridalVendor && SHOP_ENABLED`.

- [ ] **Step 1: Write the failing test**

Add to `src/__tests__/components/dashboard/SidebarNav.test.tsx` (mock the flag so the test is deterministic):

```tsx
vi.mock('@/lib/flags', () => ({ SHOP_ENABLED: true }));

it('shows Payouts for a local bridal vendor when the shop flag is on', () => {
  render(
    <SidebarNav
      role="vendor"
      hasBusiness
      businessAnchor={null}
      userMenu={null}
      bookingsCount={0}
      hasUnreadNotifications={false}
      isBridalWear
      isLocalBridalVendor
    />
  );
  expect(screen.getByRole('link', { name: /payouts/i })).toBeInTheDocument();
});

it('hides Payouts for a non-bridal vendor', () => {
  render(
    <SidebarNav
      role="vendor"
      hasBusiness
      businessAnchor={null}
      userMenu={null}
      bookingsCount={0}
      hasUnreadNotifications={false}
    />
  );
  expect(screen.queryByRole('link', { name: /payouts/i })).not.toBeInTheDocument();
});
```

(Match the test file's existing render harness/providers; if it wraps `SidebarProvider`, wrap these the same way.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/components/dashboard/SidebarNav.test.tsx`
Expected: FAIL (no Payouts link / unknown prop).

- [ ] **Step 3: Implement**

In `SidebarNav.tsx`: import `CreditCard` from `lucide-react`; add `isLocalBridalVendor?: boolean` to `Props` (default `false`) and thread it into `workspaceLinks`. In `workspaceLinks(role, isBridalWear, isLocalBridalVendor)`, inside the `role === 'vendor'` block, after the Shop link insert:

```typescript
if (isLocalBridalVendor && SHOP_ENABLED) {
  links.splice(links.length - 1, 0, {
    href: '/dashboard/profile/payments',
    label: 'Payouts',
    icon: CreditCard,
  });
}
```

Update the `workspaceLinks` signature + its call site in the component body to pass `isLocalBridalVendor`.

In `src/app/dashboard/layout.tsx:81`, add the prop next to `isBridalWear`:

```tsx
            isBridalWear={activeProfile?.category === 'bridal_wear'}
            isLocalBridalVendor={
              activeProfile?.category === 'bridal_wear' && activeProfile?.vendor_origin === 'local'
            }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/components/dashboard/SidebarNav.test.tsx`
Expected: PASS (both new cases + existing cases).

- [ ] **Step 5: Typecheck + commit**

Run: `npm run typecheck`
Expected: PASS.

```bash
git add src/components/dashboard/SidebarNav.tsx src/app/dashboard/layout.tsx src/__tests__/components/dashboard/SidebarNav.test.tsx
git commit -m "feat(shop): Payouts nav entry for local bridal vendors (flag-gated)"
```

---

### Task 7: Shop-editor "set up payouts" banner

**Files:**

- Modify: `src/app/dashboard/profile/shop/page.tsx`
- Test: covered by the e2e in Task 8 (server component with data fetching; no isolated unit test).

**Interfaces:**

- Consumes: `getConnectStatus` (Task 2), the existing vendor-profile + products load already in this page.

- [ ] **Step 1: Add the banner**

In `src/app/dashboard/profile/shop/page.tsx`, after the vendor profile id is resolved and products are loaded, fetch connect status and render a dismissible-styled notice (not a hard block) when the vendor has at least one product but isn't charge-ready:

```tsx
import { getConnectStatus } from '@/services/connect.service';
// ...inside the component, after products are loaded:
const connect = await getConnectStatus(supabase, vendorProfileId);
const showPayoutNudge = products.length > 0 && !connect.data!.charges_enabled;
// ...in JSX, above the product list:
{
  showPayoutNudge ? (
    <div className="mb-4 rounded-lg border border-haldi/45 bg-haldi/15 px-4 py-3 text-sm text-ink">
      Set up payouts so customers can buy your pieces.{' '}
      <a href="/dashboard/profile/payments" className="font-semibold underline">
        Set up payouts
      </a>
    </div>
  ) : null;
}
```

Match the page's actual variable names for the resolved `vendorProfileId`, `supabase`, and the products array (read the file first).

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/profile/shop/page.tsx
git commit -m "feat(shop): soft payout-setup nudge in the shop editor"
```

---

### Task 8: E2E flow + seed helpers

**Files:**

- Modify: `tests/e2e/helpers/seed.ts`
- Create: `tests/e2e/shop-connect-onboarding.spec.ts`

**Interfaces:**

- Consumes: the `seedVendor` helper (extend to set `vendor_origin` and optionally insert a `vendor_stripe_accounts` row).

- [ ] **Step 1: Extend the seed helper**

Read `tests/e2e/helpers/seed.ts`. Add an optional `vendorOrigin` param to `seedVendor` (default `'local'`) that sets `vendor_origin` on the inserted `vendor_profiles` row, and add a helper:

```typescript
export async function seedStripeAccount(
  admin: SupabaseClient,
  vendorProfileId: string,
  flags: { charges_enabled?: boolean; payouts_enabled?: boolean; details_submitted?: boolean } = {}
) {
  await admin.from('vendor_stripe_accounts').insert({
    vendor_profile_id: vendorProfileId,
    stripe_account_id: `acct_test_${vendorProfileId.slice(0, 8)}`,
    charges_enabled: flags.charges_enabled ?? false,
    payouts_enabled: flags.payouts_enabled ?? false,
    details_submitted: flags.details_submitted ?? false,
  });
}
```

(Match the file's actual `SupabaseClient` import + `seedVendor` signature.)

- [ ] **Step 2: Write the e2e spec**

```typescript
// tests/e2e/shop-connect-onboarding.spec.ts
import { test, expect } from '@playwright/test';
import { seedVendor, seedStripeAccount, loginAs } from './helpers/seed';
// ^ use whatever login/seed helpers the other shop specs use (e.g. vendor-shop-editor.spec.ts).

test.describe('Shop Connect onboarding', () => {
  test('ready local bridal vendor sees the "set up to get paid" state', async ({ page }) => {
    const vendor = await seedVendor({ category: 'bridal_wear', vendorOrigin: 'local' });
    await seedStripeAccount(vendor.admin, vendor.profileId, {
      charges_enabled: true,
      payouts_enabled: true,
      details_submitted: true,
    });
    await loginAs(page, vendor);
    await page.goto('/dashboard/profile/payments');
    await expect(page.getByText(/set up to get paid/i)).toBeVisible();
  });

  test('un-connected local bridal vendor sees the setup CTA', async ({ page }) => {
    const vendor = await seedVendor({ category: 'bridal_wear', vendorOrigin: 'local' });
    await loginAs(page, vendor);
    await page.goto('/dashboard/profile/payments');
    await expect(page.getByRole('button', { name: /set up payouts/i })).toBeVisible();
  });
});
```

Adapt `seedVendor`/`loginAs` call shapes to match the existing shop specs (read `tests/e2e/vendor-shop-editor.spec.ts`). Do **not** drive the real Stripe-hosted onboarding — the "ready" state is proven by seeding a charge-enabled row.

- [ ] **Step 3: Run the e2e spec**

Run (needs the :3001 dev server + `.env.local` + mig 00086 applied to dev):
`PLAYWRIGHT_SKIP_WEB_SERVER=1 PLAYWRIGHT_BASE_URL=http://localhost:3001 npx playwright test tests/e2e/shop-connect-onboarding.spec.ts`
Expected: 2 passed. Run `npm run ai:eval-cleanup` first if the eval seed may be present (per the e2e lesson in memory).

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/helpers/seed.ts tests/e2e/shop-connect-onboarding.spec.ts
git commit -m "test(shop): e2e for connect onboarding status states"
```

---

### Task 9: Full-suite verification

- [ ] **Step 1: Lint + typecheck**

Run: `npm run lint && npm run typecheck`
Expected: PASS, 0 errors.

- [ ] **Step 2: Unit suite**

Run: `npx vitest run`
Expected: all green (new connect + webhook + nav + PaymentsClient tests included).

- [ ] **Step 3: Confirm the env prerequisites are documented for deploy**

Verify `.env.example` mentions `STRIPE_CONNECT_WEBHOOK_SECRET` (add it if missing, with a comment that Connect must be enabled on the platform account). Commit if changed:

```bash
git add .env.example
git commit -m "docs(shop): note STRIPE_CONNECT_WEBHOOK_SECRET for Connect onboarding"
```

- [ ] **Step 4: Push + open PR**

```bash
git push -u origin feat/shop-connect-onboarding
gh pr create --title "feat(shop): Stripe Connect onboarding for local bridal vendors (SP1)" --body "<summary + link to the spec/plan>"
```

Do not merge until full CI is green (including the prod-build e2e job), per the merge rule. The user applies mig 00086 to **prod** before deploy, and enables Connect + sets `STRIPE_CONNECT_WEBHOOK_SECRET` in prod.
