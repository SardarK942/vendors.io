'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useFormErrors } from '@/hooks/useFormErrors';
import { Button } from '@/components/ui/button';
import { PhotoUploaderDrawer } from '@/components/ui/PhotoUploaderDrawer';
import { portfolioSchema } from '@/lib/onboarding/validation';

interface Props {
  initial: { portfolioImages: string[] };
  profileId: string;
  mode: 'first' | 'next';
}

export function StepPortfolio({ initial, profileId, mode }: Props) {
  const router = useRouter();
  const [images, setImages] = useState<string[]>(initial.portfolioImages);
  const { applyZodErrors, clearField, getError, total } = useFormErrors();
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onNext() {
    const parsed = portfolioSchema.safeParse({ portfolioImages: images });
    if (!parsed.success) {
      applyZodErrors(parsed.error);
      return;
    }
    setSubmitting(true);
    const res = await fetch('/api/vendor-profile/setup/portfolio', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...parsed.data, profile_id: profileId }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const json = await res.json().catch(() => ({ error: 'Save failed' }));
      setServerError(json.error ?? 'Save failed');
      return;
    }
    const nextParam = mode === 'next' ? '?next=true' : '';
    router.push(`/dashboard/profile/setup/payment-mode${nextParam}`);
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Show your work</h1>
        <p className="text-sm text-muted-foreground">Step 5 of 7</p>
      </div>

      {total >= 2 && (
        <p className="text-sm font-medium text-hot-pink">{total} fields need attention</p>
      )}

      {getError('portfolioImages') && (
        <p className="mt-1 text-xs text-hot-pink">{getError('portfolioImages')}</p>
      )}

      {images.length > 0 && images.length < 3 && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
          Vendors with 3+ photos get 2&times; more clicks &mdash; add more if you have them.
        </div>
      )}

      <PhotoUploaderDrawer
        value={images}
        onChange={(urls) => {
          setImages(urls);
          if (urls.length > 0) clearField('portfolioImages');
        }}
        endpoint="portfolioImage"
        maxFiles={10}
        maxSizeMb={4}
        showPrimarySelector
        triggerLabel={{ empty: 'Upload portfolio photos', manage: 'Manage photos' }}
      />

      {serverError && <p className="text-sm text-destructive">{serverError}</p>}

      <div className="flex justify-end">
        <Button onClick={onNext} disabled={submitting || images.length === 0}>
          {submitting ? 'Saving…' : 'Next'}
        </Button>
      </div>
    </div>
  );
}
