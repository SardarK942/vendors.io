'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { daysUntil } from '@/lib/events/derive';
import { cn } from '@/lib/utils';
import type { EventFunctionRow, EventTaskRow } from '@/types/database.types';

interface TasksPanelProps {
  eventId: string;
  tasks: EventTaskRow[];
  functions: EventFunctionRow[];
  todayIso: string;
}

const DUE_SOON_WINDOW_DAYS = 3;
const NO_FUNCTION = '__none__';

type Bucket = 'overdue' | 'due_soon' | 'rest' | 'completed';

function classify(task: EventTaskRow, todayIso: string): Bucket {
  if (task.completed_at) return 'completed';
  if (!task.due_date) return 'rest';
  const d = daysUntil(task.due_date, todayIso);
  if (d < 0) return 'overdue';
  if (d <= DUE_SOON_WINDOW_DAYS) return 'due_soon';
  return 'rest';
}

function fmtDue(dateIso: string): string {
  return new Date(`${dateIso}T00:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

const BUCKET_ORDER: Bucket[] = ['overdue', 'due_soon', 'rest', 'completed'];

function sortTasks(tasks: EventTaskRow[], todayIso: string): EventTaskRow[] {
  const byBucket = new Map<Bucket, EventTaskRow[]>(BUCKET_ORDER.map((b) => [b, []]));
  for (const t of tasks) byBucket.get(classify(t, todayIso))!.push(t);
  for (const bucket of BUCKET_ORDER) {
    byBucket.get(bucket)!.sort((a, b) => {
      if (a.due_date && b.due_date)
        return a.due_date < b.due_date ? -1 : a.due_date > b.due_date ? 1 : 0;
      if (a.due_date) return -1;
      if (b.due_date) return 1;
      return a.sort - b.sort;
    });
  }
  return BUCKET_ORDER.flatMap((b) => byBucket.get(b)!);
}

async function callTasksApi(
  eventId: string,
  method: 'POST' | 'PATCH' | 'DELETE',
  body: unknown
): Promise<void> {
  const res = await fetch(`/api/events/${eventId}/tasks`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: null }));
    throw new Error(err?.error ?? 'Something went wrong. Please try again.');
  }
}

export function TasksPanel({ eventId, tasks, functions, todayIso }: TasksPanelProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [functionId, setFunctionId] = useState(NO_FUNCTION);
  const sortedFunctions = [...functions].sort((a, b) => a.sequence - b.sequence);

  async function runMutation(fn: () => Promise<void>, successMsg?: string) {
    setBusy(true);
    try {
      await fn();
      if (successMsg) toast.success(successMsg);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function handleAdd() {
    const trimmed = title.trim();
    if (!trimmed) return;
    await runMutation(
      () =>
        callTasksApi(eventId, 'POST', {
          title: trimmed,
          due_date: dueDate || null,
          event_function_id: functionId === NO_FUNCTION ? null : functionId,
        }),
      'Task added'
    );
    setTitle('');
    setDueDate('');
    setFunctionId(NO_FUNCTION);
  }

  const ordered = sortTasks(tasks, todayIso);

  return (
    <Card className="border-hairline shadow-none">
      <CardHeader className="pb-2">
        <p className="font-display text-lg text-ink">Tasks</p>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        {ordered.length === 0 ? (
          <p className="text-sm text-ink-soft">No tasks yet — add your first one below.</p>
        ) : (
          <div className="space-y-1.5">
            {ordered.map((task) => {
              const bucket = classify(task, todayIso);
              return (
                <div
                  key={task.id}
                  className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-cream-soft/50"
                >
                  <input
                    type="checkbox"
                    checked={Boolean(task.completed_at)}
                    disabled={busy}
                    aria-label={`Mark "${task.title}" ${task.completed_at ? 'not done' : 'done'}`}
                    onChange={(e) =>
                      runMutation(() =>
                        callTasksApi(eventId, 'PATCH', {
                          task_id: task.id,
                          completed: e.target.checked,
                        })
                      )
                    }
                    className="h-4 w-4 shrink-0 rounded border-input accent-ink"
                  />
                  {bucket === 'due_soon' && (
                    <span
                      aria-hidden="true"
                      className="h-1.5 w-1.5 shrink-0 rounded-full bg-haldi"
                    />
                  )}
                  <span
                    className={cn(
                      'min-w-0 flex-1 truncate text-sm text-ink',
                      bucket === 'completed' && 'text-ink-soft line-through'
                    )}
                  >
                    {task.title}
                  </span>
                  {task.due_date && (
                    <span
                      className={cn(
                        'shrink-0 text-xs text-ink-soft',
                        bucket === 'overdue' && 'font-medium text-hot-pink'
                      )}
                    >
                      {fmtDue(task.due_date)}
                    </span>
                  )}
                  <button
                    type="button"
                    aria-label={`Delete "${task.title}"`}
                    disabled={busy}
                    onClick={() =>
                      runMutation(
                        () => callTasksApi(eventId, 'DELETE', { task_id: task.id }),
                        'Task removed'
                      )
                    }
                    className="shrink-0 text-ink-soft hover:text-ink"
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <div className="space-y-2 border-t border-hairline pt-3">
          <Input
            value={title}
            placeholder="Add a task"
            maxLength={200}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void handleAdd();
              }
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            {sortedFunctions.length > 0 && (
              <Select value={functionId} onValueChange={setFunctionId}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="No function" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_FUNCTION}>No function</SelectItem>
                  {sortedFunctions.map((fn) => (
                    <SelectItem key={fn.id} value={fn.id}>
                      {fn.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={busy || !title.trim()}
              onClick={() => void handleAdd()}
            >
              Add
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
