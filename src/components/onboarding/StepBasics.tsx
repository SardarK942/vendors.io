'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { basicsSchema } from '@/lib/onboarding/validation';
import { BioAssistButton } from './BioAssistButton';
import { VENDOR_CATEGORIES, VENDOR_CATEGORY_LABELS } from '@/lib/utils';
import { ScrapedVendorMatchPrompt } from './ScrapedVendorMatchPrompt';
import type { ScrapedVendorMatch } from '@/lib/scraped-vendor/match';

interface Props {
  initial: { businessName: string; category: string; bio: string };
  profileId: string;
  mode: 'first' | 'next';
}

export function StepBasics({ initial, profileId, mode }: Props) {
  const router = useRouter();
  const [data, setData] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pendingMatches, setPendingMatches] = useState<ScrapedVendorMatch[] | null>(null);

  const nextParam = mode === 'next' ? '?next=true' : '';

  async function saveAndAdvance() {
    const parsed = basicsSchema.safeParse(data);
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    const res = await fetch('/api/vendor-profile/setup/basics', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...parsed.data, profile_id: profileId }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({ error: 'Save failed' }));
      setError(json.error ?? 'Save failed');
      return;
    }
    router.push(`/dashboard/profile/setup/location${nextParam}`);
  }

  async function onNext() {
    const parsed = basicsSchema.safeParse(data);
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    setSubmitting(true);
    // Check for scraped-vendor matches first. Step 1 has only businessName +
    // category — IG/phone/city aren't captured yet — so this will typically
    // return empty until we capture more signals in step 1 (future iteration).
    try {
      const matchRes = await fetch('/api/scraped-vendors/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessName: parsed.data.businessName,
          city: '',
          instagramHandle: null,
          phone: null,
        }),
      });
      if (matchRes.ok) {
        const { matches } = (await matchRes.json()) as { matches: ScrapedVendorMatch[] };
        if (matches && matches.length > 0) {
          setPendingMatches(matches);
          setSubmitting(false);
          return;
        }
      }
    } catch {
      // Match service failure is non-fatal — fall through to normal save.
    }
    await saveAndAdvance();
    setSubmitting(false);
  }

  return (
    <div className="max-w-2xl space-y-6">
      {pendingMatches && <ScrapedVendorMatchPrompt matches={pendingMatches} />}
      <div>
        <h1 className="text-2xl font-bold">Tell us about your business</h1>
        <p className="text-sm text-muted-foreground">Step 1 of 5</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="businessName">Business name</Label>
        <Input
          id="businessName"
          value={data.businessName}
          onChange={(e) => setData({ ...data, businessName: e.target.value })}
          placeholder="Mehndi by Priya"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="category">Category</Label>
        <Select value={data.category} onValueChange={(v) => setData({ ...data, category: v })}>
          <SelectTrigger id="category">
            <SelectValue placeholder="Choose a category" />
          </SelectTrigger>
          <SelectContent>
            {VENDOR_CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {VENDOR_CATEGORY_LABELS[c]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="bio">Bio</Label>
          <BioAssistButton
            businessName={data.businessName}
            category={data.category}
            currentBio={data.bio}
            onAccept={(polished) => setData({ ...data, bio: polished })}
          />
        </div>
        <Textarea
          id="bio"
          rows={5}
          value={data.bio}
          onChange={(e) => setData({ ...data, bio: e.target.value })}
          placeholder="What do you do, who do you serve, and what makes you different? (50–500 characters)"
        />
        <p className="mt-1 text-xs text-muted-foreground">{data.bio.length} / 500</p>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex justify-end">
        <Button onClick={onNext} disabled={submitting || !!pendingMatches}>
          {submitting ? 'Saving…' : 'Next'}
        </Button>
      </div>
    </div>
  );
}
