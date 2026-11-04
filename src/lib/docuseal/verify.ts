import { createHmac, timingSafeEqual } from 'node:crypto';

export const DOCUSEAL_SIGNATURE_HEADER = 'X-Docuseal-Signature';

export interface VerifyDocusealWebhookArgs {
  rawBody: string;
  headers: Headers;
  secret: string;
  headerName?: string;
}

/**
 * Verify a DocuSeal webhook signature.
 *
 * DocuSeal signs each delivery with HMAC-SHA256 and sends it in the
 * `X-Docuseal-Signature` header as `<unix-timestamp>.<hex>`, where the hex is
 * HMAC_SHA256(secret, `${timestamp}.${rawBody}`). The key is the configured
 * secret string used verbatim — the `whsec_…` value is NOT base64-decoded.
 * Verified empirically against a live self-hosted instance (2026-11).
 *
 * Returns false (never throws) on any missing/malformed/mismatched input.
 * No timestamp-freshness check on purpose: DocuSeal retries failed deliveries,
 * and the webhook route already dedups replays via the `docuseal_events` table,
 * so a freshness window would wrongly reject legitimate retries.
 */
export function verifyDocusealWebhook({
  rawBody,
  headers,
  secret,
  headerName = DOCUSEAL_SIGNATURE_HEADER,
}: VerifyDocusealWebhookArgs): boolean {
  if (!secret) return false;
  const provided = headers.get(headerName);
  if (!provided) return false;

  // Header format: "<unix-timestamp>.<hex-hmac>".
  const dot = provided.indexOf('.');
  if (dot <= 0) return false;
  const timestamp = provided.slice(0, dot);
  const providedHex = provided.slice(dot + 1);
  if (!/^\d+$/.test(timestamp) || !/^[0-9a-fA-F]+$/.test(providedHex)) return false;

  const expectedHex = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
  const a = Buffer.from(providedHex.toLowerCase(), 'hex');
  const b = Buffer.from(expectedHex, 'hex');
  if (a.length === 0 || a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
