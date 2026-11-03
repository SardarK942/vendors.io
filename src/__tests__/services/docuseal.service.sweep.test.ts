import { describe, test, expect, vi, beforeEach } from 'vitest';

const createSubmission = vi.fn();
const archiveSubmission = vi.fn();
const sendReminder = vi.fn();
vi.mock('@/lib/docuseal/client', () => ({
  createSubmission: (...a: unknown[]) => createSubmission(...a),
  getSubmission: vi.fn(),
  archiveSubmission: (...a: unknown[]) => archiveSubmission(...a),
  downloadArtifact: vi.fn(),
}));
vi.mock('@/lib/storage/contracts-store', () => ({ storeContractArtifact: vi.fn() }));
vi.mock('@/lib/email/resend', () => ({
  sendContractSigningRequestEmail: vi.fn().mockResolvedValue(true),
  sendContractSignedCopyEmail: vi.fn(),
  sendContractReminderEmail: (...a: unknown[]) => sendReminder(...a),
}));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

import { runSweep } from '@/services/docuseal.service';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';

type Row = Record<string, unknown>;

function makeDb(contracts: Row[]) {
  const from = (table: string) => {
    const filters: Array<[string, unknown]> = [];
    let inCol: string | null = null;
    let inVals: unknown[] = [];
    let patch: Row | null = null;
    const chain: Record<string, unknown> = {};
    const matches = () =>
      contracts.filter(
        (c) =>
          filters.every(([k, v]) => c[k] === v) && (!inCol || inVals.includes(c[inCol as string]))
      );
    const resolve = (single: boolean): { data: unknown; error: null } => {
      if (table === 'bookings')
        return {
          data: {
            id: 'b',
            total_price_cents: 100000,
            couple_full_name: 'Cara',
            couple_email: 'couple@x.com',
            users: null,
            vendor_profiles: {
              id: 'vp',
              business_name: 'Acme',
              docuseal_template_id: 't1',
              users: { email: 'v@x.com' },
            },
          },
          error: null,
        };
      if (table === 'booking_events') return { data: [], error: null };
      if (patch) {
        const rows = matches();
        rows.forEach((r) => Object.assign(r, patch));
        return { data: rows.map((r) => ({ id: r.id })), error: null };
      }
      const rows = matches();
      return { data: single ? (rows[0] ?? null) : rows, error: null };
    };
    chain.select = () => chain;
    chain.update = (p: Row) => ((patch = p), chain);
    chain.eq = (c: string, v: unknown) => (filters.push([c, v]), chain);
    chain.in = (c: string, v: unknown[]) => ((inCol = c), (inVals = v), chain);
    chain.single = () => Promise.resolve(resolve(true));
    chain.maybeSingle = () => Promise.resolve(resolve(true));
    chain.then = (f: (v: unknown) => unknown) => Promise.resolve(resolve(false)).then(f);
    return chain;
  };
  return { from } as unknown as SupabaseClient<Database>;
}

const DAY = 86_400_000;
const ago = (d: number) => new Date(Date.now() - d * DAY).toISOString();
const row = (over: Row): Row => ({
  booking_id: 'b',
  docuseal_submission_id: 'sub',
  vendor_slug: 'vs',
  couple_slug: 'cs',
  last_reminder_at: null,
  expires_at: null,
  error_permanent: false,
  attempt_count: 1,
  next_retry_at: null,
  ...over,
});

function fixtures(): Row[] {
  return [
    row({ id: 'rem-v', status: 'sent_vendor', created_at: ago(8), expires_at: ago(-5) }),
    row({ id: 'rem-c', status: 'sent_couple', created_at: ago(8), expires_at: ago(-5) }),
    row({ id: 'exp', status: 'sent_vendor', created_at: ago(20), docuseal_submission_id: 'subx' }),
    row({
      id: 'retry',
      booking_id: 'bR',
      status: 'failed',
      created_at: ago(1),
      docuseal_submission_id: null,
      next_retry_at: ago(1),
    }),
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.DOCUSEAL_API_URL = 'https://sign.example.com';
  sendReminder.mockResolvedValue(true);
  archiveSubmission.mockResolvedValue(undefined);
  createSubmission.mockResolvedValue({
    submissionId: 'new',
    submitters: [
      { role: 'Vendor', slug: 'nv' },
      { role: 'Couple', slug: 'nc' },
    ],
  });
});

describe('runSweep', () => {
  test('sends reminders, expires overdue, retries transient failed, returns counts', async () => {
    const rows = fixtures();
    const res = await runSweep(makeDb(rows));
    expect(res.data).toEqual({ reminded: 2, expired: 1, retried: 1 });
    expect(sendReminder).toHaveBeenCalledWith(
      'v@x.com',
      'vendor',
      'https://sign.example.com/s/vs',
      { vendorName: 'Acme' }
    );
    expect(sendReminder).toHaveBeenCalledWith(
      'couple@x.com',
      'couple',
      'https://sign.example.com/s/cs',
      { vendorName: 'Acme' }
    );
    expect(rows.find((r) => r.id === 'rem-v')?.last_reminder_at).toBeTruthy();
    expect(archiveSubmission).toHaveBeenCalledWith('subx');
    expect(rows.find((r) => r.id === 'exp')?.status).toBe('expired');
    expect(createSubmission).toHaveBeenCalledTimes(1);
    expect(rows.find((r) => r.id === 'retry')?.status).toBe('sent_vendor');
  });

  test('a failing reminder send does not prevent expiries/retries', async () => {
    sendReminder.mockRejectedValue(new Error('smtp down'));
    const rows = fixtures();
    const res = await runSweep(makeDb(rows));
    expect(res.data).toEqual({ reminded: 0, expired: 1, retried: 1 });
    expect(rows.find((r) => r.id === 'rem-v')?.last_reminder_at).toBe(null);
    expect(rows.find((r) => r.id === 'exp')?.status).toBe('expired');
  });

  test('a failing archive does not expire that row nor abort the batch', async () => {
    archiveSubmission.mockRejectedValue(new Error('boom'));
    const rows = fixtures();
    const res = await runSweep(makeDb(rows));
    expect(res.data).toEqual({ reminded: 2, expired: 0, retried: 1 });
    expect(rows.find((r) => r.id === 'exp')?.status).toBe('sent_vendor');
  });
});
