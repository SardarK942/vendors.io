'use client';
import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

type View = 'choice' | 'remove' | 'claim';

interface Props {
  open: boolean;
  vendorId: string;
  businessName: string;
  onClose: () => void;
}

export function OwnThisBusinessModal({ open, vendorId, businessName, onClose }: Props) {
  const [view, setView] = useState<View>('choice');
  const [intent, setIntent] = useState<View>('remove');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [ig, setIg] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<'remove' | 'claim' | null>(null);

  function reset() {
    setView('choice');
    setIntent('remove');
    setName('');
    setEmail('');
    setIg('');
    setReason('');
    setSubmitting(false);
    setDone(null);
  }

  function handleClose() {
    onClose();
    setTimeout(reset, 200);
  }

  async function submit(action: 'remove' | 'claim_request') {
    setSubmitting(true);
    const res = await fetch(`/api/scraped-vendors/${vendorId}/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action,
        requester_email: email,
        requester_name: name || null,
        requester_ig: ig || null,
        reason: reason || null,
      }),
    });
    setSubmitting(false);
    if (res.ok) {
      setDone(action === 'remove' ? 'remove' : 'claim');
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-md">
        {done && (
          <div className="space-y-3">
            <DialogHeader>
              <DialogTitle>
                {done === 'remove' ? 'Removal request sent' : 'Claim request sent'}
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm">
              {done === 'remove'
                ? "Thanks. We'll take this listing offline within 48 hours."
                : "Thanks. We'll DM your Instagram with a claim link within 7 days."}
            </p>
            <button
              type="button"
              onClick={handleClose}
              className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-cream"
            >
              Close
            </button>
          </div>
        )}

        {!done && view === 'choice' && (
          <div className="space-y-4">
            <DialogHeader>
              <DialogTitle>I own this business</DialogTitle>
              <DialogDescription>What would you like to do?</DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name="ownership-intent"
                  value="remove"
                  checked={intent === 'remove'}
                  onChange={() => setIntent('remove')}
                />
                <span>Remove my listing</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name="ownership-intent"
                  value="claim"
                  checked={intent === 'claim'}
                  onChange={() => setIntent('claim')}
                />
                <span>Get help claiming this business</span>
              </label>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={handleClose}
                className="rounded-md border px-3 py-1.5 text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => setView(intent)}
                className="rounded-md bg-ink px-3 py-1.5 text-sm font-medium text-cream"
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {!done && view === 'remove' && (
          <div className="space-y-4">
            <DialogHeader>
              <DialogTitle>Remove this listing</DialogTitle>
              <DialogDescription>
                We’ll take <span translate="no">{businessName}</span> offline within 48 hours.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              <label className="block">
                Email
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 w-full rounded-md border px-2 py-1.5"
                />
              </label>
              <label className="block">
                Your name (optional)
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 w-full rounded-md border px-2 py-1.5"
                />
              </label>
              <label className="block">
                Reason (optional)
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="mt-1 w-full rounded-md border px-2 py-1.5"
                />
              </label>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setView('choice')}
                className="rounded-md border px-3 py-1.5 text-sm"
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => submit('remove')}
                disabled={!email || submitting}
                className="rounded-md bg-ink px-3 py-1.5 text-sm font-medium text-cream disabled:opacity-60"
              >
                {submitting ? 'Sending…' : 'Send removal request'}
              </button>
            </div>
          </div>
        )}

        {!done && view === 'claim' && (
          <div className="space-y-4">
            <DialogHeader>
              <DialogTitle>Claim your business</DialogTitle>
              <DialogDescription>
                We verify claims via Instagram DM to prevent impersonation.
              </DialogDescription>
            </DialogHeader>
            <ol className="ml-5 list-decimal text-sm">
              <li>Confirm your Instagram handle below.</li>
              <li>Make sure your IG bio mentions your business name.</li>
              <li>We’ll DM you within 7 days with a claim link.</li>
              <li>Click the link to take ownership.</li>
            </ol>
            <div className="space-y-3 text-sm">
              <label className="block">
                Instagram handle
                <input
                  type="text"
                  required
                  value={ig}
                  onChange={(e) => setIg(e.target.value)}
                  placeholder="@yourhandle"
                  className="mt-1 w-full rounded-md border px-2 py-1.5"
                />
              </label>
              <label className="block">
                Email
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 w-full rounded-md border px-2 py-1.5"
                />
              </label>
              <label className="block">
                Your name (optional)
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 w-full rounded-md border px-2 py-1.5"
                />
              </label>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setView('choice')}
                className="rounded-md border px-3 py-1.5 text-sm"
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => submit('claim_request')}
                disabled={!email || !ig || submitting}
                className="rounded-md bg-ink px-3 py-1.5 text-sm font-medium text-cream disabled:opacity-60"
              >
                {submitting ? 'Sending…' : 'Request claim link'}
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
