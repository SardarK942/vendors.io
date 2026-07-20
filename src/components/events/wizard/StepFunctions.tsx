'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { CULTURAL_EVENT_TYPES } from '@/types';
import type { WizardFunction } from './EventWizard';
import { cn } from '@/lib/utils';

interface StepFunctionsProps {
  celebrationType: string;
  functions: WizardFunction[];
  onChange: (functions: WizardFunction[]) => void;
}

const CHIP_TYPES = CULTURAL_EVENT_TYPES.filter((e) => e.id !== 'multiple');

function emptyFunction(label: string, eventTypeId: string | null): WizardFunction {
  return {
    label,
    event_type_id: eventTypeId,
    date: null,
    guest_estimate: null,
    categories: [],
    booked: {},
  };
}

export function StepFunctions({ functions, onChange }: StepFunctionsProps) {
  const [customText, setCustomText] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);

  function isSelected(eventTypeId: string) {
    return functions.some((f) => f.event_type_id === eventTypeId);
  }

  function toggleChip(eventTypeId: string, label: string) {
    if (isSelected(eventTypeId)) {
      onChange(functions.filter((f) => f.event_type_id !== eventTypeId));
    } else {
      onChange([...functions, emptyFunction(label, eventTypeId)]);
    }
  }

  function addCustom() {
    const label = customText.trim();
    if (!label) return;
    onChange([...functions, emptyFunction(label, null)]);
    setCustomText('');
    setShowCustomInput(false);
  }

  function removeAt(index: number) {
    onChange(functions.filter((_, i) => i !== index));
  }

  function updateAt(index: number, patch: Partial<WizardFunction>) {
    onChange(functions.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  }

  return (
    <div className="space-y-8">
      <div>
        <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-indigo">
          Step 2 of 5
        </p>
        <h1 className="mt-2 font-display text-3xl text-ink">Which functions are you planning?</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Pick every celebration that&apos;s part of this event. Skip this to plan as one function.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {CHIP_TYPES.map((type) => (
          <button
            key={type.id}
            type="button"
            aria-pressed={isSelected(type.id)}
            onClick={() => toggleChip(type.id, type.label)}
            className={cn(
              'rounded-full border-[1.5px] px-4 py-2 text-sm font-medium transition-colors',
              isSelected(type.id)
                ? 'border-indigo bg-indigo/10 text-indigo'
                : 'border-hairline bg-cream text-ink hover:border-indigo/50'
            )}
          >
            {type.label}
          </button>
        ))}
        {!showCustomInput && (
          <button
            type="button"
            onClick={() => setShowCustomInput(true)}
            className="rounded-full border-[1.5px] border-dashed border-hairline px-4 py-2 text-sm font-medium text-ink-soft hover:border-ink-muted"
          >
            ＋ Custom
          </button>
        )}
      </div>

      {showCustomInput && (
        <div className="flex items-center gap-2">
          <Input
            autoFocus
            value={customText}
            placeholder="Name this function"
            onChange={(e) => setCustomText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addCustom();
              }
            }}
          />
          <Button type="button" variant="secondary" size="sm" onClick={addCustom}>
            Add
          </Button>
        </div>
      )}

      {functions.length > 0 && (
        <div className="space-y-4">
          {functions.map((f, i) => (
            <div
              key={`${f.event_type_id ?? 'custom'}-${i}`}
              className="grid grid-cols-1 gap-3 rounded-lg border border-hairline bg-cream-soft/40 p-4 sm:grid-cols-[1fr_auto_auto_auto]"
            >
              <div className="space-y-1">
                <Label htmlFor={`fn-label-${i}`} className="text-xs text-ink-soft">
                  Label
                </Label>
                <Input
                  id={`fn-label-${i}`}
                  value={f.label}
                  onChange={(e) => updateAt(i, { label: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`fn-date-${i}`} className="text-xs text-ink-soft">
                  Date
                </Label>
                <input
                  id={`fn-date-${i}`}
                  type="date"
                  value={f.date ?? ''}
                  onChange={(e) => updateAt(i, { date: e.target.value || null })}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`fn-guests-${i}`} className="text-xs text-ink-soft">
                  Guests
                </Label>
                <Input
                  id={`fn-guests-${i}`}
                  type="number"
                  min={1}
                  value={f.guest_estimate ?? ''}
                  placeholder="—"
                  onChange={(e) =>
                    updateAt(i, {
                      guest_estimate: e.target.value ? parseInt(e.target.value, 10) : null,
                    })
                  }
                  className="w-24"
                />
              </div>
              <div className="flex items-end justify-end">
                <button
                  type="button"
                  aria-label={`Remove ${f.label}`}
                  onClick={() => removeAt(i)}
                  className="rounded-md p-2 text-ink-soft hover:bg-cream hover:text-ink"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
