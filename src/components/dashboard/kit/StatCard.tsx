import * as React from 'react';
import Link from 'next/link';
import { ArrowUpRight, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StatCardProps {
  icon: LucideIcon;
  value: string | number;
  label: string;
  detail?: string;
  href?: string;
  className?: string;
}

export function StatCard({ icon: Icon, value, label, detail, href, className }: StatCardProps) {
  const content = (
    <>
      <div className="flex items-center justify-between">
        <span className="flex size-[31px] items-center justify-center rounded-lg bg-indigo/10">
          <Icon className="size-4 text-indigo" aria-hidden="true" />
        </span>
        <span className="font-display text-[32px] leading-none text-hot-pink">{value}</span>
      </div>
      <p className="text-xs font-semibold text-ink">{label}</p>
      {detail ? (
        <div className="flex w-full items-end gap-1.5">
          <p className="flex-1 text-[10px] leading-relaxed text-ink-soft">{detail}</p>
          <ArrowUpRight className="size-3.5 shrink-0 text-indigo" aria-hidden="true" />
        </div>
      ) : null}
    </>
  );

  const base = 'flex flex-col gap-2.5 rounded-2xl border border-hairline bg-white p-4';

  if (href) {
    return (
      <Link href={href} className={cn(base, 'transition-colors hover:border-indigo/30', className)}>
        {content}
      </Link>
    );
  }

  return <div className={cn(base, className)}>{content}</div>;
}
