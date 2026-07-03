'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  CalendarCheck,
  Inbox,
  LayoutGrid,
  PartyPopper,
  SlidersHorizontal,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FeatureCarousel, Onboarding, useOnboarding } from '@/components/ui/onboarding';
import { CULTURAL_EVENT_TYPES, GENERAL_EVENT_TYPES } from '@/types';
import { SAMPLE_VENDOR_REQUESTS } from '@/lib/onboarding/sample-vendor-requests';
import { cn } from '@/lib/utils';

// ─── Content ──────────────────────────────────────────────────────────────────

const FLOW_STEPS = [
  {
    id: 'list',
    icon: LayoutGrid,
    title: 'List your packages',
    description: 'Starting prices, add-ons, guest counts. Your packages appear in the marketplace.',
    card: {
      badge: 'Marketplace',
      headline: 'Your work, live on Baazar.',
      body: 'Set a starting price, add-ons, and photos once. Couples find you across search, category pages, and event-type filters.',
    },
  },
  {
    id: 'requests',
    icon: Inbox,
    title: 'Get requests',
    description: 'Couples browse listings and send booking requests to your inbox.',
    card: {
      badge: 'Inbox',
      headline: 'Booking requests, one place.',
      body: 'Every request lands in your dashboard with the event details — date, guest count, event type, and budget signal.',
    },
  },
  {
    id: 'quote',
    icon: SlidersHorizontal,
    title: 'Send a quote',
    description: 'Your package price is a starting point — adjust per event if scope changes.',
    card: {
      badge: 'Yours to set',
      headline: 'Adjust the price when the event needs it.',
      body: 'Your listed package price is a starting point. Send a counter-quote per booking when guest counts, hours, or add-ons change what the event actually needs.',
    },
  },
  {
    id: 'deposit',
    icon: CalendarCheck,
    title: 'Deposit locks the date',
    description:
      'Couple pays a 5% deposit via Stripe. The date is held on your calendar automatically.',
    card: {
      badge: '5% via Stripe',
      headline: 'Deposit paid, date is yours.',
      body: 'When the couple pays the 5% deposit through Stripe, the event date is held on your calendar and the booking moves from pending to confirmed.',
    },
  },
  {
    id: 'deliver',
    icon: PartyPopper,
    title: 'Deliver + settle',
    description:
      'You run the event. Remaining 95% is settled with the couple directly, off-platform.',
    card: {
      badge: 'Off-platform',
      headline: 'Deliver the event, get paid.',
      body: 'You run the event, mark it complete, and settle the remaining 95% with the couple directly — cash, transfer, whatever works between the two of you.',
    },
  },
] as const;

const HEADER_CONFIG = [
  {
    title: 'How Baazar works',
    description: "Every request follows the same path — here's the flow, lead to event.",
  },
  {
    title: 'What types of events do you serve?',
    description: 'Pick 1–5. You can change this later.',
  },
  {
    title: "Here's what customer requests look like",
    description: 'A quick preview of what shows up in your inbox.',
  },
];

const TOTAL_STEPS = 3;
const MAX_STEP_VALUE = FLOW_STEPS.length - 1;

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function VendorOnboarding({ open, onOpenChange }: Props): React.JSX.Element {
  const router = useRouter();
  const [eventTypes, setEventTypes] = React.useState<string[]>([]);
  const [submitting, setSubmitting] = React.useState(false);

  async function submitOnboarding(skipped: boolean) {
    setSubmitting(true);
    try {
      const body = skipped
        ? { skipped: true, data: null }
        : { skipped: false, data: { event_types: eventTypes } };
      await fetch('/api/users/onboarding-complete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!skipped && eventTypes.length > 0) {
        await fetch('/api/vendor-profile/setup/event-types', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ served_event_types: eventTypes }),
        }).catch(() => {});
      }
    } finally {
      setSubmitting(false);
      onOpenChange(false);
      router.push('/dashboard/profile/setup/basics');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <Onboarding
          canGoNext={(step) => step !== 2 || eventTypes.length >= 1}
          className="!rounded-none !border-0 !bg-transparent !p-0 !shadow-none"
          maxStepValue={MAX_STEP_VALUE}
          totalSteps={TOTAL_STEPS}
          onComplete={() => submitOnboarding(false)}
        >
          <VendorOnboardingHeader />
          <div className="my-6 min-h-[340px]">
            <Onboarding.Step step={1}>
              <FlowStep />
            </Onboarding.Step>
            <Onboarding.Step step={2}>
              <EventTypesStep eventTypes={eventTypes} setEventTypes={setEventTypes} />
            </Onboarding.Step>
            <Onboarding.Step step={3}>
              <SampleRequestsStep />
            </Onboarding.Step>
          </div>
          <VendorOnboardingNav submitting={submitting} onSkip={() => submitOnboarding(true)} />
        </Onboarding>
      </DialogContent>
    </Dialog>
  );
}

