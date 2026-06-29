// src/components/onboarding/BioAssistCard.tsx
'use client';

import { useState, useRef, useEffect } from 'react';
import { Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface BioAssistCardProps {
  currentBio: string;
  businessName: string;
  category: string;
  onAccept: (newBio: string) => void;
}

type CardState =
  | { kind: 'idle' }
  | { kind: 'streaming'; suggestion: string }
  | { kind: 'complete'; suggestion: string }
  | { kind: 'error'; message: string };

export function BioAssistCard({
  currentBio,
  businessName,
  category,
  onAccept,
}: BioAssistCardProps) {
  const [state, setState] = useState<CardState>({ kind: 'idle' });
  const abortRef = useRef<AbortController | null>(null);

  const mode = currentBio.length < 20 ? 'draft' : 'polish';
  const idleLabel = mode === 'draft' ? '✨ Draft with AI' : '✨ Polish with AI';
  const loadingLabel = mode === 'draft' ? '⋯ Drafting…' : '⋯ Polishing…';

  async function start() {
    abortRef.current = new AbortController();
    setState({ kind: 'streaming', suggestion: '' });

    try {
      const res = await fetch('/api/ai/bio-assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, currentBio, businessName, category }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) {
        const msg =
          res.status === 429
            ? 'Bio assistant is busy — try again in a minute.'
            : 'Bio assistant unavailable. Please write your own for now.';
        setState({ kind: 'error', message: msg });
        return;
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let suggestion = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6).trim();
          try {
            const parsed = JSON.parse(payload) as { text?: string; error?: string; done?: boolean };
            if (parsed.done) {
              setState({ kind: 'complete', suggestion });
              return;
            }
            if (parsed.error) {
              setState({ kind: 'error', message: parsed.error });
              return;
            }
            if (parsed.text) {
              suggestion += parsed.text;
              setState({ kind: 'streaming', suggestion });
            }
          } catch {
            // skip malformed lines
          }
        }
      }
      // Stream ended without done terminator — treat what we got as complete
      if (suggestion) {
        setState({ kind: 'complete', suggestion });
      } else {
        setState({
          kind: 'error',
          message: 'No suggestions this time. Try tweaking your draft and retry.',
        });
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      setState({
        kind: 'error',
        message: 'Bio assistant unavailable. Please write your own for now.',
      });
    }
  }

  function dismiss() {
    abortRef.current?.abort();
    setState({ kind: 'idle' });
  }

  function accept() {
    if (state.kind !== 'complete') return;
    onAccept(state.suggestion);
    setState({ kind: 'idle' });
  }

  useEffect(() => {
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape' && state.kind !== 'idle') dismiss();
    }
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.kind]);

  const showCard = state.kind !== 'idle';
  const isLoading = state.kind === 'streaming';

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="secondary"
        onClick={start}
        disabled={isLoading}
        className="w-fit"
        aria-live="polite"
      >
        {isLoading ? loadingLabel : idleLabel}
      </Button>

      {showCard && (
        <div className="rounded-lg bg-cream p-3 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_2px_8px_rgba(0,0,0,0.04)]">
          <div className="flex items-start justify-between gap-2">
            <p className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-ink/60">
              <Sparkles className="size-3" /> AI Suggestion
            </p>
            <button
              type="button"
              onClick={dismiss}
              aria-label="Dismiss suggestion"
              className="text-ink/40 hover:text-ink"
            >
              <X className="size-4" />
            </button>
          </div>

          <p
            className="mt-2 whitespace-pre-wrap text-sm text-ink"
            aria-live="polite"
            aria-atomic="false"
          >
            {state.kind === 'error' ? state.message : state.suggestion}
            {state.kind === 'streaming' && (
              <span className="ml-1 inline-block h-4 w-1 animate-pulse bg-ink motion-reduce:animate-none" />
            )}
          </p>

          {state.kind === 'complete' && (
            <div className="mt-3 flex gap-2">
              <Button type="button" onClick={accept} className="bg-ink text-cream hover:bg-ink/90">
                Use this
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={dismiss}
                className="border-ink bg-cream text-ink hover:bg-cream/80"
              >
                Keep mine
              </Button>
            </div>
          )}

          {state.kind === 'error' && (
            <div className="mt-3 flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={dismiss}
                className="border-ink bg-cream text-ink hover:bg-cream/80"
              >
                Keep mine
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
