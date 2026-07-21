import { describe, it, expect } from 'vitest';
import { dollarsToCents } from '@/lib/events/money';

describe('dollarsToCents', () => {
  it('empty string -> null', () => {
    expect(dollarsToCents('')).toBeNull();
  });
  it('250 -> 25000', () => {
    expect(dollarsToCents('250')).toBe(25000);
  });
  it('249.99 -> 24999', () => {
    expect(dollarsToCents('249.99')).toBe(24999);
  });
  it('- -> undefined', () => {
    expect(dollarsToCents('-')).toBeUndefined();
  });
  it('-5 -> undefined', () => {
    expect(dollarsToCents('-5')).toBeUndefined();
  });
  it('abc -> undefined', () => {
    expect(dollarsToCents('abc')).toBeUndefined();
  });
  it(' 12  -> 1200 (trims whitespace)', () => {
    expect(dollarsToCents(' 12 ')).toBe(1200);
  });
});
