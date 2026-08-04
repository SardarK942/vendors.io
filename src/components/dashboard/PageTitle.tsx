import * as React from 'react';
import { cn } from '@/lib/utils';

interface PageTitleProps {
  children: React.ReactNode;
  subtitle?: string;
  className?: string;
}

export function PageTitle({ children, subtitle, className }: PageTitleProps) {
  return (
    <div
      className={cn('flex flex-col items-start gap-2', className)}
      data-testid="page-title-wrapper"
    >
      <h1
        className={cn(
          'inline-block rounded-md bg-haldi px-3.5 py-1.5 text-2xl font-medium leading-tight',
          'text-balance font-serif text-ink',
          'shadow-[2px_2px_0_rgba(27,20,20,0.08)]'
        )}
      >
        {children}
      </h1>
      {subtitle ? <p className="text-sm text-ink-muted">{subtitle}</p> : null}
    </div>
  );
}
