import { describe, it, expect, beforeEach, vi } from 'vitest';

const sendMock = vi.hoisted(() => vi.fn());
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: sendMock };
  },
}));
vi.mock('@/lib/supabase/server', () => ({ createServiceRoleClient: vi.fn() }));

import {
  sendShopEmail,
  sendContractSigningRequestEmail,
  sendContractReminderEmail,
  sendContractSignedCopyEmail,
} from '@/lib/email/resend';

beforeEach(() => {
  sendMock.mockReset();
  sendMock.mockResolvedValue({ data: { id: 'e1' }, error: null });
});

describe('sendEmail attachments', () => {
  it('forwards attachments to resend when provided', async () => {
    const content = Buffer.from('pdf');
    await sendContractSignedCopyEmail('a@b.c', { vendorName: 'V' }, { filename: 'c.pdf', content });
    expect(sendMock.mock.calls[0][0].attachments).toEqual([{ filename: 'c.pdf', content }]);
  });

  it('omits attachments key when none given (existing callers unaffected)', async () => {
    await sendShopEmail({ to: 'a@b.c', subject: 's', html: '<p>x</p>' });
    expect(Object.keys(sendMock.mock.calls[0][0])).not.toContain('attachments');
  });
});

describe('contract emails', () => {
  it('signing request includes link, escaped vendor, and schedule', async () => {
    const ok = await sendContractSigningRequestEmail('a@b.c', 'couple', 'https://sign.example/x', {
      vendorName: '<b>Acme</b>',
      eventSchedule: 'Mehndi: Jun 1\nWedding: Jun 2',
    });
    expect(ok).toBe(true);
    const { html } = sendMock.mock.calls[0][0];
    expect(html).toContain('https://sign.example/x');
    expect(html).toContain('Mehndi: Jun 1<br>Wedding: Jun 2');
    expect(html).not.toContain('<b>Acme</b>');
    expect(html).toContain('&lt;b&gt;Acme&lt;/b&gt;');
  });

  it('reminder includes link', async () => {
    await sendContractReminderEmail('a@b.c', 'vendor', 'https://sign.example/y', {
      vendorName: 'Acme',
    });
    expect(sendMock.mock.calls[0][0].html).toContain('https://sign.example/y');
  });

  it('signed copy attaches the signed pdf', async () => {
    const content = Buffer.from('x');
    await sendContractSignedCopyEmail(
      'a@b.c',
      { vendorName: 'Acme' },
      { filename: 'signed.pdf', content }
    );
    expect(sendMock.mock.calls[0][0].attachments[0].filename).toBe('signed.pdf');
  });
});
