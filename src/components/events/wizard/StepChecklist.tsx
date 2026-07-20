'use client';

import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { CATEGORIES_FEATURED } from '@/lib/vendor-categories/featured';
import type { WizardFunction } from './EventWizard';
import { cn } from '@/lib/utils';

type Task = { title: string; due_date: string | null; function_index: number | null };

interface StepChecklistProps {
  functions: WizardFunction[];
  tasks: Task[];
  onChange: (tasks: Task[]) => void;
}

const MISC_PRESETS = ['Order outfits', 'Send invitations', 'Confirm final guest count'];

function categoryLabel(slug: string): string {
  return CATEGORIES_FEATURED.find((c) => c.slug === slug)?.label ?? slug;
}

export function StepChecklist({ functions, tasks, onChange }: StepChecklistProps) {
  const [freeText, setFreeText] = useState('');

  // One suggested chip per unbooked vendor need, plus the misc presets.
  const suggestions = useMemo(() => {
    const needBased: { title: string; function_index: number | null }[] = [];
    functions.forEach((f, i) => {
      f.categories
        .filter((c) => !(c in f.booked))
        .forEach((c) => {
          needBased.push({
            title: `Book ${categoryLabel(c)} for ${f.label}`,
            function_index: i,
          });
        });
    });
    const misc = MISC_PRESETS.map((title) => ({ title, function_index: null }));
    return [...needBased, ...misc];
  }, [functions]);

  function isSelected(candidate: { title: string; function_index: number | null }) {
    return tasks.some(
      (t) => t.title === candidate.title && t.function_index === candidate.function_index
    );
  }

  function toggle(candidate: { title: string; function_index: number | null }) {
    if (isSelected(candidate)) {
      onChange(
        tasks.filter(
          (t) => !(t.title === candidate.title && t.function_index === candidate.function_index)
        )
      );
    } else {
      onChange([
        ...tasks,
        { title: candidate.title, due_date: null, function_index: candidate.function_index },
      ]);
    }
  }

  function addFreeText() {
    const title = freeText.trim();
    if (!title) return;
    onChange([...tasks, { title, due_date: null, function_index: null }]);
    setFreeText('');
  }

  function updateDueDate(index: number, due_date: string | null) {
    onChange(tasks.map((t, i) => (i === index ? { ...t, due_date } : t)));
  }

  function removeAt(index: number) {
    onChange(tasks.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-8">
      <div>
        <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-indigo">
          Step 5 of 5
        </p>
        <h1 className="mt-2 font-display text-3xl text-ink">Anything else on your list?</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Add tasks now, or skip and add them later from your event journal.
        </p>
      </div>

      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <button
              key={`${s.title}-${s.function_index}`}
              type="button"
              aria-pressed={isSelected(s)}
              onClick={() => toggle(s)}
              className={cn(
                'rounded-full border-[1.5px] px-3.5 py-1.5 text-sm font-medium transition-colors',
                isSelected(s)
                  ? 'border-indigo bg-indigo/10 text-indigo'
                  : 'border-hairline bg-cream text-ink hover:border-indigo/50'
              )}
            >
              {s.title}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        <Input
          value={freeText}
          placeholder="Add a task"
          onChange={(e) => setFreeText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addFreeText();
            }
          }}
        />
        <Button type="button" variant="secondary" size="sm" onClick={addFreeText}>
          Add
        </Button>
      </div>

      {tasks.length > 0 && (
        <div className="space-y-2 border-t border-hairline pt-4">
          <Label className="text-xs text-ink-soft">Your checklist</Label>
          {tasks.map((t, i) => (
            <div
              key={`${t.title}-${i}`}
              className="flex flex-wrap items-center gap-2 rounded-lg border border-hairline bg-cream-soft/40 px-3 py-2"
            >
              <span className="flex-1 text-sm text-ink">{t.title}</span>
              <input
                type="date"
                value={t.due_date ?? ''}
                onChange={(e) => updateDueDate(i, e.target.value || null)}
                className="h-8 rounded-md border border-input bg-transparent px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              <button
                type="button"
                aria-label={`Remove ${t.title}`}
                onClick={() => removeAt(i)}
                className="rounded-md px-2 py-1 text-xs text-ink-soft hover:bg-cream hover:text-ink"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
