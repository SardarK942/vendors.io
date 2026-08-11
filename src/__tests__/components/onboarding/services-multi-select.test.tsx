import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ServicesMultiSelect } from '@/components/onboarding/ServicesMultiSelect';

describe('ServicesMultiSelect', () => {
  it('shows the primary as a locked chip and toggles others', () => {
    const onChange = vi.fn();
    render(
      <ServicesMultiSelect primary="photography" selected={['photography']} onChange={onChange} />
    );
    // Primary label present, not a toggle button.
    expect(screen.getByText(/Photography · Primary/)).toBeInTheDocument();
    // Toggle "Videography & Content" adds it to the set (primary preserved).
    fireEvent.click(screen.getByRole('button', { name: /Videography & Content/ }));
    expect(onChange).toHaveBeenCalledWith(['photography', 'videography']);
  });

  it('does not render the primary as a toggle option', () => {
    render(
      <ServicesMultiSelect primary="photography" selected={['photography']} onChange={() => {}} />
    );
    expect(screen.queryByRole('button', { name: /^Photography$/ })).toBeNull();
  });
});
