'use client';

import * as React from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, Check, Loader2 } from 'lucide-react';
import { newsletterSubscribeSchema } from '@/lib/newsletter/validation';

type FormState =
  | { kind: 'default' }
  | { kind: 'submitting' }
  | { kind: 'success' }
  | { kind: 'error-format'; message: string }
  | { kind: 'error-server'; message: string };

const SUCCESS_RESET_MS = 5000;

export function NewsletterForm() {
  const [email, setEmail] = React.useState('');
  const [state, setState] = React.useState<FormState>({ kind: 'default' });
  const resetTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    return () => {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (state.kind === 'submitting' || state.kind === 'success') return;

    const parsed = newsletterSubscribeSchema.safeParse({ email: email.trim() });
    if (!parsed.success) {
      setState({ kind: 'error-format', message: "Doesn't look right — try again." });
      return;
    }

    setState({ kind: 'submitting' });
    try {
      const res = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: parsed.data.email, source: 'footer' }),
      });
      if (!res.ok) {
        setState({ kind: 'error-server', message: 'Something glitched — try once more.' });
        return;
      }
      setState({ kind: 'success' });
      resetTimerRef.current = setTimeout(() => {
        setEmail('');
        setState({ kind: 'default' });
      }, SUCCESS_RESET_MS);
    } catch {
      setState({ kind: 'error-server', message: 'Something glitched — try once more.' });
    }
  };

  const submitting = state.kind === 'submitting';
  const success = state.kind === 'success';
  const isError = state.kind === 'error-format' || state.kind === 'error-server';
  const errorMessage = isError ? state.message : '';

  const reducedMotion = useReducedMotion();
  const iconTransition = reducedMotion
    ? { duration: 0 }
    : { type: 'spring' as const, duration: 0.3, bounce: 0 };
  const iconKey: 'submitting' | 'success' | 'idle' = submitting
    ? 'submitting'
    : success
      ? 'success'
      : 'idle';

  return (
    <form
      className="relative flex max-w-[480px] flex-1 items-center gap-2.5 md:ml-auto"
      onSubmit={handleSubmit}
    >
      <label htmlFor="footer-newsletter-email" className="sr-only">
        Email address
      </label>
      <input
        id="footer-newsletter-email"
        name="email"
        type="email"
        autoComplete="email"
        inputMode="email"
        spellCheck={false}
        autoCapitalize="none"
        placeholder={success ? 'Subscribed — keep an eye out.' : 'you@email.com'}
        value={success ? '' : email}
        onChange={(e) => {
          setEmail(e.target.value);
          if (isError) setState({ kind: 'default' });
        }}
        disabled={submitting || success}
        aria-invalid={isError || undefined}
        aria-describedby={isError ? 'footer-newsletter-error' : undefined}
        className={[
          'flex-1 rounded-full border bg-cream/[0.06] px-4 py-3 text-sm text-cream',
          'transition-colors duration-200 placeholder:text-cream/45 focus:outline-none',
          'focus-visible:ring-2 focus-visible:ring-hot-pink focus-visible:ring-offset-2 focus-visible:ring-offset-ink',
          isError ? 'border-haldi/60' : 'border-cream/[0.16] focus:border-hot-pink',
          submitting ? 'opacity-60' : '',
          success ? 'text-haldi placeholder:text-haldi' : '',
        ].join(' ')}
      />
      <button
        type="submit"
        aria-label="Subscribe to The Bazaar Letter"
        translate="no"
        disabled={submitting || success}
        className={[
          'flex h-10 w-10 flex-none items-center justify-center rounded-full bg-hot-pink text-cream',
          'ease-[cubic-bezier(.22,1,.36,1)] transition-transform duration-200',
          'hover:scale-[1.06] active:scale-[0.96] motion-reduce:hover:scale-100',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hot-pink focus-visible:ring-offset-2 focus-visible:ring-offset-ink',
        ].join(' ')}
      >
        <AnimatePresence initial={false} mode="popLayout">
          <motion.span
            key={iconKey}
            initial={{ scale: 0.25, opacity: 0, filter: 'blur(4px)' }}
            animate={{ scale: 1, opacity: 1, filter: 'blur(0px)' }}
            exit={{ scale: 0.25, opacity: 0, filter: 'blur(4px)' }}
            transition={iconTransition}
            className="inline-flex"
            aria-hidden="true"
          >
            {iconKey === 'submitting' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : iconKey === 'success' ? (
              <Check className="h-4 w-4" />
            ) : (
              <ArrowRight className="h-4 w-4" />
            )}
          </motion.span>
        </AnimatePresence>
      </button>
      <p
        id="footer-newsletter-error"
        role={isError ? 'alert' : undefined}
        aria-live="polite"
        className={[
          'absolute left-4 top-full mt-1.5 text-xs text-haldi transition-opacity duration-200',
          isError ? 'opacity-100' : 'opacity-0',
        ].join(' ')}
      >
        {errorMessage}
      </p>
    </form>
  );
}
