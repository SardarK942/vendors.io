'use client';

import * as React from 'react';
import { X, SlidersHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ChipVariant = 'toggle' | 'dropdown' | 'applied' | 'all-filters';

export interface ChipProps {
  /** Visual + interaction variant. */
  variant?: ChipVariant;
  /** Active state (ink-filled). Toggle = "on"; Dropdown = "panel open OR value set". */
  isActive?: boolean;
  /** Optional count badge (indigo on default, cream on active). */
  count?: number;
  /** Inner label content. */
  children: React.ReactNode;
  /** Click handler — toggle flip / dropdown open / sheet open / applied tap. */
  onClick?: () => void;
  /** Called when × clicked (applied variant only). */
  onRemove?: () => void;
  /** Panel ID for aria-controls (dropdown variant). */
  panelId?: string;
  /** Optional className override. */
  className?: string;
}

/**
 * Baazar M+ filter chip primitive. 5 variants share the same 32px pill shape;
 * variant changes affordance + interaction.
 */
export const Chip = React.forwardRef<HTMLButtonElement, ChipProps>(
  (
    {
      variant = 'toggle',
      isActive = false,
      count,
      children,
      onClick,
      onRemove,
      panelId,
      className,
    },
    ref
  ) => {
    const baseClasses = cn(
      'inline-flex items-center justify-center gap-1.5 h-8 px-3.5 rounded-full',
      'font-sans text-[12px] font-medium leading-none whitespace-nowrap',
      'transition-[background-color,border-color,color] duration-[180ms] ease-[cubic-bezier(.22,1,.36,1)]',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo focus-visible:ring-offset-2 focus-visible:ring-offset-cream',
      'disabled:opacity-40 disabled:pointer-events-none',
      // Variant-specific
      variant === 'toggle' && [
        'border bg-cream text-ink',
        isActive ? 'border-ink bg-ink text-cream' : 'border-hairline hover-pink-border',
      ],
      variant === 'dropdown' && [
        'border bg-cream text-ink',
        isActive ? 'border-ink bg-ink text-cream' : 'border-hairline hover-pink-border',
      ],
      variant === 'applied' && ['border border-ink bg-cream-soft text-ink pr-1'],
      variant === 'all-filters' && [
        'border border-ink bg-cream text-ink font-semibold hover-pink-border',
      ],
      className
    );

    const ariaProps =
      variant === 'toggle'
        ? { 'aria-pressed': isActive }
        : variant === 'dropdown'
          ? { 'aria-expanded': isActive, 'aria-controls': panelId }
          : {};

    return (
      <button ref={ref} type="button" onClick={onClick} className={baseClasses} {...ariaProps}>
        {variant === 'all-filters' && (
          <SlidersHorizontal className="size-3.5" strokeWidth={2} aria-hidden="true" />
        )}
        {children}
        {count !== undefined && count > 0 && (
          <span
            className={cn(
              'inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1',
              'text-[10px] font-bold leading-none',
              isActive ? 'bg-cream text-ink' : 'bg-indigo text-cream'
            )}
          >
            {count}
          </span>
        )}
        {variant === 'dropdown' && (
          <svg
            className="ml-0.5 size-3"
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path d="m3 4.5 3 3 3-3" />
          </svg>
        )}
        {variant === 'applied' && (
          <span
            role="button"
            tabIndex={0}
            aria-label="Remove filter"
            onClick={(e) => {
              e.stopPropagation();
              onRemove?.();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                onRemove?.();
              }
            }}
            className={cn(
              'ml-1 inline-flex size-4 items-center justify-center rounded-full',
              'text-ink-muted transition-colors hover:bg-ink hover:text-cream',
              'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo'
            )}
          >
            <X className="size-3" strokeWidth={2.5} aria-hidden="true" />
          </span>
        )}
      </button>
    );
  }
);
Chip.displayName = 'Chip';
