// src/__tests__/lib/calendar-feed/ua-patterns.test.ts
import { describe, it, expect } from 'vitest';
import { recognizeProvider } from '@/lib/calendar-feed/ua-patterns';

describe('recognizeProvider', () => {
  it('recognizes Google Calendar Importer', () => {
    expect(recognizeProvider('Google-Calendar-Importer')).toBe('google');
  });
  it('recognizes Apple Calendar (macOS)', () => {
    expect(recognizeProvider('iCal/15.0 CalendarAgent/1234')).toBe('apple');
  });
  it('recognizes Apple Calendar (iOS)', () => {
    expect(recognizeProvider('iOS/17.4 CalendarFramework/2.0')).toBe('apple');
  });
  it('recognizes Outlook desktop', () => {
    expect(recognizeProvider('MSOutlook/16.0')).toBe('outlook');
  });
  it('recognizes Outlook on the web variant', () => {
    expect(recognizeProvider('Microsoft Outlook Calendar')).toBe('outlook');
  });
  it('recognizes a generic CalDAV client as other', () => {
    expect(recognizeProvider('Mozilla/5.0 caldav-sync')).toBe('other');
  });
  it('returns other for any non-empty unrecognized UA', () => {
    expect(recognizeProvider('curl/8.0')).toBe('other');
    expect(recognizeProvider('HoneyBookCalendarSync')).toBe('other');
  });
  it('returns null for missing UA', () => {
    expect(recognizeProvider(undefined)).toBeNull();
    expect(recognizeProvider(null)).toBeNull();
    expect(recognizeProvider('')).toBeNull();
    expect(recognizeProvider('   ')).toBeNull();
  });
});
