import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SubcategoryStrip } from '@/components/marketplace/filters/SubcategoryStrip';
import { useFilterState } from '@/components/marketplace/filters/use-filter-state';
import type { FilterState } from '@/components/marketplace/filters/use-filter-state';

vi.mock('@/components/marketplace/filters/use-filter-state', () => ({
  useFilterState: vi.fn(),
}));

const apply = vi.fn();

function mockState(overrides: Partial<FilterState>) {
  (useFilterState as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
    state: {
      q: '',
      category: null,
      verified: false,
      respondsIn: 0,
      priceBand: null,
      priceMin: null,
      priceMax: null,
      languages: [],
      years: 0,
      events: [],
      subcategories: [],
      photoVideoCombo: false,
      ...overrides,
    },
    apply,
  });
}

describe('<SubcategoryStrip />', () => {
  beforeEach(() => {
    apply.mockClear();
  });

  it('renders nothing when no category is active', () => {
    mockState({ category: null });
    const { container } = render(<SubcategoryStrip />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing for a category with no subcategory taxonomy', () => {
    mockState({ category: 'videography' });
    const { container } = render(<SubcategoryStrip />);
    expect(container.firstChild).toBeNull();
  });

  it('renders one chip per subcategory when the active category has them', () => {
    mockState({ category: 'carts' });
    render(<SubcategoryStrip />);
    expect(screen.getByRole('button', { name: /dessert cart/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /beverage cart/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /appetizer cart/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /favor . gift cart/i })).toBeInTheDocument();
  });

  it('marks the selected subcategories as pressed', () => {
    mockState({ category: 'carts', subcategories: ['dessert'] });
    render(<SubcategoryStrip />);
    expect(screen.getByRole('button', { name: /dessert cart/i })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByRole('button', { name: /beverage cart/i })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
  });

  it('applies a sorted subcategory list, adding a slug on click', () => {
    mockState({ category: 'carts', subcategories: ['dessert'] });
    render(<SubcategoryStrip />);
    fireEvent.click(screen.getByRole('button', { name: /beverage cart/i }));
    expect(apply).toHaveBeenCalledWith({ subcategories: ['beverage', 'dessert'] });
  });

  it('removes a slug on clicking an already-selected chip', () => {
    mockState({ category: 'carts', subcategories: ['dessert', 'beverage'] });
    render(<SubcategoryStrip />);
    fireEvent.click(screen.getByRole('button', { name: /dessert cart/i }));
    expect(apply).toHaveBeenCalledWith({ subcategories: ['beverage'] });
  });
});
