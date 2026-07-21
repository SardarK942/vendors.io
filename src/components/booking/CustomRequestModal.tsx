'use client';

import * as React from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { CustomRequestFlow } from './CustomRequestFlow';
import type { EventOption } from '@/components/events/EventFunctionSelect';

export interface CustomRequestModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vendorSlug: string;
  vendorBusinessName: string;
  vendorResponseSlaHours: number | null;
  eventOptions?: EventOption[];
}

export function CustomRequestModal({
  open,
  onOpenChange,
  vendorSlug,
  vendorBusinessName,
  vendorResponseSlaHours,
  eventOptions,
}: CustomRequestModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl overflow-hidden bg-cream p-0">
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
            vendorResponseSlaHours={vendorResponseSlaHours}
            eventOptions={eventOptions}
            onClose={() => onOpenChange(false)}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
