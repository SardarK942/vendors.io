import { describe, test, expect, vi, beforeEach } from 'vitest';

const createSubmission = vi.fn();
const sendEmail = vi.fn();
vi.mock('@/lib/docuseal/client', () => ({ createSubmission: (i: unknown) => createSubmission(i) }));
vi.mock('@/lib/email/resend', () => ({
  sendContractSigningRequestEmail: (...a: unknown[]) => sendEmail(...a),
}));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

import { createForBooking } from '@/services/docuseal.service';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';

type Row = Record<string, unknown>;

function makeDb(opts: { booking?: Row | null; events?: Row[]; contracts?: Row[] }) {
  const contracts: Row[] = opts.contracts ?? [];
  const updates: Row[] = [];
  let inserts = 0;
  const from = (table: string) => {
    let filterCol: string | null = null;
    let filterVal: unknown;
    let mode: 'select' | 'insert' | 'update' = 'select';
    let payload: Row = {};
    const chain: Record<string, unknown> = {};
    const resolve = (): { data: unknown; error: unknown } => {
      if (table === 'bookings')
        return { data: opts.booking ?? null, error: opts.booking ? null : {} };
      if (table === 'booking_events') return { data: opts.events ?? [], error: null };
      if (mode === 'insert') {
        inserts++;
        const row = {
          id: 'c1',
          status: 'pending',
          attempt_count: 0,
          docuseal_submission_id: null,
          ...payload,
        };
        contracts.push(row);
        return { data: row, error: null };
      }
      if (mode === 'update') {
        updates.push(payload);
        const row = contracts.find((c) => c[filterCol as string] === filterVal);
        if (row) Object.assign(row, payload);
        return { data: null, error: null };
      }
      return {
        data: contracts.find((c) => c[filterCol as string] === filterVal) ?? null,
        error: null,
      };
    };
    chain.select = () => chain;
    chain.insert = (p: Row) => ((mode = 'insert'), (payload = p), chain);
    chain.update = (p: Row) => ((mode = 'update'), (payload = p), chain);
    chain.eq = (c: string, v: unknown) => ((filterCol = c), (filterVal = v), chain);
    chain.single = () => Promise.resolve(resolve());
    chain.maybeSingle = () => Promise.resolve(resolve());
    chain.then = (f: (v: unknown) => unknown) => Promise.resolve(resolve()).then(f);
    return chain;
  };
  return {
    client: { from } as unknown as SupabaseClient<Database>,
    contracts,
    updates,
    inserts: () => inserts,
  };
}

const booking = (over: Row = {}, vendorOver: Row = {}): Row => ({
  id: 'b1',
  total_price_cents: 250000,
  couple_full_name: 'Asha Patel',
  couple_email: 'asha@x.com',
  users: null,
  vendor_profiles: {
    id: 'v1',
    business_name: 'Royal Decor',
    docuseal_template_id: 'tpl-1',
    users: { email: 'vendor@x.com' },
    ...vendorOver,
  },
  ...over,
});
const events = [
  { event_type_label: 'mehndi', event_date: '2026-12-02' },
  { event_type_label: 'wedding', event_date: '2026-12-05' },
];

beforeEach(() => {
  vi.clearAllMocks();
  process.env.DOCUSEAL_API_URL = 'https://sign.example.com';
  delete process.env.DOCUSEAL_DEFAULT_TEMPLATE_ID;
  createSubmission.mockResolvedValue({
    submissionId: 'sub1',
    submitters: [
      { role: 'Vendor', slug: 'vslug' },
      { role: 'Couple', slug: 'cslug' },
    ],
  });
  sendEmail.mockResolvedValue(true);
});

describe('createForBooking', () => {
  test('creates one contract, emails vendor, status sent_vendor, Vendor first', async () => {
    const db = makeDb({ booking: booking(), events });
    const r = await createForBooking(db.client, 'b1');
    expect(r.data?.status).toBe('sent_vendor');
    expect(db.inserts()).toBe(1);
    const input = createSubmission.mock.calls[0][0];
    expect(input.order).toBe('preserved');
    expect(input.sendEmail).toBe(false);
    expect(input.submitters[0].role).toBe('Vendor');
    expect(input.submitters[1].role).toBe('Couple');
    expect(sendEmail).toHaveBeenCalledWith(
      'vendor@x.com',
      'vendor',
      'https://sign.example.com/s/vslug',
      expect.any(Object)
    );
    expect(db.contracts[0]).toMatchObject({
      docuseal_submission_id: 'sub1',
      vendor_slug: 'vslug',
      couple_slug: 'cslug',
      template_id_used: 'tpl-1',
    });
  });

  test('duplicate call does not create a second row or call DocuSeal again', async () => {
    const db = makeDb({ booking: booking(), events });
    await createForBooking(db.client, 'b1');
    const r2 = await createForBooking(db.client, 'b1');
    expect(r2.data?.status).toBe('sent_vendor');
    expect(db.contracts).toHaveLength(1);
    expect(createSubmission).toHaveBeenCalledTimes(1);
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  test('missing template and no default -> failed, error_permanent, no throw', async () => {
    const db = makeDb({ booking: booking({}, { docuseal_template_id: null }), events });
    const r = await createForBooking(db.client, 'b1');
    expect(r.error).toBeDefined();
    expect(db.contracts[0]).toMatchObject({ status: 'failed', error_permanent: true });
    expect(createSubmission).not.toHaveBeenCalled();
  });

  test('uses DOCUSEAL_DEFAULT_TEMPLATE_ID when vendor has none', async () => {
    process.env.DOCUSEAL_DEFAULT_TEMPLATE_ID = 'default-tpl';
    const db = makeDb({ booking: booking({}, { docuseal_template_id: null }), events });
    await createForBooking(db.client, 'b1');
    expect(createSubmission.mock.calls[0][0].templateId).toBe('default-tpl');
  });

  test('missing agreed price -> failed, no throw', async () => {
    const db = makeDb({ booking: booking({ total_price_cents: 0 }), events });
    const r = await createForBooking(db.client, 'b1');
    expect(r.error).toBeDefined();
    expect(db.contracts[0]).toMatchObject({ status: 'failed', error_permanent: true });
    expect(createSubmission).not.toHaveBeenCalled();
  });

  test('DocuSeal unreachable -> failed with next_retry_at, returns error, no throw; retry succeeds', async () => {
    createSubmission.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const db = makeDb({ booking: booking(), events });
    const r = await createForBooking(db.client, 'b1');
    expect(r.error).toBeDefined();
    expect(db.contracts[0]).toMatchObject({
      status: 'failed',
      error_permanent: false,
      attempt_count: 1,
    });
    expect(db.contracts[0].next_retry_at).toBeTruthy();
    const r2 = await createForBooking(db.client, 'b1');
    expect(r2.data?.status).toBe('sent_vendor');
    expect(db.contracts).toHaveLength(1);
  });

  test('builds read-only agreed_price and multi-line event_schedule fields', async () => {
    const db = makeDb({ booking: booking(), events });
    await createForBooking(db.client, 'b1');
    const fields = createSubmission.mock.calls[0][0].submitters[0].fields as Array<{
      name: string;
      defaultValue: string;
      readonly?: boolean;
    }>;
    const price = fields.find((f) => f.name === 'agreed_price');
    const sched = fields.find((f) => f.name === 'event_schedule');
    expect(price).toMatchObject({ defaultValue: '$2,500.00', readonly: true });
    expect(sched?.readonly).toBe(true);
    expect(sched?.defaultValue.split('\n')).toHaveLength(2);
  });
});
