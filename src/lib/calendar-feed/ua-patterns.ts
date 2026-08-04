// src/lib/calendar-feed/ua-patterns.ts
export type RecognizedProvider = 'google' | 'apple' | 'outlook' | 'other';

const PATTERNS: Array<{ test: RegExp; provider: RecognizedProvider }> = [
  { test: /Google-Calendar-Importer/i, provider: 'google' },
  { test: /\bMSOutlook\b/i, provider: 'outlook' },
  { test: /Microsoft Outlook/i, provider: 'outlook' },
  { test: /Outlook[-\s]?Calendar/i, provider: 'outlook' },
  { test: /CalendarAgent/i, provider: 'apple' },
  { test: /CalendarFramework/i, provider: 'apple' },
  { test: /\biCal\b/i, provider: 'apple' },
];

export function recognizeProvider(userAgent: string | null | undefined): RecognizedProvider | null {
  if (!userAgent || !userAgent.trim()) return null;
  for (const { test, provider } of PATTERNS) {
    if (test.test(userAgent)) return provider;
  }
  return 'other';
}
