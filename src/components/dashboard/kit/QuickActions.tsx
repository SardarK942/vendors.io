import * as React from 'react';
import Link from 'next/link';
import { ChevronRight, Zap, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface QuickActionListProps {
  title?: string;
  children: React.ReactNode;
}

export function QuickActionList({ title = 'Quick Actions', children }: QuickActionListProps) {
  return (
    <div className="rounded-2xl border border-hairline bg-white p-5">
      <div className="mb-2 flex items-center gap-2">
        <Zap className="size-4 text-indigo" aria-hidden="true" />
        <h3 className="font-display text-base text-ink">{title}</h3>
      </div>
      <div className="flex flex-col">{children}</div>
    </div>
  );
}

interface QuickActionItemProps {
  icon: LucideIcon;
  title: string;
  description: string;
  href?: string;
}

export function QuickActionItem({ icon: Icon, title, description, href }: QuickActionItemProps) {
  const content = (
    <>
      <span className="flex size-[38px] items-center justify-center rounded-full bg-indigo/10">
        <Icon className="size-[18px] text-indigo" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-semibold text-ink">{title}</span>
        <span className="block text-[10px] text-ink-soft">{description}</span>
      </span>
      <ChevronRight className="size-3 shrink-0 text-ink-soft" aria-hidden="true" />
    </>
  );

  const base = 'flex items-center gap-3 border-b border-hairline py-3 last:border-b-0';

  if (href) {
    return (
      <Link
        href={href}
        className={cn(base, '-mx-2 rounded-lg px-2 transition-colors hover:bg-cream-soft/40')}
      >
        {content}
      </Link>
    );
  }

  return <div className={base}>{content}</div>;
}
