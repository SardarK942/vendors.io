'use client';

import * as React from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { CustomRequestFlow } from './CustomRequestFlow';
import type { EventOption } from '@/components/events/EventFunctionSelect';
import { track } from '@/lib/analytics/track';
import { ANALYTICS_EVENTS } from '@/lib/analytics/events';

export interface CustomRequestModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vendorSlug: string;
  vendorBusinessName: string;
  vendorCategory: string;
  vendorResponseSlaHours: number | null;
  eventOptions?: EventOption[];
}

export function CustomRequestModal({
  open,
  onOpenChange,
  vendorSlug,
  vendorBusinessName,
  vendorCategory,
  vendorResponseSlaHours,
  eventOptions,
}: CustomRequestModalProps) {
  // Fires once per open — covers every trigger that flips `open` to true
  // (package grid card, sticky rail, bottom bar, no-packages panel).
  React.useEffect(() => {
    if (open) track(ANALYTICS_EVENTS.QUOTE_REQUEST_STARTED);
  }, [open]);

  // Google Places renders its predictions dropdown (`.pac-container`) into
  // document.body — outside the Radix dialog. Without this guard, clicking a
  // prediction counts as an "interact outside" and Radix dismisses / refocuses
  // before Google's place_changed fires, so the venue never registers and the
  // field looks un-clickable. Guard every outside-interaction path so a click
  // on the dropdown is left alone.
  const keepOpenForPlaces = (event: {
    detail: { originalEvent: Event };
    preventDefault: () => void;
  }) => {
    const target = event.detail.originalEvent.target as Element | null;
    if (target?.closest('.pac-container')) {
      event.preventDefault();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-3xl overflow-hidden bg-cream p-0"
        onPointerDownOutside={keepOpenForPlaces}
        onInteractOutside={keepOpenForPlaces}
        onFocusOutside={keepOpenForPlaces}
      >
        <div
          className="h-[3px] w-full bg-gradient-to-r from-indigo via-indigo to-hot-pink"
          aria-hidden
        />
        <div className="max-h-[80vh] overflow-y-auto px-8 py-6">
          <DialogTitle className="sr-only">Custom quote request — {vendorBusinessName}</DialogTitle>
          <DialogDescription className="sr-only">
            Send a custom quote request to {vendorBusinessName}.
          </DialogDescription>
          <CustomRequestFlow
            vendorSlug={vendorSlug}
            vendorBusinessName={vendorBusinessName}
            vendorCategory={vendorCategory}
            vendorResponseSlaHours={vendorResponseSlaHours}
            eventOptions={eventOptions}
            onClose={() => onOpenChange(false)}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
