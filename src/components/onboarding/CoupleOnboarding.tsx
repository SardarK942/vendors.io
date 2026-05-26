'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Onboarding, FeatureCarousel, TipsList, useOnboarding } from '@/components/ui/onboarding';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { COUPLE_FEATURES, COUPLE_TIPS, COMMISSION_CATEGORIES } from '@/lib/onboarding/welcome-data';
import { VENDOR_CATEGORY_LABELS, cn } from '@/lib/utils';
import { ArrowLeft } from 'lucide-react';

const STEP_CONFIG = [
  {
    title: 'Welcome to Baazar',
    description: "Chicago's marketplace for cultural wedding vendors. Here's what you can do.",
  },
  {
    title: 'Tell us about your event',
    description: 'Two quick questions so we can show you the most relevant vendors.',
  },
  {
    title: "You're ready to start",
    description: 'Three things to remember as you explore.',
  },
];

export interface CoupleOnboardingProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CoupleOnboarding({ open, onOpenChange }: CoupleOnboardingProps) {
  const router = useRouter();
  const [eventDate, setEventDate] = React.useState<string>('');
  const [categories, setCategories] = React.useState<string[]>([]);
  const [submitting, setSubmitting] = React.useState(false);

  async function submitOrSkip(skipped: boolean) {
    setSubmitting(true);
    try {
      const body = skipped
        ? { skipped: true, data: null }
        : {
            skipped: false,
            data: {
              event_date: eventDate || null,
              categories,
            },
          };
      await fetch('/api/users/onboarding-complete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      onOpenChange(false);
      if (!skipped) {
        router.push('/vendors');
      }
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && submitOrSkip(true)}>
      <DialogContent className="w-full max-w-[calc(100dvw-2rem)] border-none bg-transparent p-0 shadow-none sm:max-w-3xl">
        <div className="w-full rounded-2xl bg-cream-soft p-[2px] md:p-2">
          <Onboarding
            canGoNext={(step) => step === 1 || (step === 2 && categories.length >= 1) || step === 3}
            className="relative overflow-hidden rounded-2xl bg-cream p-6 md:p-8"
            maxStepValue={COUPLE_FEATURES.length - 1}
            onComplete={() => submitOrSkip(false)}
            totalSteps={3}
          >
            <CoupleHeader onSkip={() => submitOrSkip(true)} submitting={submitting} />
            <div className="my-8 min-h-[280px]">
              <Onboarding.Step step={1}>
                <CoupleFeatureStep />
              </Onboarding.Step>
              <Onboarding.Step step={2}>
                <CouplePersonalizeStep
                  eventDate={eventDate}
                  onEventDateChange={setEventDate}
                  categories={categories}
                  onCategoriesChange={setCategories}
                />
              </Onboarding.Step>
              <Onboarding.Step step={3}>
                <CoupleTipsStep />
              </Onboarding.Step>
            </div>
            <Onboarding.Navigation completeLabel="Start browsing" />
          </Onboarding>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CoupleHeader({ onSkip, submitting }: { onSkip: () => void; submitting: boolean }) {
  const { currentStep } = useOnboarding();
  const config = STEP_CONFIG[currentStep - 1];
  return (
    <DialogHeader className="relative !text-center">
      <button
        type="button"
        onClick={onSkip}
        disabled={submitting}
        className="absolute right-0 top-0 text-xs font-medium text-ink-soft transition-colors hover:text-ink"
      >
        Skip for now
      </button>
      <DialogTitle className="font-serif font-bold tracking-tight text-ink md:text-3xl">
        {config.title}
      </DialogTitle>
      <DialogDescription className="text-ink-muted md:text-base">
        {config.description}
      </DialogDescription>
      <div className="pt-3">
        <Onboarding.StepIndicator />
      </div>
    </DialogHeader>
  );
}

function CoupleFeatureStep() {
  const { stepValue, setStepValue } = useOnboarding();
  return (
    <div className="flex flex-col gap-4 md:flex-row md:gap-6">
      <FeatureCarousel
        className="order-2 flex w-full flex-col gap-3 md:order-1 md:w-1/2"
        onValueChange={setStepValue}
        totalItems={COUPLE_FEATURES.length}
        value={stepValue}
      >
        {COUPLE_FEATURES.map((feature, index) => {
          const Icon = feature.icon;
          const isActive = stepValue === index;
          return (
            <FeatureCarousel.Item index={index} key={feature.id}>
              <div
                className={cn(
                  'flex items-start gap-3 rounded-lg border p-4 text-left transition-all duration-200',
                  isActive ? 'border-indigo/30 bg-indigo/10' : 'border-hairline hover:bg-cream-soft'
                )}
              >
                <Icon
                  className={cn(
                    'mt-0.5 size-5 shrink-0',
                    isActive ? 'text-indigo' : 'text-ink-muted'
                  )}
                />
                <div>
                  <p className="text-sm font-medium text-ink">{feature.title}</p>
                  {isActive && (
                    <p className="mt-1 text-sm leading-relaxed text-ink-muted">
                      {feature.description}
                    </p>
                  )}
                </div>
              </div>
            </FeatureCarousel.Item>
          );
        })}
      </FeatureCarousel>
      <div className="order-1 w-full md:order-2 md:w-1/2">
        <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-lg border border-hairline bg-cream-soft">
          <p className="text-sm text-ink-soft">Feature preview</p>
        </div>
      </div>
    </div>
  );
}

function CouplePersonalizeStep({
  eventDate,
  onEventDateChange,
  categories,
  onCategoriesChange,
}: {
  eventDate: string;
  onEventDateChange: (v: string) => void;
  categories: string[];
  onCategoriesChange: (v: string[]) => void;
}) {
  const [question, setQuestion] = React.useState(categories.length > 0 ? 2 : 1);

  return (
    <div className="flex flex-col gap-4">
      {question === 1 ? (
        <div className="flex flex-col gap-4" key="q1">
          <div className="flex items-center gap-2">
            <span className="inline-flex size-6 items-center justify-center rounded-lg bg-cream-soft text-sm text-ink-muted">
              1
            </span>
            <span className="text-base font-medium text-ink">When&apos;s the big day?</span>
          </div>
          <DatePicker selected={eventDate} onSelect={onEventDateChange} />
          <div className="flex items-center justify-between">
            <Button
              className="text-sm text-ink-muted hover:text-ink"
              onClick={() => {
                onEventDateChange('');
                setQuestion(2);
              }}
              type="button"
              size="sm"
              variant="ghost"
            >
              Still figuring it out →
            </Button>
            <Button type="button" size="sm" onClick={() => setQuestion(2)} disabled={!eventDate}>
              Next question
            </Button>
          </div>
          <p className="text-sm text-ink-muted">Question 1 of 2</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4" key="q2">
          <div className="flex items-center gap-2">
            <span className="inline-flex size-6 items-center justify-center rounded-lg bg-cream-soft text-sm text-ink-muted">
              2
            </span>
            <span className="text-base font-medium text-ink">
              Which vendors are top priority? (pick 1–5)
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-3">
            {COMMISSION_CATEGORIES.map((slug) => {
              const isSelected = categories.includes(slug);
              return (
                <button
                  key={slug}
                  type="button"
                  onClick={() => {
                    if (isSelected) {
                      onCategoriesChange(categories.filter((c) => c !== slug));
                    } else if (categories.length < 5) {
                      onCategoriesChange([...categories, slug]);
                    }
                  }}
                  className={cn(
                    'flex cursor-pointer items-center gap-2.5 rounded-lg border px-4 py-3 text-left text-sm transition-all duration-200',
                    isSelected
                      ? 'border-indigo/30 bg-indigo/10 text-ink'
                      : 'border-hairline bg-cream text-ink hover:bg-cream-soft'
                  )}
                >
                  <span>{VENDOR_CATEGORY_LABELS[slug] ?? slug}</span>
                </button>
              );
            })}
          </div>
          <div className="flex items-center justify-between">
            <Button
              className="text-sm text-ink-muted hover:text-ink"
              onClick={() => setQuestion(1)}
              type="button"
              size="sm"
              variant="ghost"
            >
              <ArrowLeft className="size-4" />
              Back to question 1
            </Button>
            <p className="text-sm text-ink-muted">{categories.length}/5 · Question 2 of 2</p>
          </div>
        </div>
      )}
    </div>
  );
}

function CoupleTipsStep() {
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-stretch md:gap-6">
      <div className="order-2 w-full md:order-1 md:w-1/2">
        <TipsList className="flex h-full flex-col gap-4" title="Tips">
          {COUPLE_TIPS.map((tip) => (
            <TipsList.Item className="flex items-start gap-3" key={tip.number} number={tip.number}>
              <p className="text-sm leading-relaxed text-ink">{tip.text}</p>
            </TipsList.Item>
          ))}
        </TipsList>
      </div>
      <div className="order-1 w-full md:order-2 md:w-1/2">
        <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-lg border border-hairline bg-cream-soft">
          <p className="text-sm text-ink-soft">Tips preview</p>
        </div>
      </div>
    </div>
  );
}
