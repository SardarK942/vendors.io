'use client';
import { motion } from 'framer-motion';
import { useFamilyDrawer } from './useFamilyDrawer';

export function FamilyDrawerViewContent() {
  const { view, views } = useFamilyDrawer();
  const View = views[view] ?? views.default;
  if (!View) return null;

  return (
    <motion.div
      key={view}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
    >
      <View />
    </motion.div>
  );
}
