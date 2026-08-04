// src/__tests__/lib/calendar-feed/deep-links.test.ts
import { describe, it, expect } from 'vitest';
import {
  buildGoogleSubscribeUrl,
  buildAppleWebcalUrl,
  buildOutlookSubscribeUrl,
} from '@/lib/calendar-feed/deep-links';

const FEED = 'https://baazar.io/api/cal/abc123.ics';

describe('buildGoogleSubscribeUrl', () => {
  it('wraps the feed URL with the cid param, percent-encoded', () => {
    expect(buildGoogleSubscribeUrl(FEED)).toBe(
      'https://calendar.google.com/calendar/u/0/r?cid=https%3A%2F%2Fbaazar.io%2Fapi%2Fcal%2Fabc123.ics'
    );
  });
});

describe('buildAppleWebcalUrl', () => {
  it('replaces https:// with webcal://', () => {
    expect(buildAppleWebcalUrl(FEED)).toBe('webcal://baazar.io/api/cal/abc123.ics');
  });
  it('replaces http:// with webcal:// for local dev', () => {
    expect(buildAppleWebcalUrl('http://localhost:3000/api/cal/x.ics')).toBe(
      'webcal://localhost:3000/api/cal/x.ics'
    );
  });
  it('throws for non-http schemes', () => {
    expect(() => buildAppleWebcalUrl('ftp://x.com/feed.ics')).toThrow();
  });
});

describe('buildOutlookSubscribeUrl', () => {
  it('builds the addfromweb URL with url + name params', () => {
    expect(buildOutlookSubscribeUrl(FEED, 'Baazar Bookings')).toBe(
      'https://outlook.live.com/calendar/0/addfromweb?url=https%3A%2F%2Fbaazar.io%2Fapi%2Fcal%2Fabc123.ics&name=Baazar%20Bookings'
    );
  });
});
