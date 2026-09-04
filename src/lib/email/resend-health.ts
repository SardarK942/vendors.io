export type ResendHealth = 'ok' | 'failing' | 'unset';

/**
 * Health probe for the Resend API key.
 *
 * We deliberately probe `POST /emails` with an empty body rather than
 * `GET /domains`. Production uses a least-privilege "Sending access" API key,
 * which CAN send email but is denied (401) on management endpoints like
 * `/domains` — so a `/domains` probe reports a perfectly healthy key as failing.
 *
 * `POST /emails` with `{}` is validated AFTER auth: a key that can send returns
 * 422 ("Missing `to` field") and nothing is sent, while an invalid/revoked key
 * returns 401. That lets us distinguish "can send" (ok) from "bad key"
 * (failing) — which `/domains` cannot.
 */
export async function probeResend(
  apiKey: string | undefined,
  fetchImpl: typeof fetch = fetch
): Promise<ResendHealth> {
  if (!apiKey) return 'unset';
  try {
    const res = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(3000),
    });
    // 401/403 → key can't send (invalid/revoked/insufficient scope) → failing.
    if (res.status === 401 || res.status === 403) return 'failing';
    // 2xx (unexpected — {} shouldn't send) or 400/422 (auth OK, body rejected) → ok.
    if (res.ok || res.status === 400 || res.status === 422) return 'ok';
    // 5xx and anything else → Resend unhealthy.
    return 'failing';
  } catch {
    // Network error / timeout.
    return 'failing';
  }
}
