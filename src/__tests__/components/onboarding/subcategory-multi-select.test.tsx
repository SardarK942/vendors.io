import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SubcategoryMultiSelect } from '@/components/onboarding/SubcategoryMultiSelect';

describe('<SubcategoryMultiSelect />', () => {
  it('renders nothing for a category without subcategories', () => {
    const { container } = render(
      <SubcategoryMultiSelect category="photography" selected={[]} onChange={() => {}} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders one chip per cart subcategory', () => {
    render(<SubcategoryMultiSelect category="carts" selected={[]} onChange={() => {}} />);
    expect(screen.getByRole('button', { name: /dessert cart/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /beverage cart/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /appetizer cart/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /favor . gift cart/i })).toBeInTheDocument();
  });

  it('marks selected chips as pressed', () => {
    render(<SubcategoryMultiSelect category="carts" selected={['dessert']} onChange={() => {}} />);
    expect(screen.getByRole('button', { name: /dessert cart/i })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByRole('button', { name: /beverage cart/i })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
  });

  it('toggles a slug into the selection on click', () => {
    const onChange = vi.fn();
    render(<SubcategoryMultiSelect category="carts" selected={[]} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /dessert cart/i }));
    expect(onChange).toHaveBeenCalledWith(['dessert']);
  });

  it('toggles a slug out of the selection on click', () => {
    const onChange = vi.fn();
    render(
      <SubcategoryMultiSelect
        category="carts"
        selected={['dessert', 'beverage']}
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /dessert cart/i }));
    expect(onChange).toHaveBeenCalledWith(['beverage']);
  });
});
