'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useFormErrors } from '@/hooks/useFormErrors';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { onlineSchema } from '@/lib/onboarding/validation';

interface Props {
  initial: { instagramHandle: string; websiteUrl: string };
  profileId: string;
  mode: 'first' | 'next';
}

export function StepOnline({ initial, profileId, mode }: Props) {
  const router = useRouter();
  const [data, setData] = useState(initial);
  const { applyZodErrors, clearField, getError, total } = useFormErrors();
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function handleInstagramBlur() {
    // Strip leading @ on blur
    setData((d) => ({ ...d, instagramHandle: d.instagramHandle.replace(/^@/, '').trim() }));
  }

  async function onNext() {
    const parsed = onlineSchema.safeParse(data);
    if (!parsed.success) {
      applyZodErrors(parsed.error);
      return;
    }
    setSubmitting(true);
    const res = await fetch('/api/vendor-profile/setup/online', {
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
    router.push(`/dashboard/profile/setup/details${nextParam}`);
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-balance text-2xl font-bold">Your online presence</h1>
        <p className="text-sm text-muted-foreground">Step 3 of 6</p>
      </div>

      {total >= 2 && (
        <p className="text-sm font-medium text-hot-pink" role="status" aria-live="polite">
          {total} fields need attention
        </p>
      )}

      <div className="space-y-2">
        <Label htmlFor="instagramHandle">Instagram handle (optional)</Label>
        <div className="flex items-center gap-1">
          <span className="text-sm text-muted-foreground">@</span>
          <Input
            id="instagramHandle"
            value={data.instagramHandle}
            onChange={(e) => {
              setData({ ...data, instagramHandle: e.target.value });
              clearField('instagramHandle');
            }}
            onBlur={handleInstagramBlur}
            placeholder="yourhandle"
            autoComplete="off"
            spellCheck={false}
            autoCapitalize="none"
            autoCorrect="off"
            inputMode="text"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Instagram is how customers discover culturally-focused vendors. Add it if you have one.
        </p>
        {getError('instagramHandle') && (
          <p className="mt-1 text-xs text-hot-pink">{getError('instagramHandle')}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="websiteUrl">Website URL (optional)</Label>
        <Input
          id="websiteUrl"
          type="url"
          value={data.websiteUrl}
          onChange={(e) => {
            setData({ ...data, websiteUrl: e.target.value });
            clearField('websiteUrl');
          }}
          placeholder="https://yourwebsite.com"
          autoComplete="url"
          inputMode="url"
          spellCheck={false}
          autoCapitalize="none"
        />
        {getError('websiteUrl') && (
          <p className="mt-1 text-xs text-hot-pink">{getError('websiteUrl')}</p>
        )}
      </div>

      {serverError && (
        <p className="text-sm text-destructive" role="alert" aria-live="assertive">
          {serverError}
        </p>
      )}

      <div className="flex justify-end">
        <Button onClick={onNext} disabled={submitting}>
          {submitting ? 'Saving…' : 'Next'}
        </Button>
      </div>
    </div>
  );
}
