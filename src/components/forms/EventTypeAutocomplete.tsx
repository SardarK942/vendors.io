'use client';

/**
 * EventTypeAutocomplete — cultural seed list with free-text fallback.
 * Uses HTML5 <datalist> so any typed value is also accepted.
 */

const EVENT_TYPE_SEED = [
  // South Asian / Muslim
  'Nikah',
  'Mehndi',
  'Henna',
  'Mayoon',
  'Dholki',
  'Walima',
  'Engagement',
  'Rukhsati',
  // South Asian / Hindu
  'Sangeet',
  'Haldi',
  'Baraat',
  'Wedding Ceremony',
  'Reception',
  'Roka',
  'Garba',
  'Dandiya',
  // Arab
  'Katb el-Kitab',
  'Zaffa',
  'Henna Night',
  // Western generic
  'Bridal Shower',
  'Bachelorette',
  'Rehearsal Dinner',
  // Life events
  'Birthday',
  'Sweet 16',
  'Quinceañera',
  'Bar Mitzvah',
  'Bat Mitzvah',
  'Graduation',
  'Anniversary',
  'Baby Shower',
  'Aqiqah',
  // Other
  'Corporate Event',
  'Religious Ceremony',
  'Other',
];

interface Props {
  value: string;
  onChange: (v: string) => void;
  className?: string;
}

export function EventTypeAutocomplete({ value, onChange, className }: Props) {
  return (
    <>
      <input
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
