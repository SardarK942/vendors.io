'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface Props {
  currentEmail: string;
}

export function EmailChangeForm({ currentEmail }: Props) {
  const [email, setEmail] = useState(currentEmail);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch('/api/settings/email', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ new_email: email }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error ?? 'Failed to update email.');
        return;
      }
      toast.success('Confirmation emails sent.');
      setSent(true);
    } catch {
      toast.error('Network error, please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="new_email">New email address</Label>
        <Input
          id="new_email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          disabled={sent || busy}
        />
      </div>
      <div className="rounded-md border border-indigo/[.18] bg-indigo/[.06] p-3 text-sm text-ink-muted">
        <strong className="font-semibold text-indigo">Heads up —</strong> We&apos;ll send
        confirmation links to both your old and new email. The change takes effect once both are
        clicked.
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={busy || sent}>
          {sent ? 'Check your inbox' : busy ? 'Sending…' : 'Update email'}
        </Button>
      </div>
    </form>
  );
}
