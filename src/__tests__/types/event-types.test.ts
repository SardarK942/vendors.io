// src/__tests__/types/event-types.test.ts
import { describe, it, expect } from 'vitest';
import { EVENT_TYPES, CULTURAL_EVENT_TYPES, GENERAL_EVENT_TYPES } from '@/types';

describe('EVENT_TYPES', () => {
  it('has exactly 23 entries', () => {
    expect(EVENT_TYPES).toHaveLength(23);
  });

  it('has 15 cultural + 8 general', () => {
    expect(CULTURAL_EVENT_TYPES).toHaveLength(15);
    expect(GENERAL_EVENT_TYPES).toHaveLength(8);
  });

  it('has expected cultural ids in order', () => {
    expect(CULTURAL_EVENT_TYPES.map((e) => e.id)).toEqual([
      'engagement',
      'roka',
      'tilak',
      'mehndi',
      'sangeet',
      'nikah',
      'baraat',
      'wedding',
      'reception',
      'walima',
      'aqiqah',
      'katb_el_kitab',
      'laylat_al_henna',
      'zaffa',
      'multiple',
    ]);
  });

  it('has expected general ids in order', () => {
    expect(GENERAL_EVENT_TYPES.map((e) => e.id)).toEqual([
      'birthday_party',
      'anniversary',
      'corporate_event',
      'baby_shower',
      'bridal_shower',
      'graduation',
      'quinceanera',
      'sweet_16',
    ]);
  });

  it('uses locked dual labels for wedding/mehndi/walima/aqiqah', () => {
    const byId = Object.fromEntries(EVENT_TYPES.map((e) => [e.id, e.label]));
    expect(byId.wedding).toBe('Wedding / Shaadi');
    expect(byId.mehndi).toBe('Mehndi / Henna');
    expect(byId.walima).toBe('Walima / Wedding Feast');
    expect(byId.aqiqah).toBe('Aqiqah / Baby Naming');
  });
});

describe('EVENT_TYPES — Arab additions', () => {
  it('includes katb_el_kitab in the cultural group', () => {
    const entry = EVENT_TYPES.find((e) => e.id === 'katb_el_kitab');
    expect(entry).toBeDefined();
    expect(entry?.group).toBe('cultural');
    expect(entry?.label).toMatch(/Katb el-Kitab/i);
  });

  it('includes laylat_al_henna in the cultural group', () => {
    const entry = EVENT_TYPES.find((e) => e.id === 'laylat_al_henna');
    expect(entry).toBeDefined();
    expect(entry?.group).toBe('cultural');
    expect(entry?.label).toMatch(/Laylat al-Henna/i);
  });

  it('includes zaffa in the cultural group', () => {
    const entry = EVENT_TYPES.find((e) => e.id === 'zaffa');
    expect(entry).toBeDefined();
    expect(entry?.group).toBe('cultural');
    expect(entry?.label).toMatch(/Zaffa/i);
  });
});
