import crypto from 'node:crypto';

function base64UrlEncode(input: Buffer): string {
  return input.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(input: string): Buffer {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/') + '=='.slice((input.length + 2) % 4);
  return Buffer.from(padded, 'base64');
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Mints a one-time claim token string of form `<b64url(vendorId)>:<b64url(64-rand-bytes)>`. */
export function mintTokenString(scrapedVendorId: string): string {
  if (!UUID_REGEX.test(scrapedVendorId)) {
    throw new Error(`invalid scrapedVendorId: ${scrapedVendorId}`);
  }
  const idPart = base64UrlEncode(Buffer.from(scrapedVendorId.replace(/-/g, ''), 'hex'));
  const randPart = base64UrlEncode(crypto.randomBytes(64));
  return `${idPart}:${randPart}`;
}

/** Parse a token string back into its components. Null if malformed. */
export function parseTokenString(token: string): { scrapedVendorId: string } | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split(':');
  if (parts.length !== 2) return null;
  try {
    const idBuf = base64UrlDecode(parts[0]);
    if (idBuf.length !== 16) return null;
    const hex = idBuf.toString('hex');
    const scrapedVendorId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    if (!UUID_REGEX.test(scrapedVendorId)) return null;
    return { scrapedVendorId };
  } catch {
    return null;
  }
}

/** SHA-256 hex of a token string. */
export function hashTokenString(token: string): string {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}
