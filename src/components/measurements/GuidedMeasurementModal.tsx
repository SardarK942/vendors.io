'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { MeasurementGarment, MeasurementUnit } from '@/types/database.types';
import {
  getMeasurementSchema,
  GARMENT_META,
  type MeasurementField,
} from '@/lib/products/measurement-schemas';
import {
  toDisplay,
  toInches,
  round2,
  fieldState,
  crossFieldWarnings,
  missingCount,
} from '@/lib/products/measurement-validation';
import { MeasurementFigure } from './MeasurementFigure';

// Couple-facing guided measurement wizard. Reproduces the vetted prototype
// (scratchpad/measure-modal.html): garment switcher, one-measurement-per-step
// wizard with a numbered index, per-field body-diagram highlight, how-to copy,
// mono input + inch/cm toggle, sleeve preset chips, live validation, and a
// Review step with cross-field warnings. Persistence is the API (POST/PATCH),
// values are canonical INCHES. All copy is pulled from the shared libs.

const DEFAULT_LABEL: Record<MeasurementGarment, string> = {
  lehenga: 'Bride',
  sherwani: 'Groom',
};

const GARMENT_ORDER: MeasurementGarment[] = ['lehenga', 'sherwani'];

type SaveState = 'idle' | 'saving' | 'error';

export interface GuidedMeasurementModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialProfile?: {
    id: string;
    label: string;
    garment: MeasurementGarment;
    measurements: Record<string, number>;
    unit: MeasurementUnit;
  };
  onSaved: () => void;
}

