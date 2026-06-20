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
import {
  Onboarding,
  ChoiceGroup,
  FeatureCarousel,
  TipsList,
  useOnboarding,
} from '@/components/ui/onboarding';
import { Button } from '@/components/ui/button';
import {
  VENDOR_FEATURES,
  VENDOR_TIPS,
  YEARS_IN_BUSINESS,
  COMMISSION_CATEGORIES,
  type YearsInBusiness,
} from '@/lib/onboarding/welcome-data';
import { VENDOR_CATEGORY_LABELS, cn } from '@/lib/utils';
import { ArrowLeft } from 'lucide-react';

const STEP_CONFIG = [
  {
    title: 'Welcome to Baazar for vendors',
    description: "Get discovered by Chicago customers. Here's how it works.",
  },
  {
    title: 'Tell us about your business',
    description: 'Two quick questions to set up your profile.',
  },
  {
    title: "You're ready to publish",
    description: 'Three things to remember as you build out your profile.',
  },
];

const YEARS_LABELS: Record<YearsInBusiness, string> = {
  '0-1': 'Less than 1 year',
  '1-3': '1–3 years',
  '3-10': '3–10 years',
  '10+': '10+ years',
};

export interface VendorOnboardingProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function VendorOnboarding({ open, onOpenChange }: VendorOnboardingProps) {
  const router = useRouter();
  const [category, setCategory] = React.useState<string>('');
  const [yearsInBusiness, setYearsInBusiness] = React.useState<YearsInBusiness | ''>('');
  const [submitting, setSubmitting] = React.useState(false);

  async function submitOrSkip(skipped: boolean) {
    setSubmitting(true);
    try {
      const body = skipped
        ? { skipped: true, data: null }
        : {
            skipped: false,
            data: {
              category,
              years_in_business: yearsInBusiness,
            },
          };
      await fetch('/api/users/onboarding-complete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      onOpenChange(false);
      if (!skipped) {
        router.push('/dashboard/profile/setup/basics');
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
            canGoNext={(step) =>
              step === 1 || (step === 2 && category !== '' && yearsInBusiness !== '') || step === 3
            }
            className="relative overflow-hidden rounded-2xl bg-cream p-6 md:p-8"
            maxStepValue={VENDOR_FEATURES.length - 1}
            onComplete={() => submitOrSkip(false)}
            totalSteps={3}
          >
            <VendorHeader onSkip={() => submitOrSkip(true)} submitting={submitting} />
            <div className="my-8 min-h-[280px]">
              <Onboarding.Step step={1}>
                <VendorFeatureStep />
              </Onboarding.Step>
              <Onboarding.Step step={2}>
                <VendorPersonalizeStep
                  category={category}
                  onCategoryChange={setCategory}
                  yearsInBusiness={yearsInBusiness}
                  onYearsChange={setYearsInBusiness}
                />
              </Onboarding.Step>
              <Onboarding.Step step={3}>
                <VendorTipsStep />
              </Onboarding.Step>
            </div>
            <Onboarding.Navigation completeLabel="Build my profile" />
          </Onboarding>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function VendorHeader({ onSkip, submitting }: { onSkip: () => void; submitting: boolean }) {
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

function VendorFeatureStep() {
  const { stepValue, setStepValue } = useOnboarding();
  return (
    <div className="flex flex-col gap-4 md:flex-row md:gap-6">
      <FeatureCarousel
        className="order-2 flex w-full flex-col gap-3 md:order-1 md:w-1/2"
        onValueChange={setStepValue}
        totalItems={VENDOR_FEATURES.length}
        value={stepValue}
      >
        {VENDOR_FEATURES.map((feature, index) => {
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

function VendorPersonalizeStep({
  category,
  onCategoryChange,
  yearsInBusiness,
  onYearsChange,
}: {
  category: string;
  onCategoryChange: (v: string) => void;
  yearsInBusiness: YearsInBusiness | '';
  onYearsChange: (v: YearsInBusiness) => void;
}) {
  const [question, setQuestion] = React.useState(category && yearsInBusiness ? 2 : 1);

  return (
    <div className="flex flex-col gap-4">
      {question === 1 ? (
        <div className="flex flex-col gap-4" key="q1">
          <div className="flex items-center gap-2">
            <span className="inline-flex size-6 items-center justify-center rounded-lg bg-cream-soft text-sm text-ink-muted">
              1
            </span>
            <span className="text-base font-medium text-ink">
              Which category best describes your business?
            </span>
          </div>
          <ChoiceGroup
            className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-3"
            name="vendor-category"
            onValueChange={(v) => {
              onCategoryChange(v);
              setTimeout(() => setQuestion(2), 300);
            }}
            orientation="grid"
            value={category}
          >
            {COMMISSION_CATEGORIES.map((slug) => {
              const isSelected = category === slug;
              return (
                <ChoiceGroup.Item
                  className={cn(
                    'flex cursor-pointer items-center gap-2.5 rounded-lg border px-4 py-3 text-left text-sm transition-all duration-200',
                    isSelected
                      ? 'border-indigo/30 bg-indigo/10 text-ink'
                      : 'border-hairline bg-cream text-ink hover:bg-cream-soft'
                  )}
                  key={slug}
                  value={slug}
                >
                  <span>{VENDOR_CATEGORY_LABELS[slug] ?? slug}</span>
                </ChoiceGroup.Item>
              );
            })}
          </ChoiceGroup>
          <p className="text-sm text-ink-muted">Question 1 of 2</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4" key="q2">
          <div className="flex items-center gap-2">
            <span className="inline-flex size-6 items-center justify-center rounded-lg bg-cream-soft text-sm text-ink-muted">
              2
            </span>
            <span className="text-base font-medium text-ink">
              How long have you been in business?
            </span>
          </div>
          <ChoiceGroup
            className="grid grid-cols-2 gap-2 sm:gap-3"
            name="years-in-business"
            onValueChange={(v) => {
              onYearsChange(v as YearsInBusiness);
            }}
            orientation="grid"
            value={yearsInBusiness}
          >
            {YEARS_IN_BUSINESS.map((bucket) => {
              const isSelected = yearsInBusiness === bucket;
              return (
                <ChoiceGroup.Item
                  className={cn(
                    'flex cursor-pointer items-center gap-2.5 rounded-lg border px-4 py-3 text-left text-sm transition-all duration-200',
                    isSelected
                      ? 'border-indigo/30 bg-indigo/10 text-ink'
                      : 'border-hairline bg-cream text-ink hover:bg-cream-soft'
                  )}
                  key={bucket}
                  value={bucket}
                >
                  <span>{YEARS_LABELS[bucket]}</span>
                </ChoiceGroup.Item>
              );
            })}
          </ChoiceGroup>
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
            <p className="text-sm text-ink-muted">Question 2 of 2</p>
          </div>
        </div>
      )}
    </div>
  );
}

function VendorTipsStep() {
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-stretch md:gap-6">
      <div className="order-2 w-full md:order-1 md:w-1/2">
        <TipsList className="flex h-full flex-col gap-4" title="Tips">
          {VENDOR_TIPS.map((tip) => (
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
