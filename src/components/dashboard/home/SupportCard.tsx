import * as React from 'react';
import { Lightbulb } from 'lucide-react';

export function SupportCard() {
  return (
    <div className="rounded-2xl border border-haldi/30 bg-haldi/15 p-4">
      <div className="flex items-center gap-2">
        <Lightbulb className="size-4 text-haldi" aria-hidden="true" />
        <p className="text-sm font-semibold text-ink">Need help?</p>
      </div>
      <p className="mt-1 text-xs text-ink-muted">Our support team is here for you.</p>
      {/* TODO(backend): real support channel */}
      <a
        href="mailto:support@baazar.io"
        className="mt-2 inline-block text-xs font-semibold text-indigo"
      >
        Contact Support →
      </a>
    </div>
  );
}
