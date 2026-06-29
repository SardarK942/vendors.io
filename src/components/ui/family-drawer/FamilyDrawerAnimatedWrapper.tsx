'use client';
import { motion, useReducedMotion } from 'framer-motion';

export function FamilyDrawerAnimatedWrapper({ children }: { children: React.ReactNode }) {
  // Framer's useReducedMotion mirrors the system pref and updates on change.
  // When on, swap the spring for an instant transition so layout still
  // settles to the right size but without the springy animation pass.
  const prefersReducedMotion = useReducedMotion();
  const transition = prefersReducedMotion
    ? { duration: 0 }
    : { type: 'spring' as const, stiffness: 300, damping: 30 };
  return (
    <motion.div layout transition={transition}>
      {children}
    </motion.div>
  );
}
