'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export interface SegmentButtonProps {
  /** Uppercase label rendered at the top (e.g. "When"). */
  label: string;
  /** The current value to display below the label. Renders muted when `isPlaceholder` is true. */
  value: string;
  /** Whether the value shown is a placeholder (empty state) — renders ink-muted + italic for What. */
  isPlaceholder?: boolean;
  /** True when this segment is the active (open-panel) one. */
  isActive?: boolean;
  /** Whether this segment expects a free-text-input-style appearance (wider, italic placeholder). */
  isFreeText?: boolean;
  /** ID of the panel this button controls (for aria-controls). */
  panelId?: string;
  /** Click handler. Should toggle the active state in the parent. */
  onClick?: () => void;
  /** Forwarded for keyboard nav. */
  onKeyDown?: (e: React.KeyboardEvent<HTMLButtonElement>) => void;
}

/**
 * Presentational segment trigger inside the search pill. Owns no state — parent decides
 * active/value. Renders as a focusable button with label on top and value below.
 */
export const SegmentButton = React.forwardRef<HTMLButtonElement, SegmentButtonProps>(
  ({ label, value, isPlaceholder, isActive, isFreeText, panelId, onClick, onKeyDown }, ref) => {
    return (
      <button
        ref={ref}
        type="button"
        onClick={onClick}
        onKeyDown={onKeyDown}
        aria-expanded={isActive ?? false}
        aria-controls={panelId}
        className={cn(
          'duration-[180ms] ease-[cubic-bezier(.22,1,.36,1)] flex flex-col items-start justify-center text-left transition-all',
          'h-full px-5 focus-visible:outline-none lg:px-6',
          isFreeText && 'min-w-[220px] flex-1',
          // Non-active: hover bg + visible separator handled by parent
          !isActive && 'hover:bg-cream-soft',
          // Active: ink-inset ring, cream fill, soft lift shadow, fully rounded
          isActive &&
            'relative z-10 rounded-full bg-cream shadow-[inset_0_0_0_2px_var(--ink),_0_4px_12px_rgba(27,20,20,0.10)]'
        )}
      >
        <span className="mb-1 text-[10px] font-bold uppercase leading-none tracking-[0.12em] text-ink">
          {label}
        </span>
        <span
          className={cn(
            'whitespace-nowrap text-[13px] leading-tight',
            isPlaceholder && isFreeText && 'italic text-ink-soft',
            isPlaceholder && !isFreeText && 'text-ink-muted',
            !isPlaceholder && 'font-medium text-ink'
          )}
        >
          {value}
        </span>
      </button>
    );
  }
);
SegmentButton.displayName = 'SegmentButton';
