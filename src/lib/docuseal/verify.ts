import { timingSafeEqual } from 'node:crypto';

export const DOCUSEAL_SIGNATURE_HEADER = 'X-Docuseal-Signature';

export interface VerifyDocusealWebhookArgs {
  rawBody: string;
  headers: Headers;
  secret: string;
  now?: Date;
  headerName?: string;
}

/**
 * OSS DocuSeal uses a configured secret header; if a live instance emits an
 * HMAC `<timestamp>.<hex>` signature instead, swap the body here — interface
 * stays the same. `rawBody` and `now` are unused in the shared-secret scheme.
 */
export function verifyDocusealWebhook({
  headers,
  secret,
  headerName = DOCUSEAL_SIGNATURE_HEADER,
}: VerifyDocusealWebhookArgs): boolean {
  if (!secret) return false;
  const provided = headers.get(headerName);
  if (!provided) return false;

  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(secret, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
