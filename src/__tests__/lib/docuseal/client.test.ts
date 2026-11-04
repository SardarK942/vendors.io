import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  archiveSubmission,
  createSubmission,
  docusealConfig,
  getSubmission,
  getTemplateFieldRoles,
} from '@/lib/docuseal/client';

const input = {
  templateId: '42',
  order: 'preserved' as const,
  sendEmail: false as const,
  expireAt: '2027-01-01T00:00:00.000Z',
  submitters: [
    {
      role: 'Vendor' as const,
      name: 'V',
      email: 'v@x.com',
      externalId: 'b1:vendor',
      order: 0,
      fields: [{ name: 'Price', defaultValue: '$100', readonly: true }],
    },
    {
      role: 'Couple' as const,
      name: 'C',
      email: 'c@x.com',
      externalId: 'b1:couple',
      order: 1,
      fields: [],
    },
  ],
};

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

describe('docuseal client', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    // DOCUSEAL_API_URL is the host root; the client prepends `/api`.
    process.env.DOCUSEAL_API_URL = 'https://sign.example.com';
    process.env.DOCUSEAL_API_TOKEN = 'tok';
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.DOCUSEAL_API_URL;
    delete process.env.DOCUSEAL_API_TOKEN;
  });

  it('createSubmission posts template + submitters and returns submissionId + slugs', async () => {
    fetchMock.mockResolvedValue(
      jsonRes([
        { id: 11, submission_id: 7, slug: 'sv', role: 'Vendor' },
        { id: 12, submission_id: 7, slug: 'sc', role: 'Couple' },
      ])
    );
    const out = await createSubmission(input);
    expect(out).toEqual({
      submissionId: '7',
      submitters: [
        { role: 'Vendor', slug: 'sv' },
        { role: 'Couple', slug: 'sc' },
      ],
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://sign.example.com/api/submissions');
    expect(init.method).toBe('POST');
    expect(init.headers['X-Auth-Token']).toBe('tok');
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({
      template_id: 42,
      send_email: false,
      order: 'preserved',
      expire_at: input.expireAt,
    });
    expect(body.submitters[0]).toMatchObject({
      role: 'Vendor',
      email: 'v@x.com',
      external_id: 'b1:vendor',
      fields: [{ name: 'Price', default_value: '$100', readonly: true }],
    });
  });

  it('createSubmission throws on non-2xx', async () => {
    fetchMock.mockResolvedValue(new Response('bad template', { status: 422 }));
    await expect(createSubmission(input)).rejects.toThrow(/422.*bad template/);
  });

  it('docusealConfig throws when env missing', () => {
    delete process.env.DOCUSEAL_API_TOKEN;
    expect(() => docusealConfig()).toThrow(/DocuSeal/);
  });

  it('getSubmission maps status, documents and audit log url', async () => {
    fetchMock.mockResolvedValue(
      jsonRes({
        id: 7,
        status: 'completed',
        audit_log_url: 'https://a/log.pdf',
        documents: [{ name: 'contract', url: 'https://a/c.pdf' }],
      })
    );
    const out = await getSubmission('7');
    expect(out).toEqual({
      status: 'completed',
      documents: [{ name: 'contract', url: 'https://a/c.pdf' }],
      auditLogUrl: 'https://a/log.pdf',
    });
    expect(fetchMock.mock.calls[0][0]).toBe('https://sign.example.com/api/submissions/7');
  });

  it('archiveSubmission calls the archive endpoint for the id', async () => {
    fetchMock.mockResolvedValue(jsonRes({ id: 7, archived_at: 'now' }));
    await archiveSubmission('7');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://sign.example.com/api/submissions/7');
    expect(init.method).toBe('DELETE');
  });

  it('getTemplateFieldRoles maps each field name to its submitter role', async () => {
    fetchMock.mockResolvedValue(
      jsonRes({
        id: 2,
        submitters: [
          { uuid: 'u-vendor', name: 'Vendor' },
          { uuid: 'u-couple', name: 'Couple' },
        ],
        fields: [
          { name: 'vendor_name', submitter_uuid: 'u-vendor' },
          { name: 'agreed_price', submitter_uuid: 'u-vendor' },
          { name: 'couple_name', submitter_uuid: 'u-couple' },
          { name: '', submitter_uuid: 'u-vendor' }, // signature field, no name -> skipped
          { name: 'orphan', submitter_uuid: 'u-missing' }, // unknown submitter -> skipped
        ],
      })
    );
    const map = await getTemplateFieldRoles('2');
    expect(fetchMock.mock.calls[0][0]).toBe('https://sign.example.com/api/templates/2');
    expect(Object.fromEntries(map)).toEqual({
      vendor_name: 'Vendor',
      agreed_price: 'Vendor',
      couple_name: 'Couple',
    });
  });
});
