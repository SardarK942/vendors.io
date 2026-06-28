'use client';

import { EVENT_TYPES } from '@/types';

/**
 * EventTypeAutocomplete — canonical 20-entry seed list with free-text fallback.
 * Uses HTML5 <datalist> so any typed value is also accepted.
 * Seed values are the human labels from the canonical EVENT_TYPES constant,
 * supplemented by cultural aliases so vendors can type familiar names.
 */

// Canonical labels from the 20-entry constant (cultural + general).
const CANONICAL_SEED = EVENT_TYPES.map((e) => e.label);

// Cultural aliases not captured in canonical labels (free-text typing helpers).
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
  return (
    <>
      <input
        id={inputId}
        type="text"
        list="event-types-seed"
        className={className ?? 'w-full rounded border p-2 text-sm'}
        placeholder="e.g. Mehndi, Walima, Sangeet, Birthday"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <datalist id="event-types-seed">
        {EVENT_TYPE_SEED.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
    </>
  );
}

export default EventTypeAutocomplete;
