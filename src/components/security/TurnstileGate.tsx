'use client';

import * as React from 'react';
import { Turnstile } from '@marsidev/react-turnstile';

/**
 * Cloudflare Turnstile widget. Renders nothing (and calls `onToken(null)`)
 * when `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is unset — matches the dormant
 * pattern of the server-side helper in `src/lib/turnstile.ts`.
 *
 * `appearance: 'interaction-only'` keeps the widget invisible unless
 * Cloudflare decides to escalate to a visible challenge (rare).
 */
export interface TurnstileGateProps {
  onToken: (token: string | null) => void;
  action?: string;
  className?: string;
}

export function TurnstileGate({ onToken, action, className }: TurnstileGateProps) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  React.useEffect(() => {
    if (!siteKey) onToken(null);
  }, [siteKey, onToken]);

  if (!siteKey) return null;

  return (
    <div className={className}>
      <Turnstile
        siteKey={siteKey}
        options={{ appearance: 'interaction-only', action }}
        onSuccess={onToken}
        onError={() => onToken(null)}
        onExpire={() => onToken(null)}
      />
    </div>
  );
}
