'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { VENDOR_CATEGORIES, VENDOR_CATEGORY_LABELS } from '@/lib/utils';

export function FilterSidebar() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const currentCategory = searchParams.get('category') || '';
  const currentPriceMin = searchParams.get('priceMin') || '';
  const currentPriceMax = searchParams.get('priceMax') || '';

  const updateFilters = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.delete('page'); // Reset pagination on filter change
    router.push(`/vendors?${params.toString()}`);
  };

  const clearFilters = () => {
    router.push('/vendors');
  };

  return (
    <aside className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Filters</h3>
        <Button variant="ghost" size="sm" onClick={clearFilters}>
          Clear
        </Button>
      </div>

      {/* Category */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Category</Label>
        <div className="space-y-1">
          <button
            onClick={() => updateFilters('category', '')}
            className={`block w-full rounded px-2 py-1 text-left text-sm ${
              !currentCategory ? 'bg-primary/10 font-medium text-primary' : 'hover:bg-muted'
            }`}
          >
            All Categories
          </button>
          {VENDOR_CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => updateFilters('category', cat)}
              className={`block w-full rounded px-2 py-1 text-left text-sm ${
                currentCategory === cat
                  ? 'bg-primary/10 font-medium text-primary'
                  : 'hover:bg-muted'
              }`}
            >
              {VENDOR_CATEGORY_LABELS[cat]}
            </button>
          ))}
        </div>
      </div>

      {/* Price Range */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Price Range ($)</Label>
        <div className="flex gap-2">
          <Input
            type="number"
            placeholder="Min"
            value={currentPriceMin}
            onChange={(e) =>
              updateFilters('priceMin', e.target.value ? String(Number(e.target.value) * 100) : '')
            }
            className="w-full"
          />
          <Input
            type="number"
            placeholder="Max"
            value={currentPriceMax}
            onChange={(e) =>
              updateFilters('priceMax', e.target.value ? String(Number(e.target.value) * 100) : '')
            }
            className="w-full"
          />
        </div>
      </div>
    </aside>
  );
}
