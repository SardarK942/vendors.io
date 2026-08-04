import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

interface PricingModelChoiceProps {
  vendorSlug: string;
}

// Post-publish choice shown once at /dashboard/profile/packages?just_onboarded=1.
// Two symmetric cards let the vendor state their pricing model so we route them to
// the right next action instead of guessing. No persistent state — the URL flag is
// the only signal. Returning vendors get the regular empty-state / listing paths.
export function PricingModelChoice({ vendorSlug }: PricingModelChoiceProps) {
  return (
    <section
      className="rounded-lg border border-green-500/30 bg-green-500/10 p-6"
      role="status"
      aria-live="polite"
      aria-label="Profile is live"
    >
      <div className="mb-5">
        <h2 className="text-lg font-semibold">
          <span aria-hidden="true">🎉</span> Profile is live!
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          How do you usually price? Pick one so we can point you to the right next step.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <ChoiceCard
          title="I sell fixed pricing tiers"
          examples="e.g. 3-hour photobooth, bridal MUA package, DJ hourly rates"
          calloutIcon="⚡"
          calloutText="You approve every final price. Every package request comes to you first — accept as-is, adjust, or counter before it's booked."
          calloutTone="pink"
          ctaLabel="+ Add your first package"
          ctaHref="/dashboard/profile/packages/new"
          ctaTone="primary"
        />
        <ChoiceCard
          title="I quote every event custom"
          examples="e.g. photographer, caterer, venue, planner, decor"
          calloutIcon="✅"
          calloutText="You're all set. Couples can already send quote requests directly from your profile."
          calloutTone="neutral"
          ctaLabel="View your live profile →"
          ctaHref={`/vendors/${vendorSlug}`}
          ctaTone="secondary"
        />
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        You can always change your mind — packages can be added or removed anytime.
      </p>
    </section>
  );
}

interface ChoiceCardProps {
  title: string;
  examples: string;
  calloutIcon: string;
  calloutText: string;
  calloutTone: 'pink' | 'neutral';
  ctaLabel: string;
  ctaHref: string;
  ctaTone: 'primary' | 'secondary';
}

function ChoiceCard({
  title,
  examples,
  calloutIcon,
  calloutText,
  calloutTone,
  ctaLabel,
  ctaHref,
  ctaTone,
}: ChoiceCardProps) {
  const calloutClasses =
    calloutTone === 'pink'
      ? 'bg-hot-pink/10 text-ink'
      : 'bg-cream text-ink';

  return (
    <Card className="flex flex-col bg-white">
      <CardContent className="flex flex-1 flex-col gap-4 p-5">
        <div>
          <h3 className="text-base font-semibold text-ink">{title}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{examples}</p>
        </div>

        <div className={`flex-1 rounded-md p-3 text-sm ${calloutClasses}`}>
          <span aria-hidden="true" className="mr-1.5">
            {calloutIcon}
          </span>
          {calloutText}
        </div>

        <Button
          asChild
          size="lg"
          className={
            ctaTone === 'primary'
              ? 'bg-hot-pink text-cream hover:-translate-y-px hover:bg-hot-pink/90 hover:shadow-pink motion-reduce:hover:translate-y-0'
              : ''
          }
          variant={ctaTone === 'primary' ? 'default' : 'outline'}
        >
          <Link href={ctaHref}>{ctaLabel}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
