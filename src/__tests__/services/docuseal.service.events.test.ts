import { describe, test, expect, vi, beforeEach } from 'vitest';

const getSubmission = vi.fn();
const archiveSubmission = vi.fn();
const downloadArtifact = vi.fn();
const storeContractArtifact = vi.fn();
const sendSigning = vi.fn();
const sendSigned = vi.fn();
vi.mock('@/lib/docuseal/client', () => ({
  createSubmission: vi.fn(),
  getSubmission: (...a: unknown[]) => getSubmission(...a),
  archiveSubmission: (...a: unknown[]) => archiveSubmission(...a),
  downloadArtifact: (...a: unknown[]) => downloadArtifact(...a),
}));
vi.mock('@/lib/storage/contracts-store', () => ({
  storeContractArtifact: (...a: unknown[]) => storeContractArtifact(...a),
}));
vi.mock('@/lib/email/resend', () => ({
  sendContractSigningRequestEmail: (...a: unknown[]) => sendSigning(...a),
  sendContractSignedCopyEmail: (...a: unknown[]) => sendSigned(...a),
}));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

import { applyWebhookEvent, voidForBooking, statusRank } from '@/services/docuseal.service';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';

type Row = Record<string, unknown>;

function makeDb(contract: Row) {
  const contracts: Row[] = [contract];
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
    const resolve = (): { data: unknown; error: null } => {
      if (table === 'bookings')
        return {
          data: {
            id: 'b1',
            couple_email: 'couple@x.com',
            users: null,
            vendor_profiles: { business_name: 'Acme', users: { email: 'v@x.com' } },
          },
          error: null,
        };
      if (table === 'booking_events') return { data: [], error: null };
      if (patch) {
        const rows = matches();
        rows.forEach((r) => Object.assign(r, patch));
        return { data: rows.map((r) => ({ id: r.id })), error: null };
      }
      return { data: matches()[0] ?? null, error: null };
    };
    chain.select = () => chain;
    chain.update = (p: Row) => ((patch = p), chain);
    chain.eq = (c: string, v: unknown) => (filters.push([c, v]), chain);
    chain.in = (c: string, v: unknown[]) => ((inCol = c), (inVals = v), chain);
    chain.single = () => Promise.resolve(resolve());
    chain.maybeSingle = () => Promise.resolve(resolve());
    chain.then = (f: (v: unknown) => unknown) => Promise.resolve(resolve()).then(f);
    return chain;
  };
  return { client: { from } as unknown as SupabaseClient<Database>, row: contract };
}

const base = (over: Row = {}): Row => ({
  id: 'c1',
  booking_id: 'b1',
  docuseal_submission_id: 's1',
  status: 'sent_vendor',
  couple_slug: 'cslug',
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  process.env.DOCUSEAL_API_URL = 'https://sign.example.com';
  sendSigning.mockResolvedValue(true);
  sendSigned.mockResolvedValue(true);
  getSubmission.mockResolvedValue({
    status: 'completed',
    documents: [{ name: 'c.pdf', url: 'https://d/c.pdf' }],
    auditLogUrl: 'https://d/audit.pdf',
  });
  downloadArtifact.mockResolvedValue(Buffer.from('pdf'));
  storeContractArtifact.mockImplementation(async (a: { kind: string }) => `k/${a.kind}`);
});

describe('docuseal events', () => {
  test('vendor form.completed advances to sent_couple and emails couple', async () => {
    const db = makeDb(base());
    const r = await applyWebhookEvent(db.client, {
      type: 'form.completed',
      submissionId: 's1',
      role: 'Vendor',
    });
    expect(r.data?.status).toBe('sent_couple');
    expect(db.row.status).toBe('sent_couple');
    expect(db.row.vendor_signed_at).toBeTruthy();
    expect(sendSigning).toHaveBeenCalledWith(
      'couple@x.com',
      'couple',
      'https://sign.example.com/s/cslug',
      expect.objectContaining({ vendorName: 'Acme' })
    );
  });

  test('submission.completed stores pdf+certificate, emails both, status completed', async () => {
    const db = makeDb(base({ status: 'sent_couple' }));
    const r = await applyWebhookEvent(db.client, {
      type: 'submission.completed',
      submissionId: 's1',
    });
    expect(r.data?.status).toBe('completed');
    expect(storeContractArtifact).toHaveBeenCalledTimes(2);
    expect(db.row.signed_pdf_key).toBe('k/signed');
    expect(db.row.certificate_key).toBe('k/certificate');
    expect(db.row.completed_at).toBeTruthy();
    expect(sendSigned).toHaveBeenCalledTimes(2);
  });

  test('storage failure on submission.completed returns error (retry)', async () => {
    const db = makeDb(base({ status: 'sent_couple' }));
    storeContractArtifact.mockRejectedValueOnce(new Error('boom'));
    const r = await applyWebhookEvent(db.client, {
      type: 'submission.completed',
      submissionId: 's1',
    });
    expect(r.error).toBeTruthy();
    expect(r.status).toBe(500);
    expect(db.row.status).toBe('sent_couple');
  });

  test('duplicate submission.completed is a no-op (idempotent)', async () => {
    const db = makeDb(base({ status: 'completed' }));
    const r = await applyWebhookEvent(db.client, {
      type: 'submission.completed',
      submissionId: 's1',
    });
    expect(r.data?.status).toBe('completed');
    expect(getSubmission).not.toHaveBeenCalled();
    expect(sendSigned).not.toHaveBeenCalled();
  });

  test('form.completed arriving out of order does not regress status', async () => {
    const db = makeDb(base({ status: 'completed' }));
    const r = await applyWebhookEvent(db.client, {
      type: 'form.completed',
      submissionId: 's1',
      role: 'Vendor',
    });
    expect(r.data?.status).toBe('completed');
    expect(db.row.status).toBe('completed');
    expect(sendSigning).not.toHaveBeenCalled();
  });

  test('submission.completed after void stays voided (terminal wins)', async () => {
    const db = makeDb(base({ status: 'voided' }));
    const r = await applyWebhookEvent(db.client, {
      type: 'submission.completed',
      submissionId: 's1',
    });
    expect(r.data?.status).toBe('voided');
    expect(db.row.status).toBe('voided');
    expect(storeContractArtifact).not.toHaveBeenCalled();
  });

  test('form.declined sets declined', async () => {
    const db = makeDb(base({ status: 'sent_couple' }));
    const r = await applyWebhookEvent(db.client, { type: 'form.declined', submissionId: 's1' });
    expect(r.data?.status).toBe('declined');
    expect(db.row.declined_at).toBeTruthy();
  });

  test('voidForBooking archives submission and sets voided; no-op if already completed', async () => {
    const db = makeDb(base());
    await voidForBooking(db.client, 'b1');
    expect(archiveSubmission).toHaveBeenCalledWith('s1');
    expect(db.row.status).toBe('voided');
    expect(db.row.voided_at).toBeTruthy();

    archiveSubmission.mockClear();
    const done = makeDb(base({ status: 'completed' }));
    const r = await voidForBooking(done.client, 'b1');
    expect(r.status).toBe(200);
    expect(archiveSubmission).not.toHaveBeenCalled();
    expect(done.row.status).toBe('completed');
  });

  test('statusRank orders forward states; terminals are -1', () => {
    expect(statusRank('pending')).toBeLessThan(statusRank('sent_vendor'));
    expect(statusRank('sent_couple')).toBeLessThan(statusRank('completed'));
    expect(statusRank('voided')).toBe(-1);
  });
});
