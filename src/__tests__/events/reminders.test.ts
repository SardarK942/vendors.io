import { describe, it, expect } from 'vitest';
import {
  daysUntil,
  selectDueSoonTasks,
  selectOverdueTasks,
  selectCountdownFunctions,
} from '@/lib/events/derive';
import type { EventTaskRow, EventFunctionRow } from '@/types/database.types';

const task = (over: Partial<EventTaskRow>): EventTaskRow => ({
  id: 't1',
  event_id: 'e1',
  event_function_id: null,
  title: 'Book decor',
  due_date: null,
  completed_at: null,
  due_soon_notified_at: null,
  overdue_notified_at: null,
  sort: 0,
  created_at: '',
  updated_at: '',
  ...over,
});
const fn = (over: Partial<EventFunctionRow>): EventFunctionRow => ({
  id: 'f1',
  event_id: 'e1',
  sequence: 1,
  label: 'Mehndi',
  event_type_id: 'mehndi',
  date: null,
  start_time: null,
  end_time: null,
  venue_name: null,
  city: null,
  guest_estimate: null,
  notes: null,
  created_at: '',
  updated_at: '',
  ...over,
});

const TODAY = '2026-07-18';

it('daysUntil counts whole days', () => {
  expect(daysUntil('2026-07-21', TODAY)).toBe(3);
  expect(daysUntil('2026-07-17', TODAY)).toBe(-1);
});

it('selectDueSoonTasks picks tasks due within 3 days, unnotified, incomplete', () => {
  const due = task({ id: 'a', due_date: '2026-07-20' });
  const far = task({ id: 'b', due_date: '2026-08-01' });
  const done = task({ id: 'c', due_date: '2026-07-19', completed_at: '2026-07-01T00:00:00Z' });
  const already = task({
    id: 'd',
    due_date: '2026-07-19',
    due_soon_notified_at: '2026-07-16T00:00:00Z',
  });
  expect(selectDueSoonTasks([due, far, done, already], TODAY).map((t) => t.id)).toEqual(['a']);
});

it('selectDueSoonTasks includes both window boundaries: due today (d=0) and d=3', () => {
  const dueToday = task({ id: 'd0', due_date: TODAY });
  const dueInThree = task({ id: 'd3', due_date: '2026-07-21' });
  const dueInFour = task({ id: 'd4', due_date: '2026-07-22' });
  expect(selectDueSoonTasks([dueToday, dueInThree, dueInFour], TODAY).map((t) => t.id)).toEqual([
    'd0',
    'd3',
  ]);
});

it('selectOverdueTasks picks past-due, unnotified, incomplete', () => {
  const over = task({ id: 'a', due_date: '2026-07-17' });
  const today = task({ id: 'b', due_date: '2026-07-18' });
  const notified = task({
    id: 'c',
    due_date: '2026-07-01',
    overdue_notified_at: '2026-07-02T00:00:00Z',
  });
  expect(selectOverdueTasks([over, today, notified], TODAY).map((t) => t.id)).toEqual(['a']);
});

it('selectCountdownFunctions matches exact milestones 30/14/7/1', () => {
  const f30 = fn({ id: 'f30', date: '2026-08-17' });
  const f7 = fn({ id: 'f7', date: '2026-07-25' });
  const f5 = fn({ id: 'f5', date: '2026-07-23' });
  const past = fn({ id: 'fp', date: '2026-07-01' });
  const res = selectCountdownFunctions([f30, f7, f5, past], TODAY);
  expect(res.map((r) => [r.fn.id, r.daysOut])).toEqual([
    ['f30', 30],
    ['f7', 7],
  ]);
});
