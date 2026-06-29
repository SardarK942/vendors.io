'use client';

import * as React from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Title Case sentence. */
  title: string;
  /** Optional body copy rendered under the title. */
  description?: React.ReactNode;
  /** Title Case, specific action verb (e.g. "Cancel Booking", "File Dispute"). */
  confirmLabel: string;
  /** Defaults to "Keep Booking" when destructive, "Cancel" otherwise. */
  cancelLabel?: string;
  /** Styles confirm button as destructive (hot-pink / error). */
  destructive?: boolean;
  /** When set, user must type this exact string before the confirm button enables. */
  typedConfirm?: string;
  /** Controlled busy state; the parent owns the actual mutation. */
  busy?: boolean;
  /** Parent handles the action and is responsible for closing the dialog on success. */
  onConfirm: () => void | Promise<void>;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel,
  destructive = false,
  typedConfirm,
  busy = false,
  onConfirm,
}: ConfirmDialogProps): React.JSX.Element {
  const [typed, setTyped] = React.useState('');
  const inputId = React.useId();

  // Reset typed state whenever the dialog closes.
  React.useEffect(() => {
    if (!open) setTyped('');
  }, [open]);

  const typedOk = typedConfirm == null || typed === typedConfirm;
  const confirmDisabled = busy || !typedOk;

  const resolvedCancelLabel = cancelLabel ?? (destructive ? 'Keep Booking' : 'Cancel');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="[overscroll-behavior:contain] sm:max-w-md"
        onPointerDownOutside={(e) => {
          if (busy) e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (busy) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description != null && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        {typedConfirm != null && (
          <div className="space-y-2 py-1">
            <Label htmlFor={inputId} className="text-sm">
              Type <span className="font-mono font-semibold">{typedConfirm}</span> to confirm.
            </Label>
            <Input
              id={inputId}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              disabled={busy}
              aria-describedby={`${inputId}-hint`}
            />
            <p id={`${inputId}-hint`} className="sr-only">
              Type the exact phrase shown above to enable the confirm button.
            </p>
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            // Cancel stays enabled during the mutation so the user can dismiss
            // the dialog. The parent owns aborting the actual request.
          >
            {resolvedCancelLabel}
          </Button>
          <Button
            variant={destructive ? 'destructive' : 'primary'}
            onClick={() => {
              void onConfirm();
            }}
            disabled={confirmDisabled}
            aria-busy={busy || undefined}
          >
            {busy && (
              <Loader2
                className="size-3.5 animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
            )}
            {busy ? `${confirmLabel} …` : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ConfirmDialog;
