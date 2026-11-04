import { describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import { verifyDocusealWebhook } from '@/lib/docuseal/verify';

const secret = 'whsec_test_secret_123';
const rawBody = JSON.stringify({ event_type: 'form.completed', data: { id: 7 } });

/** Build a valid `<timestamp>.<hex>` signature the way DocuSeal does. */
function sign(body: string, key: string, ts = '1793759505'): string {
  const hex = createHmac('sha256', key).update(`${ts}.${body}`).digest('hex');
  return `${ts}.${hex}`;
}

function req(headers: Record<string, string>): Headers {
  return new Headers(headers);
}

describe('verifyDocusealWebhook (HMAC-SHA256)', () => {
  it('accepts a correctly signed request', () => {
    expect(
      verifyDocusealWebhook({
        rawBody,
        headers: req({ 'X-Docuseal-Signature': sign(rawBody, secret) }),
        secret,
      })
    ).toBe(true);
  });

  it('rejects a signature made with the wrong secret', () => {
    expect(
      verifyDocusealWebhook({
        rawBody,
        headers: req({ 'X-Docuseal-Signature': sign(rawBody, 'whsec_wrong') }),
        secret,
      })
    ).toBe(false);
  });

  it('rejects when the body was tampered with after signing', () => {
    const header = sign(rawBody, secret);
    expect(
      verifyDocusealWebhook({
        rawBody: rawBody + ' ',
        headers: req({ 'X-Docuseal-Signature': header }),
        secret,
      })
    ).toBe(false);
  });

  it('rejects when the timestamp is changed (it is part of the signed content)', () => {
    const good = sign(rawBody, secret, '1793759505');
    const tampered = good.replace('1793759505', '1793759999');
    expect(
      verifyDocusealWebhook({ rawBody, headers: req({ 'X-Docuseal-Signature': tampered }), secret })
    ).toBe(false);
  });

  it('rejects a malformed header (no dot, non-numeric ts, non-hex sig)', () => {
    for (const bad of ['nodothere', '.abcd', '123.', 'notanumber.deadbeef', '123.nothex!!']) {
      expect(
        verifyDocusealWebhook({ rawBody, headers: req({ 'X-Docuseal-Signature': bad }), secret })
      ).toBe(false);
    }
  });

  it('rejects when the signature header is missing or empty', () => {
    expect(verifyDocusealWebhook({ rawBody, headers: req({}), secret })).toBe(false);
    expect(
      verifyDocusealWebhook({ rawBody, headers: req({ 'X-Docuseal-Signature': '' }), secret })
    ).toBe(false);
  });

  it('rejects when the configured secret is empty', () => {
    expect(
      verifyDocusealWebhook({
        rawBody,
        headers: req({ 'X-Docuseal-Signature': sign(rawBody, '') }),
        secret: '',
      })
    ).toBe(false);
  });

  it('honours a custom headerName and ignores the default header', () => {
    const header = sign(rawBody, secret);
    expect(
      verifyDocusealWebhook({
        rawBody,
        headers: req({ 'X-Custom-Sig': header }),
        secret,
        headerName: 'X-Custom-Sig',
      })
    ).toBe(true);
    expect(
      verifyDocusealWebhook({
        rawBody,
        headers: req({ 'X-Docuseal-Signature': header }),
        secret,
        headerName: 'X-Custom-Sig',
      })
    ).toBe(false);
  });
});
