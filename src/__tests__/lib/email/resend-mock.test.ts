import { describe, it, expect, beforeEach } from 'vitest';
import { sendWithRecord, getRecordedSends, clearRecordedSends } from '@/lib/email/__mocks__/resend';

describe('Resend mock', () => {
  beforeEach(() => clearRecordedSends());

  it('records the sent payload', async () => {
    const out = await sendWithRecord({ to: 'a@b.c', subject: 'hi', html: '<p>x</p>' });
    expect(out.ok).toBe(true);
    expect(getRecordedSends()).toEqual([
      expect.objectContaining({ to: 'a@b.c', subject: 'hi', html: '<p>x</p>' }),
    ]);
  });

  it('clearRecordedSends resets the store', async () => {
    await sendWithRecord({ to: 'a@b.c', subject: 'hi', html: '<p>x</p>' });
    clearRecordedSends();
    expect(getRecordedSends()).toEqual([]);
  });
});
