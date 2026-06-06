'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
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
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function handleInstagramBlur() {
    // Strip leading @ on blur
    setData((d) => ({ ...d, instagramHandle: d.instagramHandle.replace(/^@/, '').trim() }));
  }

  async function onNext() {
    const parsed = onlineSchema.safeParse(data);
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
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
      setError(json.error ?? 'Save failed');
      return;
    }
    const nextParam = mode === 'next' ? '?next=true' : '';
    router.push(`/dashboard/profile/setup/portfolio${nextParam}`);
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Your online presence</h1>
        <p className="text-sm text-muted-foreground">Step 3 of 7</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="instagramHandle">
          Instagram handle <span className="text-destructive">*</span>
        </Label>
        <div className="flex items-center gap-1">
          <span className="text-sm text-muted-foreground">@</span>
          <Input
            id="instagramHandle"
            value={data.instagramHandle}
            onChange={(e) => setData({ ...data, instagramHandle: e.target.value })}
            onBlur={handleInstagramBlur}
            placeholder="yourhandle"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Instagram is how couples discover Desi wedding vendors. This field is required.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="websiteUrl">Website URL (optional)</Label>
        <Input
          id="websiteUrl"
          type="url"
          value={data.websiteUrl}
          onChange={(e) => setData({ ...data, websiteUrl: e.target.value })}
          placeholder="https://yourwebsite.com"
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex justify-end">
        <Button onClick={onNext} disabled={submitting}>
          {submitting ? 'Saving…' : 'Next'}
        </Button>
      </div>
    </div>
  );
}
