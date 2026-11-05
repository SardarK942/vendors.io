import * as React from 'react';
import { cn } from '@/lib/utils';

interface SectionCardProps {
  children: React.ReactNode;
  className?: string;
}

export function SectionCard({ children, className }: SectionCardProps) {
  return (
    <div className={cn('rounded-2xl border border-hairline bg-white p-5', className)}>
      {children}
    </div>
  );
}
