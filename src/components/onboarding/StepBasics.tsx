'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import { useFormErrors } from '@/hooks/useFormErrors';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
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
import { BioAssistCard } from './BioAssistCard';
import { VENDOR_CATEGORIES, VENDOR_CATEGORY_LABELS } from '@/lib/utils';
import { ScrapedVendorMatchPrompt } from './ScrapedVendorMatchPrompt';
import type { ScrapedVendorMatch } from '@/lib/scraped-vendor/match';
import { SubcategoryMultiSelect } from './SubcategoryMultiSelect';
import { getSubcategoriesForCategory } from '@/lib/vendor-subcategories';

interface Props {
  initial: { businessName: string; category: string; bio: string; subcategories: string[] };
  profileId: string;
  mode: 'first' | 'next';
}

export function StepBasics({ initial, profileId, mode }: Props) {
  const router = useRouter();
  const [data, setData] = useState(initial);
  const { applyZodErrors, clearField, getError, total } = useFormErrors();
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pendingMatches, setPendingMatches] = useState<ScrapedVendorMatch[] | null>(null);
  // Show pre-fill banner when the bio loaded from DB is non-empty on first render
  // (simplified heuristic — covers claimed vendors whose bio was pulled from IG;
  // false positive for vendors who previously wrote their own bio is low-risk since it's dismissible)
  const [showPrefillBanner, setShowPrefillBanner] = useState(() => Boolean(initial.bio));

  useUnsavedChangesGuard(JSON.stringify(data) !== JSON.stringify(initial));

  const nextParam = mode === 'next' ? '?next=true' : '';

  async function saveAndAdvance() {
    const parsed = basicsSchema.safeParse(data);
    if (!parsed.success) {
      applyZodErrors(parsed.error);
      return;
    }
    const res = await fetch('/api/vendor-profile/setup/basics', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...parsed.data, profile_id: profileId }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({ error: 'Save failed' }));
      setServerError(json.error ?? 'Save failed');
      return;
    }
    router.push(`/dashboard/profile/setup/location${nextParam}`);
  }

  async function onNext() {
    const parsed = basicsSchema.safeParse(data);
    if (!parsed.success) {
      applyZodErrors(parsed.error);
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
        <p className="text-sm text-muted-foreground">Step 1 of 6</p>
      </div>

      {total >= 2 && (
        <p className="text-sm font-medium text-hot-pink" role="status" aria-live="polite">
          {total} fields need attention
        </p>
      )}

      <div className="space-y-2">
        <Label htmlFor="businessName">Business name</Label>
        <Input
          id="businessName"
          value={data.businessName}
          onChange={(e) => {
            setData({ ...data, businessName: e.target.value });
            clearField('businessName');
          }}
          placeholder="Mehndi by Priya"
          autoComplete="organization"
        />
        {getError('businessName') && (
          <p className="mt-1 text-xs text-hot-pink">{getError('businessName')}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="category">Category</Label>
        <Select
          value={data.category}
          onValueChange={(v) => {
            setData({ ...data, category: v });
            clearField('category');
          }}
        >
          <SelectTrigger id="category">
            <SelectValue placeholder="Choose a category">
              {/* Radix's auto-render of the trigger text reads SelectItem
                  children — but those live inside SelectContent, which is a
                  Portal that doesn't mount until the dropdown is opened.
                  So a controlled value never displays on first render unless
                  we provide the label explicitly here. */}
              {data.category ? (VENDOR_CATEGORY_LABELS[data.category] ?? data.category) : null}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {VENDOR_CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {VENDOR_CATEGORY_LABELS[c]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {getError('category') && (
          <p className="mt-1 text-xs text-hot-pink">{getError('category')}</p>
        )}
      </div>

      {getSubcategoriesForCategory(data.category).length > 0 && (
        <div className="space-y-2">
          <Label>Cart types you offer</Label>
          <p className="text-xs text-ink/60">
            Pick the cart types your business runs. You can change this later.
          </p>
          <SubcategoryMultiSelect
            category={data.category}
            selected={data.subcategories}
            onChange={(next) => setData({ ...data, subcategories: next })}
          />
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="bio">Bio</Label>
        {showPrefillBanner && (
          <div className="mb-2 flex items-start justify-between gap-2 rounded-md border border-ink/15 bg-cream/60 px-3 py-2">
            <p className="text-xs text-ink">
              Pulled from your Instagram bio — edit or polish below.
            </p>
            <button
              type="button"
              onClick={() => setShowPrefillBanner(false)}
              aria-label="Dismiss notice"
              className="rounded text-ink/40 transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo focus-visible:ring-offset-2 focus-visible:ring-offset-cream"
            >
              <X className="size-3" />
            </button>
          </div>
        )}
        <Textarea
          id="bio"
          rows={5}
          value={data.bio}
          onChange={(e) => {
            setData({ ...data, bio: e.target.value });
            clearField('bio');
          }}
          placeholder="What do you do, who do you serve, and what makes you different?"
        />
        <p className="mt-1 text-xs tabular-nums text-muted-foreground" aria-live="polite">
          {data.bio.length} / 500
        </p>
        {getError('bio') && <p className="mt-1 text-xs text-hot-pink">{getError('bio')}</p>}
        {data.bio.length > 0 && data.bio.length < 50 && (
          <p className="mt-1 text-xs text-ink/60">
            Bios under 50 chars usually feel rushed. Two or three sentences works well.
          </p>
        )}
        <BioAssistCard
          currentBio={data.bio}
          businessName={data.businessName}
          category={data.category}
          onAccept={(newBio) => setData({ ...data, bio: newBio })}
        />
      </div>

      {serverError && <p className="text-sm text-destructive">{serverError}</p>}

      <div className="flex justify-end">
        <Button onClick={onNext} disabled={submitting || !!pendingMatches}>
          {submitting ? 'Saving…' : 'Next'}
        </Button>
      </div>
    </div>
  );
}
