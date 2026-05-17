'use client';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { VENDOR_CATEGORIES, VENDOR_CATEGORY_LABELS } from '@/lib/utils';

export type TimeFilter = 'upcoming' | 'past' | 'all';

interface Props {
  timeFilter: TimeFilter;
  onTimeChange: (t: TimeFilter) => void;
  categoryFilter: string;  // '' = all categories
  onCategoryChange: (c: string) => void;
}

export function EventCardFilters({ timeFilter, onTimeChange, categoryFilter, onCategoryChange }: Props) {
  const tabs: Array<{ key: TimeFilter; label: string }> = [
    { key: 'upcoming', label: 'Upcoming' },
    { key: 'past', label: 'Past' },
    { key: 'all', label: 'All' },
  ];

  return (
    <div className="flex flex-wrap items-center gap-4 mb-6">
      <div className="flex gap-1 rounded-md bg-muted p-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => onTimeChange(t.key)}
            className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
              timeFilter === t.key
                ? 'bg-background shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 ml-auto">
        <span className="text-sm text-muted-foreground">Category:</span>
        <Select value={categoryFilter || 'all'} onValueChange={(v) => onCategoryChange(v === 'all' ? '' : v)}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {VENDOR_CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>{VENDOR_CATEGORY_LABELS[c]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
