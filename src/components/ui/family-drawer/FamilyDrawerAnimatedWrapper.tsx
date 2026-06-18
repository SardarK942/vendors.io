'use client';
import { motion } from 'framer-motion';

export function FamilyDrawerAnimatedWrapper({ children }: { children: React.ReactNode }) {
  return (
    <motion.div layout transition={{ type: 'spring', stiffness: 300, damping: 30 }}>
      {children}
    </motion.div>
  );
}
