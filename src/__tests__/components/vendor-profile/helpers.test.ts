import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getFeaturedPackage,
  calculateDeposit,
  calculateRemaining,
  formatPrice,
  proceedToBooking,
} from '@/components/marketplace/vendor-profile/helpers';

describe('getFeaturedPackage', () => {
  it('returns null for empty array', () => {
    expect(getFeaturedPackage([])).toBeNull();
  });

  it('returns the cheapest package by base_price_cents', () => {
    const packages = [
      { id: 'a', base_price_cents: 250_000 },
      { id: 'b', base_price_cents: 120_000 },
      { id: 'c', base_price_cents: 180_000 },
    ];
    expect(getFeaturedPackage(packages)?.id).toBe('b');
  });

  it('treats null base_price_cents as Infinity (deprioritized)', () => {
    const packages = [
      { id: 'a', base_price_cents: 250_000 },
      { id: 'b', base_price_cents: null },
    ];
    expect(getFeaturedPackage(packages)?.id).toBe('a');
  });

  it('returns first when all have equal price', () => {
    const packages = [
      { id: 'a', base_price_cents: 100_000 },
      { id: 'b', base_price_cents: 100_000 },
    ];
    expect(getFeaturedPackage(packages)?.id).toBe('a');
  });

  it('prefers a vendor-flagged package over the cheapest', () => {
    const packages = [
      { id: 'a', base_price_cents: 120_000, is_featured: false },
      { id: 'b', base_price_cents: 250_000, is_featured: true },
      { id: 'c', base_price_cents: 180_000, is_featured: false },
    ];
    expect(getFeaturedPackage(packages)?.id).toBe('b');
  });

  it('picks the cheapest among multiple flagged packages', () => {
    const packages = [
      { id: 'a', base_price_cents: 250_000, is_featured: true },
      { id: 'b', base_price_cents: 120_000, is_featured: true },
      { id: 'c', base_price_cents: 100_000, is_featured: false },
    ];
    expect(getFeaturedPackage(packages)?.id).toBe('b');
  });
});

describe('calculateDeposit', () => {
  it('is 5% rounded to nearest cent', () => {
    expect(calculateDeposit(120_000)).toBe(6_000); // $1,200 → $60
    expect(calculateDeposit(180_000)).toBe(9_000); // $1,800 → $90
    expect(calculateDeposit(280_001)).toBe(14_000); // 14_000.05 rounded
  });
});

describe('calculateRemaining', () => {
  it('is total minus deposit', () => {
    expect(calculateRemaining(120_000)).toBe(114_000);
  });
});

describe('formatPrice', () => {
  it('formats cents as USD with no decimals', () => {
    expect(formatPrice(120_000)).toBe('$1,200');
    expect(formatPrice(9_000)).toBe('$90');
    expect(formatPrice(0)).toBe('$0');
  });
});

describe('proceedToBooking', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('writes the booking-selection cookie BEFORE navigating (the missing step)', async () => {
    fetchMock.mockResolvedValue({ ok: true } as Response);
    const navigate = vi.fn();

    await proceedToBooking('strings-ice-cream-cart', 'pkg-mochi', navigate);

    // Must POST the signed-cookie selection — this is what the /book page reads.
    expect(fetchMock).toHaveBeenCalledWith('/api/booking-selection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ package_id: 'pkg-mochi', selected_addons: [] }),
    });
    // Then navigate (no query param — /book reads the cookie, not ?package=).
    expect(navigate).toHaveBeenCalledWith('/vendors/strings-ice-cream-cart/book');
  });

  it('does not navigate when the selection POST fails', async () => {
    fetchMock.mockResolvedValue({ ok: false } as Response);
    const navigate = vi.fn();

    await proceedToBooking('strings-ice-cream-cart', 'pkg-mochi', navigate);

    expect(navigate).not.toHaveBeenCalled();
  });
});
