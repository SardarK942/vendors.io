'use client';
import { AnimatePresence, useReducedMotion } from 'framer-motion';

export function FamilyDrawerAnimatedContent({ children }: { children: React.ReactNode }) {
  // When reduce-motion is on, skip AnimatePresence's exit coordination so
  // outgoing children are unmounted on the same frame instead of running
  // their exit transition. New content still appears, just without the
  // enter/exit motion choreography.
  const prefersReducedMotion = useReducedMotion();
  if (prefersReducedMotion) return <>{children}</>;
  return <AnimatePresence mode="popLayout">{children}</AnimatePresence>;
}
