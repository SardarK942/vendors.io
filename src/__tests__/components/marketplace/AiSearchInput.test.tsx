import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AiSearchInput } from '@/components/marketplace/AiSearchInput';

const push = vi.fn();
let currentParams = '';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams(currentParams),
}));

describe('<AiSearchInput /> clear affordance', () => {
  beforeEach(() => {
    push.mockClear();
    currentParams = '';
  });

  it('shows no clear button when the input is empty', () => {
    render(<AiSearchInput />);
    expect(screen.queryByRole('button', { name: /clear search/i })).toBeNull();
  });

  it('shows a clear button when there is query text (SSR prefill)', () => {
    render(<AiSearchInput defaultValue="fries" />);
    expect(screen.getByRole('button', { name: /clear search/i })).toBeInTheDocument();
  });

  it('clearing empties the input and drops the q param from the URL', () => {
    currentParams = 'q=fries&category=decor';
    render(<AiSearchInput defaultValue="fries" />);

    fireEvent.click(screen.getByRole('button', { name: /clear search/i }));

    // Input is visually emptied.
    const input = screen.getByRole('textbox', { name: /vendor/i }) as HTMLInputElement;
    expect(input.value).toBe('');

    // Navigation drops q but preserves other filters (category), so results reset
    // to the active category instead of staying stuck at 0.
    expect(push).toHaveBeenCalledTimes(1);
    const target = push.mock.calls[0][0] as string;
    expect(target).toBe('/vendors?category=decor');
  });

  it('the clear button disappears after clearing', () => {
    currentParams = 'q=fries';
    render(<AiSearchInput defaultValue="fries" />);
    fireEvent.click(screen.getByRole('button', { name: /clear search/i }));
    expect(screen.queryByRole('button', { name: /clear search/i })).toBeNull();
  });
});
