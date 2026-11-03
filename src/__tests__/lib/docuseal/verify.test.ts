import { describe, expect, it } from 'vitest';
import { verifyDocusealWebhook } from '@/lib/docuseal/verify';

const secret = 'whsec_test_secret_123';
const rawBody = JSON.stringify({ event_type: 'form.completed' });

function req(headers: Record<string, string>): Headers {
  return new Headers(headers);
}

describe('verifyDocusealWebhook (shared-secret header)', () => {
  it('accepts a correct secret header', () => {
    expect(
      verifyDocusealWebhook({
        rawBody,
        headers: req({ 'X-Docuseal-Signature': secret }),
        secret,
      })
    ).toBe(true);
  });

  it('rejects a wrong secret', () => {
    expect(
      verifyDocusealWebhook({
        rawBody,
        headers: req({ 'X-Docuseal-Signature': 'whsec_test_secret_124' }),
        secret,
      })
    ).toBe(false);
  });

  it('rejects a secret of different length without throwing', () => {
    expect(
      verifyDocusealWebhook({
        rawBody,
        headers: req({ 'X-Docuseal-Signature': 'short' }),
        secret,
      })
    ).toBe(false);
  });

  it('rejects when the signature header is missing or empty', () => {
    expect(verifyDocusealWebhook({ rawBody, headers: req({}), secret })).toBe(false);
    expect(
      verifyDocusealWebhook({
        rawBody,
        headers: req({ 'X-Docuseal-Signature': '' }),
        secret,
      })
    ).toBe(false);
  });

  it('rejects when the configured secret is empty, even if header is empty', () => {
    expect(
      verifyDocusealWebhook({
        rawBody,
        headers: req({ 'X-Docuseal-Signature': '' }),
        secret: '',
      })
    ).toBe(false);
    expect(
      verifyDocusealWebhook({
        rawBody,
        headers: req({ 'X-Docuseal-Signature': 'anything' }),
        secret: '',
      })
    ).toBe(false);
  });

  it('honours a custom headerName and ignores the default header', () => {
    expect(
      verifyDocusealWebhook({
        rawBody,
        headers: req({ 'X-Custom': secret }),
        secret,
        headerName: 'X-Custom',
      })
    ).toBe(true);
    expect(
      verifyDocusealWebhook({
        rawBody,
        headers: req({ 'X-Docuseal-Signature': secret }),
        secret,
        headerName: 'X-Custom',
      })
    ).toBe(false);
  });
});