// ─── Header ───────────────────────────────────────────────────────────────────

function VendorOnboardingHeader() {
  const { currentStep } = useOnboarding();
  const config = HEADER_CONFIG[currentStep - 1];

  return (
    <DialogHeader className="!text-center">
      <DialogTitle className="text-balance font-serif text-2xl font-normal tracking-tight text-ink md:text-3xl">
        {config.title}
      </DialogTitle>
      <DialogDescription className="text-ink/70 md:text-base">
        {config.description}
      </DialogDescription>
      <div className="pt-3">
        <Onboarding.StepIndicator />
      </div>
    </DialogHeader>
  );
}

// ─── Step 1: Flow explanation ─────────────────────────────────────────────────

function FlowStep() {
  const { stepValue, setStepValue } = useOnboarding();
  const active = FLOW_STEPS[stepValue];
  const ActiveIcon = active.icon;

  return (
    <div className="flex flex-col gap-4 md:flex-row md:gap-6">
      {/* Left: feature list */}
      <FeatureCarousel
        className="order-2 flex w-full flex-col gap-1 md:order-1 md:w-1/2"
        onValueChange={setStepValue}
        totalItems={FLOW_STEPS.length}
        value={stepValue}
      >
        {FLOW_STEPS.map((step, index) => {
          const Icon = step.icon;
          const isActive = stepValue === index;
          return (
            <FeatureCarousel.Item
              className="w-full rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo focus-visible:ring-offset-2 focus-visible:ring-offset-cream"
              index={index}
              key={step.id}
            >
              <div
                className={cn(
                  'flex items-start gap-3 rounded-lg border p-3 transition-colors',
                  isActive
                    ? 'border-indigo/25 bg-indigo/[.08]'
                    : 'border-transparent hover:bg-cream-soft'
                )}
              >
                <Icon
                  aria-hidden="true"
                  className={cn('mt-0.5 size-5 shrink-0', isActive ? 'text-indigo' : 'text-ink/50')}
                />
                <div className="min-w-0">
                  <span
                    className={cn(
                      'block font-mono text-[10px] uppercase tracking-widest',
                      isActive ? 'text-indigo' : 'text-ink/50'
                    )}
                  >
                    Step 0{index + 1}
                  </span>
                  <p className="mt-0.5 text-sm font-semibold text-ink">{step.title}</p>
                  {isActive && (
                    <p className="mt-1 text-sm leading-relaxed text-ink/70">{step.description}</p>
                  )}
                </div>
              </div>
            </FeatureCarousel.Item>
          );
        })}
      </FeatureCarousel>

      {/* Right: brand card */}
      <div className="order-1 w-full md:order-2 md:w-1/2">
        <div className="relative aspect-[4/3] overflow-hidden rounded-xl border border-hairline bg-gradient-to-br from-cream-soft to-cream p-6">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-indigo/[.18] blur-3xl"
          />
          <div className="relative flex h-full flex-col justify-between">
            <div className="flex items-start justify-between gap-2">
              <span className="font-mono text-[10px] uppercase tracking-widest text-ink/50">
                Step 0{stepValue + 1} · {active.title}
              </span>
              <span className="rounded-full bg-indigo/[.08] px-2.5 py-1 font-mono text-[9px] uppercase tracking-widest text-indigo">
                {active.card.badge}
              </span>
            </div>
            <div className="flex size-14 items-center justify-center rounded-2xl bg-ink text-cream">
              <ActiveIcon className="size-6" aria-hidden="true" />
            </div>
            <div className="flex flex-col gap-1.5">
              <p className="text-balance font-serif text-xl font-normal leading-tight tracking-tight text-ink">
                {active.card.headline}
              </p>
              <p className="text-pretty text-[13px] leading-relaxed text-ink/70">
                {active.card.body}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Step 2: Event types (multi-select chips) ─────────────────────────────────

function EventTypesStep({
  eventTypes,
  setEventTypes,
}: {
  eventTypes: string[];
  setEventTypes: (types: string[]) => void;
}) {
  const allTypes = [...CULTURAL_EVENT_TYPES, ...GENERAL_EVENT_TYPES];

  return (
    <div className="flex flex-wrap justify-center gap-2">
      {allTypes.map((t) => {
        const isSelected = eventTypes.includes(t.id);
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              if (isSelected) {
                setEventTypes(eventTypes.filter((c) => c !== t.id));
              } else if (eventTypes.length < 5) {
                setEventTypes([...eventTypes, t.id]);
              }
            }}
            className={
              isSelected
                ? 'rounded-full bg-ink px-3 py-1 text-sm text-cream focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo focus-visible:ring-offset-2 focus-visible:ring-offset-cream'
                : 'rounded-full border border-ink/20 px-3 py-1 text-sm text-ink hover-pink-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo focus-visible:ring-offset-2 focus-visible:ring-offset-cream'
            }
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Step 3: Sample requests ──────────────────────────────────────────────────

function SampleRequestsStep() {
  return (
    <div className="space-y-3">
      {SAMPLE_VENDOR_REQUESTS.map((req, i) => (
        <div key={i} className="rounded-lg border border-hairline bg-cream-soft p-4">
          <p className="text-sm font-medium text-ink">{req.event_type}</p>
          <p className="mt-1 text-xs text-ink/70">
            {req.date} · {req.guest_count} guests · {req.budget_range}
          </p>
        </div>
      ))}
    </div>
  );
}

// ─── Navigation ───────────────────────────────────────────────────────────────

function VendorOnboardingNav({ submitting, onSkip }: { submitting: boolean; onSkip: () => void }) {
  const { currentStep, totalSteps, canGoNext, canGoBack, handleBack, handleNext, handleComplete } =
    useOnboarding();
  const isLastStep = currentStep === totalSteps;

  return (
    <div className="flex flex-col gap-3 pt-2">
      <div className="flex gap-3">
        {canGoBack && (
          <button
            type="button"
            onClick={handleBack}
            className="rounded-md border border-ink/20 px-4 py-3 text-sm font-medium text-ink transition-colors hover:bg-cream-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo focus-visible:ring-offset-2 focus-visible:ring-offset-cream"
          >
            Back
          </button>
        )}
        <button
          type="button"
          disabled={!canGoNext || submitting}
          onClick={isLastStep ? handleComplete : handleNext}
          className="flex-1 rounded-md bg-ink py-3 font-medium text-cream transition-[transform,background-color] hover:bg-hot-pink active:scale-[0.96] disabled:opacity-50 motion-reduce:active:scale-100"
        >
          <span className="inline-flex items-center justify-center gap-1.5">
            {isLastStep ? 'Set up your profile' : 'Continue'}
            <ArrowRight className="size-4 translate-y-[0.5px]" aria-hidden="true" />
          </span>
        </button>
      </div>
      <button
        type="button"
        onClick={onSkip}
        disabled={submitting}
        className="text-center text-xs text-ink/60 transition-[transform,color] hover:text-hot-pink active:scale-[0.96] motion-reduce:active:scale-100"
      >
        Skip for now
      </button>
    </div>
  );
}
