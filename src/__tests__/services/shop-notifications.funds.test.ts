import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';

const sendShopEmail = vi.fn().mockResolvedValue(true);
const notifyShopOrder = vi.fn().mockResolvedValue({ id: 'n1' });

vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock('@/lib/email/resend', () => ({
  escapeHtml: (s: string | null | undefined) => s ?? '',
  sendShopEmail: (...a: unknown[]) => sendShopEmail(...a),
  SHOP_OPS_EMAIL: 'ops@baazar.io',
}));
vi.mock('@/services/notifications.service', () => ({
  notifyShopOrder: (...a: unknown[]) => notifyShopOrder(...a),
}));

import { notifyFundsTransferred } from '@/services/shop-notifications.service';

function mockDb(): SupabaseClient<Database> {
  const from = (table: string) => {
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.maybeSingle = () =>
      Promise.resolve({
        data: table === 'vendor_profiles' ? { user_id: 'vendor-user-1' } : { email: 'v@x.com' },
      });
    return chain;
  };
  return { from } as unknown as SupabaseClient<Database>;
}

describe('notifyFundsTransferred', () => {
  beforeEach(() => {
    sendShopEmail.mockClear();
    notifyShopOrder.mockClear();
  });

  it('creates a shop_funds_transferred bell for the vendor user and emails them', async () => {
    await notifyFundsTransferred(mockDb(), 'vp-1', 12345);
    expect(notifyShopOrder).toHaveBeenCalledWith(
      expect.anything(),
      'vendor-user-1',
      'shop_funds_transferred',
      expect.objectContaining({ body: expect.stringContaining('$123.45') })
    );
    expect(sendShopEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'v@x.com' }));
  });

  it('swallows a thrown email error', async () => {
    sendShopEmail.mockRejectedValueOnce(new Error('resend down'));
    await expect(notifyFundsTransferred(mockDb(), 'vp-1', 500)).resolves.toBeUndefined();
  });
});
