import * as React from 'react';
import { Lightbulb, type LucideIcon } from 'lucide-react';

interface SupportCardProps {
  /** Heading. Defaults to the generic dashboard support prompt. */
  title?: string;
  /** Body copy under the heading. */
  description?: string;
  /** Action link label (an arrow is appended). */
  actionLabel?: string;
  /** Action href — a mailto: or route. */
  actionHref?: string;
  /** Leading icon. Defaults to a lightbulb. */
  icon?: LucideIcon;
}

/**
 * The "Need help?" rail card. Shared across the vendor dashboard (Home, the
 * package editor, …) so the support prompt stays visually consistent; copy and
 * target are overridable per surface.
 */
export function SupportCard({
  title = 'Need help?',
  description = 'Our support team is here for you.',
  actionLabel = 'Contact Support',
  actionHref = 'mailto:support@baazar.io',
  icon: Icon = Lightbulb,
}: SupportCardProps = {}) {
  return (
    <div className="rounded-2xl border border-haldi/30 bg-haldi/15 p-4">
      <div className="flex items-center gap-2">
        <Icon className="size-4 text-haldi" aria-hidden="true" />
        <p className="text-sm font-semibold text-ink">{title}</p>
      </div>
      <p className="mt-1 text-xs text-ink-muted">{description}</p>
      {/* TODO(backend): real support channel */}
      <a href={actionHref} className="mt-2 inline-block text-xs font-semibold text-indigo">
        {actionLabel} →
      </a>
    </div>
  );
}
