'use client';
import { AnimatePresence } from 'framer-motion';

export function FamilyDrawerAnimatedContent({ children }: { children: React.ReactNode }) {
  return <AnimatePresence mode="popLayout">{children}</AnimatePresence>;
}