export function GuidedMeasurementModal({
  open,
  onOpenChange,
  initialProfile,
  onSaved,
}: GuidedMeasurementModalProps) {
  const isEditing = Boolean(initialProfile);

  const [garment, setGarment] = React.useState<MeasurementGarment>(
    initialProfile?.garment ?? 'lehenga'
  );
  const [unit, setUnit] = React.useState<MeasurementUnit>(initialProfile?.unit ?? 'in');
  const [label, setLabel] = React.useState(initialProfile?.label ?? DEFAULT_LABEL.lehenga);
  const [values, setValues] = React.useState<Record<string, number>>(
    initialProfile?.measurements ?? {}
  );
  const [stepIndex, setStepIndex] = React.useState(0);
  const [review, setReview] = React.useState(false);
  const [saveState, setSaveState] = React.useState<SaveState>('idle');

  // Re-seed all state whenever the modal opens (or its target profile changes),
  // so re-editing / re-adding starts from the right place rather than stale state.
  React.useEffect(() => {
    if (!open) return;
    setGarment(initialProfile?.garment ?? 'lehenga');
    setUnit(initialProfile?.unit ?? 'in');
    setLabel(initialProfile?.label ?? DEFAULT_LABEL[initialProfile?.garment ?? 'lehenga']);
    setValues(initialProfile?.measurements ?? {});
    setStepIndex(0);
    setReview(false);
    setSaveState('idle');
  }, [open, initialProfile]);

  const fields = getMeasurementSchema(garment);
  const meta = GARMENT_META[garment];
  const total = fields.length;
  const field = fields[stepIndex];

  const doneCount = fields.filter((f) => fieldState(f, values[f.key]) !== 'empty').length;
  const missing = missingCount(garment, values);
  const warnings = crossFieldWarnings(garment, values);

  function setValue(key: string, inches: number | null) {
    setValues((prev) => {
      const next = { ...prev };
      if (inches === null) delete next[key];
      else next[key] = inches;
      return next;
    });
  }

  function switchGarment(next: MeasurementGarment) {
    if (next === garment) return;
    // Only offered while creating; a fresh garment means fresh values, and the
    // label follows the new default unless the couple already customized it.
    setLabel((prev) =>
      GARMENT_ORDER.some((g) => prev === DEFAULT_LABEL[g]) ? DEFAULT_LABEL[next] : prev
    );
    setGarment(next);
    setValues({});
    setStepIndex(0);
    setReview(false);
  }

  function fmtRange(range: [number, number]): string {
    const fmt = (n: number) => (n % 1 ? n.toFixed(1) : n.toFixed(0));
    return `${fmt(toDisplay(range[0], unit))}–${fmt(toDisplay(range[1], unit))} ${unit}`;
  }

  function inputValueFor(f: MeasurementField): string {
    const v = values[f.key];
    if (v === undefined) return '';
    return String(toDisplay(v, unit));
  }

  async function handleSave() {
    setSaveState('saving');
    try {
      const url = initialProfile
        ? `/api/measurement-profiles/${initialProfile.id}`
        : '/api/measurement-profiles';
      const method = initialProfile ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ label: label.trim(), garment, measurements: values, unit }),
      });
      if (!res.ok) {
        setSaveState('error');
        toast.error('We couldn’t save this fit profile — please try again.');
        return;
      }
      toast.success(isEditing ? 'Fit profile updated' : 'Fit profile saved');
      onSaved();
      onOpenChange(false);
    } catch {
      setSaveState('error');
      toast.error('Network error, please try again.');
    }
  }

  const currentState = field ? fieldState(field, values[field.key]) : 'empty';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl overflow-hidden bg-cream p-0">
        <div
          className="h-[3px] w-full bg-gradient-to-r from-indigo via-indigo to-hot-pink"
          aria-hidden
        />
        <DialogTitle className="sr-only">
          {isEditing ? `Edit ${label} measurements` : 'Add measurements'}
        </DialogTitle>
        <DialogDescription className="sr-only">
          Guided, one-at-a-time body measurements for a {meta.noun}, saved as a reusable fit
          profile.
        </DialogDescription>

        <div className="max-h-[82vh] overflow-y-auto">
          {/* Topbar: garment switcher (create only) + counter + unit toggle */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-hairline px-6 py-3">
            {isEditing ? (
              <p className="mr-auto font-mono text-[13px] uppercase tracking-[0.14em] text-indigo">
                {meta.label}
              </p>
            ) : (
              <div className="mr-auto flex gap-4" role="tablist" aria-label="Whose profile">
                {GARMENT_ORDER.map((g) => (
                  <button
                    key={g}
                    type="button"
                    role="tab"
                    aria-selected={g === garment}
                    onClick={() => switchGarment(g)}
                    className={cn(
                      'relative py-2 text-[14.5px] font-semibold transition-colors',
                      'after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:origin-left after:bg-hot-pink after:transition-transform',
                      g === garment
                        ? 'text-ink after:scale-x-100'
                        : 'text-ink-soft after:scale-x-0 hover:text-ink-muted'
                    )}
                  >
                    {GARMENT_META[g].label}
                  </button>
                ))}
              </div>
            )}

            {!review && (
              <p className="font-mono text-[13px] tabular-nums text-ink-muted">
                <span className="text-ink">{String(stepIndex + 1).padStart(2, '0')}</span> / {total}
              </p>
            )}

            <div
              className="inline-flex overflow-hidden rounded-md border border-hairline bg-cream-soft"
              role="group"
              aria-label="Units"
            >
              {(['in', 'cm'] as MeasurementUnit[]).map((u) => (
                <button
                  key={u}
                  type="button"
                  aria-pressed={u === unit}
                  onClick={() => setUnit(u)}
                  className={cn(
                    'px-3 py-1.5 font-mono text-[13px] transition-colors',
                    u === unit ? 'bg-ink text-cream' : 'text-ink-muted hover:text-ink'
                  )}
                >
                  {u === 'in' ? 'inches' : 'cm'}
                </button>
              ))}
            </div>
          </div>

          {!review && (
            <>
              {/* progress track */}
              <div className="h-0.5 bg-hairline-soft">
                <div
                  className="h-full origin-left bg-haldi transition-transform"
                  style={{ transform: `scaleX(${total ? doneCount / total : 0})` }}
                />
              </div>

              <div className="grid md:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)]">
                {/* numbered index */}
                <nav
                  className="border-b border-hairline bg-cream-soft/50 py-2 md:border-b-0 md:border-r"
                  aria-label="Measurements"
                >
                  {fields.map((f, idx) => {
                    const rs = fieldState(f, values[f.key]);
                    const showGroup = idx === 0 || fields[idx - 1].group !== f.group;
                    const valTxt =
                      rs === 'empty'
                        ? '—'
                        : `${toDisplay(values[f.key], unit)}${unit === 'cm' ? 'cm' : '"'}`;
                    return (
                      <React.Fragment key={f.key}>
                        {showGroup && (
                          <div className="px-6 pb-1.5 pt-3.5 font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-soft">
                            {f.group}
                          </div>
                        )}
                        <button
                          type="button"
                          data-testid="measurement-step"
                          aria-current={idx === stepIndex}
                          onClick={() => {
                            setStepIndex(idx);
                            setReview(false);
                          }}
                          className={cn(
                            'flex w-full items-baseline gap-3 border-l-2 px-6 py-2 text-left transition-colors',
                            idx === stepIndex
                              ? 'border-hot-pink bg-ink'
                              : 'border-transparent hover:bg-hairline-soft'
                          )}
                        >
                          <span
                            className={cn(
                              'w-[18px] font-mono text-[12px] tabular-nums',
                              idx === stepIndex ? 'text-haldi' : 'text-ink-soft'
                            )}
                          >
                            {String(idx + 1).padStart(2, '0')}
                          </span>
                          <span
                            className={cn(
                              'flex-1 text-[14px]',
                              idx === stepIndex ? 'font-semibold text-cream' : 'text-ink-muted'
                            )}
                          >
                            {f.name}
                          </span>
                          <span
                            className={cn(
                              'font-mono text-[12.5px] tabular-nums',
                              rs === 'out'
                                ? 'text-error'
                                : rs === 'empty'
                                  ? 'text-ink-soft'
                                  : idx === stepIndex
                                    ? 'text-cream-soft'
                                    : 'text-ink'
                            )}
                          >
                            {valTxt}
                          </span>
                        </button>
                      </React.Fragment>
                    );
                  })}
                </nav>

                {/* stage */}
                <div className="flex flex-col px-6 py-5">
                  <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-indigo">
                    {field.group}
                  </p>
                  <h2 className="mt-1.5 text-balance font-display text-[clamp(24px,3.6vw,32px)] font-bold leading-[1.05] tracking-[-0.015em] text-ink">
                    {field.name}
                    {field.back && (
                      <span className="ml-2 align-middle font-mono text-[12px] font-normal tracking-[0.02em] text-ink-soft">
                        across the back
                      </span>
                    )}
                  </h2>

                  <div className="mt-4 grid items-start gap-5 [grid-template-columns:150px_minmax(0,1fr)] max-[460px]:grid-cols-1">
                    <div className="rounded-lg border border-hairline bg-cream p-2">
                      <MeasurementFigure
                        figure={meta.figure}
                        hi={field.hi}
                        className="block h-auto w-full"
                      />
                    </div>

                    <div>
                      <p className="mb-4 text-[15px] text-ink-muted">{field.how}</p>

                      <div className="flex gap-2.5">
                        <Input
                          type="number"
                          inputMode="decimal"
                          step={unit === 'cm' ? '0.5' : '0.25'}
                          placeholder="0"
                          data-testid="measurement-input"
                          aria-label={`${field.name} value in ${unit}`}
                          value={inputValueFor(field)}
                          onChange={(e) => {
                            const raw = e.target.value;
                            if (raw === '') {
                              setValue(field.key, null);
                              return;
                            }
                            const parsed = Number.parseFloat(raw);
                            if (Number.isNaN(parsed)) return;
                            setValue(field.key, round2(toInches(parsed, unit)));
                          }}
                          className="h-auto flex-1 rounded-md border-[1.5px] border-hairline bg-cream px-3.5 py-2.5 font-mono text-[22px] tabular-nums text-ink focus-visible:border-indigo focus-visible:ring-indigo"
                        />
                        <span className="flex items-center rounded-md border border-hairline bg-cream-soft px-3.5 font-mono text-[14px] text-ink-muted">
                          {unit}
                        </span>
                      </div>

                      {field.presets && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {field.presets.map(([presetLabel, presetInches]) => {
                            const active = values[field.key] === presetInches;
                            return (
                              <button
                                key={presetLabel}
                                type="button"
                                aria-pressed={active}
                                onClick={() => setValue(field.key, presetInches)}
                                className={cn(
                                  'rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors',
                                  active
                                    ? 'border-hot-pink bg-hot-pink text-cream'
                                    : 'border-hairline bg-cream text-ink-muted hover:border-hot-pink hover:text-ink'
                                )}
                              >
                                {presetLabel}
                                {presetInches
                                  ? ` · ${toDisplay(presetInches, unit).toFixed(0)}`
                                  : ''}
                              </button>
                            );
                          })}
                        </div>
                      )}

                      <div className="mt-3 flex items-baseline gap-2 border-t border-hairline pt-3 font-mono text-[12.5px] text-ink-soft">
                        <span className="text-[11px] uppercase tracking-[0.08em] text-ink-muted">
                          Typical
                        </span>
                        <span>{fmtRange(field.range)}</span>
                      </div>

                      <div
                        className="mt-2.5 flex min-h-5 items-start gap-1.5 text-[13.5px]"
                        aria-live="polite"
                      >
                        {currentState === 'out' && (
                          <p className="text-error">
                            <span className="font-bold">✕</span> Outside the usual range (
                            {fmtRange(field.range)}). Fine if you&apos;re sure, worth a second
                            check.
                          </p>
                        )}
                        {currentState === 'ok' && (
                          <p className="text-indigo">
                            <span className="font-bold">✓</span> Looks right.
                          </p>
                        )}
                      </div>

                      {field.tricky && (
                        <p className="mt-2 flex items-center gap-1.5 text-[12.5px] text-ink-muted">
                          <span aria-hidden>⚠</span>
                          <span>Easy to get wrong. Measure it twice.</span>
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* footer */}
              <div className="flex items-center gap-3 border-t border-hairline px-6 py-4">
                <span className="mr-auto font-mono text-[12px] text-ink-soft">
                  {doneCount} of {total} done
                </span>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={stepIndex === 0}
                  onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
                >
                  Back
                </Button>
                <Button
                  type="button"
                  data-testid="measurement-next"
                  onClick={() => {
                    if (stepIndex === total - 1) setReview(true);
                    else setStepIndex((i) => Math.min(total - 1, i + 1));
                  }}
                >
                  {stepIndex === total - 1 ? 'Review' : 'Next'}
                </Button>
              </div>
            </>
          )}

          {review && (
            <div className="px-6 py-6">
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-indigo">
                {DEFAULT_LABEL[garment]} · Review
              </p>
              <h2 className="mb-1 mt-1.5 font-display text-[clamp(24px,3.6vw,34px)] font-bold tracking-[-0.015em] text-ink">
                Check the {meta.noun} fit profile
              </h2>
              <p className="mb-5 max-w-[60ch] text-[15px] text-ink-muted">
                Anything in red sits outside the usual range or conflicts with another measurement.
                Fix those before saving, or keep them if you know they&apos;re right.
              </p>

              <div className="mb-3">
                <label
                  htmlFor="fit-profile-label"
                  className="mb-1.5 block font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-soft"
                >
                  Profile name
                </label>
                <Input
                  id="fit-profile-label"
                  value={label}
                  maxLength={40}
                  onChange={(e) => setLabel(e.target.value)}
                  className="max-w-xs bg-cream"
                  placeholder={DEFAULT_LABEL[garment]}
                />
              </div>

              <div className="grid gap-x-10 sm:grid-cols-2">
                {fields.map((f, idx) => {
                  const rs = fieldState(f, values[f.key]);
                  const showGroup = idx === 0 || fields[idx - 1].group !== f.group;
                  return (
                    <React.Fragment key={f.key}>
                      {showGroup && (
                        <div className="mb-1 mt-4 font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-soft sm:col-span-1">
                          {f.group}
                        </div>
                      )}
                      <div className="flex items-baseline gap-3 border-b border-hairline py-2.5">
                        <span className="flex-1 text-[14.5px] text-ink">{f.name}</span>
                        <span
                          className={cn(
                            'font-mono text-[14.5px] tabular-nums',
                            rs === 'empty' ? 'text-ink-soft' : 'text-ink'
                          )}
                        >
                          {rs === 'empty' ? '—' : `${toDisplay(values[f.key], unit)} ${unit}`}
                        </span>
                        {rs === 'out' && (
                          <span className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-error">
                            out of range
                          </span>
                        )}
                      </div>
                    </React.Fragment>
                  );
                })}
              </div>

              <div className="mt-5 flex flex-col gap-2.5">
                {missing > 0 && (
                  <div className="flex items-start gap-2.5 rounded-lg border border-haldi/50 bg-haldi/10 px-3.5 py-3 text-[13.5px] text-ink">
                    <span aria-hidden className="font-bold">
                      ⚠
                    </span>
                    <span>
                      {missing} measurement{missing > 1 ? 's' : ''} still empty.
                    </span>
                  </div>
                )}
                {warnings.map((w) => (
                  <div
                    key={w.message}
                    className="flex items-start gap-2.5 rounded-lg border border-haldi/50 bg-haldi/10 px-3.5 py-3 text-[13.5px] text-ink"
                  >
                    <span aria-hidden className="font-bold">
                      ⚠
                    </span>
                    <span>{w.message}</span>
                  </div>
                ))}
                {missing === 0 && warnings.length === 0 && (
                  <div className="flex items-start gap-2.5 rounded-lg border border-indigo/30 bg-indigo/[0.06] px-3.5 py-3 text-[13.5px] text-indigo">
                    <span aria-hidden className="font-bold">
                      ✓
                    </span>
                    <span>Everything checks out. No conflicts found.</span>
                  </div>
                )}
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-3.5">
                <Button type="button" variant="secondary" onClick={() => setReview(false)}>
                  Back to measuring
                </Button>
                <Button
                  type="button"
                  isLoading={saveState === 'saving'}
                  showTextWhileLoading
                  disabled={label.trim().length === 0 || saveState === 'saving'}
                  onClick={handleSave}
                >
                  Save fit profile
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
