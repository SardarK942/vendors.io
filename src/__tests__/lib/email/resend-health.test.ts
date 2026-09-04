import { describe, it, expect, vi } from 'vitest';
import { probeResend } from '@/lib/email/resend-health';

function fakeFetch(status: number): typeof fetch {
  return vi
    .fn()
    .mockResolvedValue({ ok: status >= 200 && status < 300, status }) as unknown as typeof fetch;
}

describe('probeResend', () => {
  it("returns 'unset' when no API key is configured", async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    expect(await probeResend(undefined, fetchImpl)).toBe('unset');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns 'ok' for 422 (restricted sending key: auth passed, body invalid, nothing sent)", async () => {
    expect(await probeResend('re_test', fakeFetch(422))).toBe('ok');
  });

  it("returns 'ok' for a 2xx", async () => {
    expect(await probeResend('re_test', fakeFetch(200))).toBe('ok');
  });

  it("returns 'failing' for 401 (invalid/revoked key — genuinely cannot send)", async () => {
    expect(await probeResend('re_bad', fakeFetch(401))).toBe('failing');
  });

  it("returns 'failing' for 403", async () => {
    expect(await probeResend('re_bad', fakeFetch(403))).toBe('failing');
  });

  it("returns 'failing' for a 5xx (Resend down)", async () => {
    expect(await probeResend('re_test', fakeFetch(503))).toBe('failing');
  });

  it("returns 'failing' when the request throws (network/timeout)", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('timeout')) as unknown as typeof fetch;
    expect(await probeResend('re_test', fetchImpl)).toBe('failing');
  });

  it('probes POST /emails (send scope), not /domains (management scope)', async () => {
    const fetchImpl = fakeFetch(422);
    await probeResend('re_test', fetchImpl);
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.method).toBe('POST');
  });
});
