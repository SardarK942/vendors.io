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
