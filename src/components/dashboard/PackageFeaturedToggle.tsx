'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Star } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

interface Props {
  packageId: string;
  isFeatured: boolean;
}

/**
 * One-click "Most popular" control shown on each package card in the dashboard
 * list. Flagging one package clears the others server-side (single-featured),
 * so this optimistically flips only its own state and refreshes to pick up the
 * cleared siblings.
 */
export function PackageFeaturedToggle({ packageId, isFeatured }: Props) {
  const router = useRouter();
  const [optimistic, setOptimistic] = useState(isFeatured);
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    const next = !optimistic;
    setOptimistic(next);
    setLoading(true);
    try {
      const res = await fetch(`/api/packages/${packageId}/featured`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_featured: next }),
      });
      if (!res.ok) {
        setOptimistic(!next);
        const json = await res.json().catch(() => ({}));
        toast.error(json.error?.message ?? 'Failed to update');
        return;
      }
      toast.success(next ? 'Marked as most popular' : 'Removed “Most popular”');
      router.refresh();
    } catch {
      setOptimistic(!next);
      toast.error('Network error, please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      type="button"
      variant={optimistic ? 'primary' : 'outline'}
      size="sm"
      onClick={handleClick}
      disabled={loading}
      aria-pressed={optimistic}
      className={optimistic ? 'bg-hot-pink text-cream hover:bg-hot-pink/90' : ''}
      iconLeading={
        <Star className={`size-4 ${optimistic ? 'fill-current' : ''}`} aria-hidden="true" />
      }
    >
      {optimistic ? 'Most popular' : 'Mark popular'}
    </Button>
  );
}
