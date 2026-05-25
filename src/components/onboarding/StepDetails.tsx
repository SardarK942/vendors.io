'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { LANGUAGES, RESPONSE_SLA_OPTIONS } from '@/components/marketplace/filters/constants';

interface ProfileShape {
  languages: string[] | null;
  years_in_business: number | null;
  response_sla_hours: number | null;
}

interface Props {
  profile: ProfileShape;
  profileId: string;
  mode: 'first' | 'next';
  /** When true, the step is being shown via the backfill flow (existing vendor catching up). */
  isBackfill?: boolean;
}

export function StepDetails({ profile, profileId, mode, isBackfill = false }: Props) {
  const router = useRouter();
  const [languages, setLanguages] = React.useState<string[]>(profile.languages ?? []);
  const [years, setYears] = React.useState<number | ''>(profile.years_in_business ?? '');
  const [sla, setSla] = React.useState<number | null>(profile.response_sla_hours ?? null);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const toggleLang = (slug: string) => {
    setLanguages((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug].sort()
    );
  };

  const isValid = languages.length > 0 && typeof years === 'number' && years >= 0 && sla !== null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/vendor-profile/setup/details', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile_id: profileId,
          languages,
          years_in_business: years,
          response_sla_hours: sla,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? 'Failed to save profile details');
      }
      if (isBackfill) {
        router.push('/dashboard');
      } else {
        const nextParam = mode === 'next' ? '?next=true' : '';
        router.push(`/dashboard/profile/setup/portfolio${nextParam}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <header>
        <h1 className="font-display text-3xl font-bold tracking-tight text-ink">Profile details</h1>
        <p className="mt-2 text-sm text-ink-muted">
          Three quick questions to help couples find you.
        </p>
      </header>

      {/* Languages */}
      <div className="space-y-3">
        <Label className="font-display text-base font-semibold">Languages your team speaks</Label>
        <p className="text-xs text-ink-soft">Pick all that apply.</p>
        <div className="flex flex-wrap gap-2">
          {LANGUAGES.map((lang) => {
            const on = languages.includes(lang.slug);
            return (
              <button
                key={lang.slug}
                type="button"
                onClick={() => toggleLang(lang.slug)}
                className={`inline-flex h-9 items-center rounded-full border px-4 text-[13px] font-medium transition-colors ${
                  on
                    ? 'border-ink bg-ink text-cream'
                    : 'border-hairline bg-cream text-ink hover:border-ink'
                }`}
              >
                {lang.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Years in business */}
      <div className="space-y-2">
        <Label htmlFor="years" className="font-display text-base font-semibold">
          Years in business
        </Label>
        <p className="text-xs text-ink-soft">
          Approximate is fine. Counts real-world wedding experience.
        </p>
        <input
          id="years"
          type="number"
          min={0}
          max={99}
          value={years}
          onChange={(e) => setYears(e.target.value === '' ? '' : Number(e.target.value))}
          className="w-32 rounded-md border border-hairline bg-cream px-3 py-2 font-mono text-base text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
        />
      </div>

      {/* Response SLA */}
      <div className="space-y-3">
        <Label className="font-display text-base font-semibold">How quickly do you respond?</Label>
        <p className="text-xs text-ink-soft">
          Couples filter for fast-responding vendors — pick what you can honestly commit to.
        </p>
        <div className="flex flex-col gap-2">
          {RESPONSE_SLA_OPTIONS.map((opt) => (
            <label key={opt.value} className="flex cursor-pointer items-center gap-3">
              <input
                type="radio"
                name="response-sla"
                value={opt.value}
                checked={sla === opt.value}
                onChange={() => setSla(opt.value)}
                className="size-4 accent-ink"
              />
              <span className="text-sm text-ink">{opt.label}</span>
            </label>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-error">{error}</p>}

      <div className="flex items-center justify-end gap-3 border-t border-hairline pt-4">
        <Button type="submit" disabled={!isValid} isLoading={submitting}>
          {isBackfill ? 'Save' : 'Continue'}
        </Button>
      </div>
    </form>
  );
}
