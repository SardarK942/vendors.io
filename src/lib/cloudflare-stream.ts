const CF_API = 'https://api.cloudflare.com/client/v4';

// Secrets — server-only. Throws if called in the browser bundle (env undefined),
// which is correct: createDirectUpload/getVideoStatus run only in route handlers.
function cfServerConfig() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_STREAM_API_TOKEN;
  if (!accountId || !token) {
    throw new Error('Cloudflare Stream server env not configured');
  }
  return { accountId, token };
}

// Public — the customer subdomain appears in every viewer-facing media URL, so it
// is NEXT_PUBLIC_ and safe to read in the client (thumbnail/iframe builders).
function cfSubdomain() {
  const subdomain = process.env.NEXT_PUBLIC_CLOUDFLARE_STREAM_SUBDOMAIN;
  if (!subdomain) throw new Error('Cloudflare Stream subdomain not configured');
  return subdomain;
}

export async function createDirectUpload(opts?: {
  maxDurationSeconds?: number;
}): Promise<{ uploadURL: string; uid: string }> {
  const { accountId, token } = cfServerConfig();
  const res = await fetch(`${CF_API}/accounts/${accountId}/stream/direct_upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ maxDurationSeconds: opts?.maxDurationSeconds ?? 60 }),
  });
  if (!res.ok) throw new Error(`Cloudflare direct_upload failed: ${res.status}`);
  const json = (await res.json()) as { result: { uploadURL: string; uid: string } };
  return { uploadURL: json.result.uploadURL, uid: json.result.uid };
}

export async function getVideoStatus(
  uid: string
): Promise<{ uid: string; readyToStream: boolean }> {
  const { accountId, token } = cfServerConfig();
  const res = await fetch(`${CF_API}/accounts/${accountId}/stream/${uid}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Cloudflare video status failed: ${res.status}`);
  const json = (await res.json()) as { result?: { readyToStream?: boolean } };
  return { uid, readyToStream: Boolean(json.result?.readyToStream) };
}

export function streamThumbnailUrl(uid: string): string {
  return `https://${cfSubdomain()}.cloudflarestream.com/${uid}/thumbnails/thumbnail.jpg`;
}

export function streamIframeUrl(uid: string): string {
  return `https://${cfSubdomain()}.cloudflarestream.com/${uid}/iframe`;
}
