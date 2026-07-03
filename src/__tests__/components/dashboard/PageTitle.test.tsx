import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PageTitle } from '@/components/dashboard/PageTitle';

describe('PageTitle', () => {
  it('renders children as an h1', () => {
    render(<PageTitle>Home</PageTitle>);
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1).toHaveTextContent('Home');
  });

  it('applies the haldi block classes', () => {
    render(<PageTitle>Bookings</PageTitle>);
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1.className).toMatch(/bg-haldi/);
    expect(h1.className).toMatch(/text-ink/);
  });

  it('renders subtitle when provided', () => {
    render(<PageTitle subtitle="Update your password and email address.">Settings</PageTitle>);
    expect(screen.getByText('Update your password and email address.')).toBeInTheDocument();
  });

  it('merges custom className', () => {
    render(<PageTitle className="mb-8">Home</PageTitle>);
    const wrapper = screen.getByTestId('page-title-wrapper');
    expect(wrapper.className).toMatch(/mb-8/);
  });
});
