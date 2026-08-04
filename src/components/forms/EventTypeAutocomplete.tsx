'use client';

import * as React from 'react';
import { EVENT_TYPES } from '@/types';
import { cn } from '@/lib/utils';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Command as CommandPrimitive } from 'cmdk';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';

/**
 * EventTypeAutocomplete — canonical 20-entry seed list with free-text fallback.
 * Free typing remains supported (any value is accepted on blur/submit). The
 * dropdown surface is a cmdk Command, which gives keyboard arrow nav, escape,
 * and proper combobox/listbox ARIA roles.
 */

// Canonical labels from the 20-entry constant (cultural + general).
const CANONICAL_SEED = EVENT_TYPES.map((e) => e.label);

// Cultural aliases not captured in canonical labels (free-text typing helpers).
// Each entry is a culturally-significant name (Hindi/Arabic/etc) — `translate="no"`
// is applied so browsers don't auto-translate them. See web-interface-guidelines audit.
const ALIAS_SEED = [
  'Henna',
  'Mayoon',
  'Dholki',
  'Rukhsati',
  'Haldi',
  'Garba',
  'Dandiya',
  'Katb el-Kitab',
  'Zaffa',
  'Henna Night',
  'Bachelorette',
  'Rehearsal Dinner',
  'Bar Mitzvah',
  'Bat Mitzvah',
  'Religious Ceremony',
];

const EVENT_TYPE_SEED = [...CANONICAL_SEED, ...ALIAS_SEED];

interface Props {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  inputId?: string;
}

export function EventTypeAutocomplete({ value, onChange, className, inputId }: Props) {
  const [open, setOpen] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const handlePick = (label: string) => {
    onChange(label);
    setOpen(false);
    // Restore focus to the input so users can keep typing/tabbing.
    inputRef.current?.focus();
  };

  return (
    <Command shouldFilter={true} className="overflow-visible bg-transparent">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverAnchor asChild>
          <CommandPrimitive.Input
            ref={inputRef}
            id={inputId}
            value={value}
            onValueChange={(v) => {
              onChange(v);
              if (!open) setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setOpen(false)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setOpen(false);
            }}
            placeholder="e.g. Mehndi, Walima, Sangeet, Birthday"
            className={cn(
              'w-full rounded border p-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-indigo focus-visible:ring-offset-2 focus-visible:ring-offset-cream',
              className
            )}
            // Cultural terms should NOT be machine-translated by browsers.
            translate="no"
          />
        </PopoverAnchor>
        <PopoverContent
          align="start"
          // Don't yank focus from the input when the popover opens.
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
          className="w-[--radix-popover-trigger-width] p-0"
        >
          <CommandList>
            <CommandEmpty>Press Enter to use “{value}”.</CommandEmpty>
            <CommandGroup>
              {EVENT_TYPE_SEED.map((t) => (
                <CommandItem key={t} value={t} onSelect={() => handlePick(t)} translate="no">
                  {t}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </PopoverContent>
      </Popover>
    </Command>
  );
}

export default EventTypeAutocomplete;
