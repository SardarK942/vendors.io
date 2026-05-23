'use client';

import * as React from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { cn } from '@/lib/utils';

const TooltipProvider = TooltipPrimitive.Provider;

const TooltipRoot = TooltipPrimitive.Root;

const TooltipTrigger = TooltipPrimitive.Trigger;

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 6, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        // M+ surface — ink panel, cream text
        'z-50 overflow-hidden rounded-sm bg-ink px-2.5 py-1.5',
        'font-sans text-[12px] font-medium leading-[1.4] text-cream',
        // Animation — 150ms fade-in, ease-out
        'animate-in fade-in-0 zoom-in-95',
        'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
        'data-[side=bottom]:slide-in-from-top-1',
        'data-[side=left]:slide-in-from-right-1',
        'data-[side=right]:slide-in-from-left-1',
        'data-[side=top]:slide-in-from-bottom-1',
        className
      )}
      {...props}
    />
  </TooltipPrimitive.Portal>
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  delayDuration?: number;
}

/**
 * Self-contained tooltip — pairs naturally with icon-only Buttons.
 * Usage: <Tooltip content="Save"><Button iconLeading={Heart} aria-label="Save" /></Tooltip>
 *
 * `children` must render a single DOM element (asChild forwards the ref). Plain text or
 * fragments will not work — wrap them in a span if needed.
 *
 * 400ms open delay (faster than Radix default 700ms). Each instance carries its own
 * Provider; Radix handles nested providers gracefully if the consumer also wraps a
 * higher-level Provider at the layout level.
 */
const Tooltip = ({ content, children, side = 'top', delayDuration = 400 }: TooltipProps) => (
  <TooltipProvider delayDuration={delayDuration} skipDelayDuration={100}>
    <TooltipRoot>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side}>{content}</TooltipContent>
    </TooltipRoot>
  </TooltipProvider>
);

export { Tooltip, TooltipProvider, TooltipRoot, TooltipTrigger, TooltipContent };
