import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';

const sendShopEmail = vi.fn().mockResolvedValue(true);
const notifyShopOrder = vi.fn().mockResolvedValue({ id: 'n1' });

vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock('@/lib/email/resend', () => ({
  escapeHtml: (s: string | null | undefined) => s ?? '',
  sendShopEmail: (...a: unknown[]) => sendShopEmail(...a),
  SHOP_OPS_EMAIL: 'sardar@baazar.io',
}));
vi.mock('@/services/notifications.service', () => ({
  notifyShopOrder: (...a: unknown[]) => notifyShopOrder(...a),
}));

import { notifyShopOrderPlaced } from '@/services/shop-notifications.service';

const ROWS: Record<string, unknown> = {
  orders: {
    id: 'order-123',
    buyer_user_id: 'buyer-1',
    vendor_profile_id: 'vp-1',
    total_cents: 12000,
    status: 'pending_confirmation',
    cancel_reason: null,
  },
  vendor_profiles: { business_name: 'Lehenga Co', user_id: 'vendor-user-1' },
  items: [{ product_name_snapshot: 'Red lehenga', variant_label_snapshot: 'M', quantity: 1 }],
};

function mockDb(): SupabaseClient<Database> {
  let usersCall = 0;
  const from = (table: string) => {
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = () => (table === 'order_items' ? Promise.resolve({ data: ROWS.items }) : chain);
    chain.maybeSingle = () => {
      if (table === 'users') {
        usersCall++;
        return Promise.resolve({
          data:
            usersCall === 1
              ? { email: 'vendor@x.com', phone: '+13125550199' }
              : { email: 'buyer@x.com' },
        });
      }
      return Promise.resolve({ data: ROWS[table] });
    };
    return chain;
  };
  return { from } as unknown as SupabaseClient<Database>;
}

describe('notifyShopOrderPlaced', () => {
  beforeEach(() => {
    sendShopEmail.mockClear();
    notifyShopOrder.mockClear();
  });

  it('notifies the vendor and emails ops with vendor phone + order id', async () => {
    await notifyShopOrderPlaced(mockDb(), 'order-123');

    expect(notifyShopOrder).toHaveBeenCalledWith(
      expect.anything(),
      'vendor-user-1',
      'shop_order_placed',
      expect.objectContaining({ orderId: 'order-123' })
    );
    const ops = sendShopEmail.mock.calls
      .map((c) => c[0] as { to: string; html: string })
      .find((m) => m.to === 'sardar@baazar.io');
    expect(ops).toBeDefined();
    expect(ops?.html).toContain('+13125550199');
    expect(ops?.html).toContain('order-123');
    expect(ops?.html).toContain('Lehenga Co');
  });

  it('never throws when a dependency fails', async () => {
    notifyShopOrder.mockRejectedValueOnce(new Error('boom'));
    await expect(notifyShopOrderPlaced(mockDb(), 'order-123')).resolves.toBeUndefined();
  });
});
