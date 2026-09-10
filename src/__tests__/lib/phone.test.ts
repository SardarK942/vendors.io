import { describe, it, expect } from 'vitest';
import { formatUsPhoneInput, isCompleteUsPhone, usPhoneDigits } from '@/lib/phone';

describe('formatUsPhoneInput', () => {
  it('returns empty for empty / non-digit input', () => {
    expect(formatUsPhoneInput('')).toBe('');
    expect(formatUsPhoneInput('abc')).toBe('');
  });

  it('formats progressively as digits are entered', () => {
    expect(formatUsPhoneInput('5')).toBe('5');
    expect(formatUsPhoneInput('555')).toBe('555');
    expect(formatUsPhoneInput('5551')).toBe('(555) 1');
    expect(formatUsPhoneInput('555123')).toBe('(555) 123');
    expect(formatUsPhoneInput('5551234')).toBe('(555) 123-4');
    expect(formatUsPhoneInput('5551234567')).toBe('(555) 123-4567');
  });

  it('strips separators and re-masks pasted numbers', () => {
    expect(formatUsPhoneInput('555-123-4567')).toBe('(555) 123-4567');
    expect(formatUsPhoneInput('(555) 123-4567')).toBe('(555) 123-4567');
  });

  it('drops a leading US country code', () => {
    expect(formatUsPhoneInput('15551234567')).toBe('(555) 123-4567');
    expect(formatUsPhoneInput('+1 (555) 123-4567')).toBe('(555) 123-4567');
  });

  it('caps at 10 digits', () => {
    expect(formatUsPhoneInput('55512345678901')).toBe('(555) 123-4567');
  });
});

describe('usPhoneDigits', () => {
  it('extracts up to 10 digits, dropping a leading 1', () => {
    expect(usPhoneDigits('+1 (555) 123-4567')).toBe('5551234567');
    expect(usPhoneDigits('555.123.4567')).toBe('5551234567');
  });
});

describe('isCompleteUsPhone', () => {
  it('is true only for a full 10-digit number', () => {
    expect(isCompleteUsPhone('(555) 123-4567')).toBe(true);
    expect(isCompleteUsPhone('15551234567')).toBe(true);
    expect(isCompleteUsPhone('(555) 123-45')).toBe(false);
    expect(isCompleteUsPhone('')).toBe(false);
  });
});
