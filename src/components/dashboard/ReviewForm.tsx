'use client';

import { useId, useRef, useState, type KeyboardEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Star } from 'lucide-react';

interface ReviewFormProps {
  bookingId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  /** Vendor display name used in the prompt copy. */
  vendorName?: string;
}

/**
 * 5-star rating rendered as a WAI-ARIA radiogroup. Roving tabindex: only the
 * selected (or first, when unset) star sits in tab order. Arrow keys move
 * selection; Home jumps to 1, End to 5; Space / Enter confirm.
 */
function StarRating({
  value,
  onChange,
  label,
}: {
  /** 0 means unset (no preselection). */
  value: number;
  onChange: (v: number) => void;
  label: string;
}) {
  const labelId = useId();
  const buttonsRef = useRef<Array<HTMLButtonElement | null>>([]);

  const focusStar = (n: number) => {
    const clamped = Math.max(1, Math.min(5, n));
    buttonsRef.current[clamped - 1]?.focus();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>, n: number) => {
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown': {
        e.preventDefault();
        const next = n === 5 ? 1 : n + 1;
        onChange(next);
        focusStar(next);
        break;
      }
      case 'ArrowLeft':
      case 'ArrowUp': {
        e.preventDefault();
        const next = n === 1 ? 5 : n - 1;
        onChange(next);
        focusStar(next);
        break;
      }
      case 'Home': {
        e.preventDefault();
        onChange(1);
        focusStar(1);
        break;
      }
      case 'End': {
        e.preventDefault();
        onChange(5);
        focusStar(5);
        break;
      }
      case ' ':
      case 'Enter': {
        e.preventDefault();
        onChange(n);
        break;
      }
    }
  };

  // When no rating set yet, the first star takes tabindex 0 so the group is
  // reachable; otherwise only the selected star is in tab order.
  const tabbableIdx = value === 0 ? 0 : value - 1;

  return (
    <div className="flex items-center justify-between">
      <Label id={labelId}>{label}</Label>
      <div role="radiogroup" aria-labelledby={labelId} aria-required="true" className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n, i) => {
          const checked = n === value;
          return (
            <button
              key={n}
              ref={(el) => {
                buttonsRef.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={checked}
              aria-label={`${n} stars`}
              tabIndex={i === tabbableIdx ? 0 : -1}
              onClick={() => onChange(n)}
              onKeyDown={(e) => handleKeyDown(e, n)}
              className="rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo focus-visible:ring-offset-2 focus-visible:ring-offset-cream"
            >
              <Star
                className={`h-6 w-6 ${
                  value > 0 && n <= value
                    ? 'fill-amber-400 text-amber-400'
                    : 'text-muted-foreground'
                }`}
                aria-hidden="true"
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function ReviewForm({
  bookingId,
  open,
  onOpenChange,
  onSuccess,
  vendorName,
}: ReviewFormProps) {
  // No preselected rating — audit notes 5 default biased outcomes.
  const [overall, setOverall] = useState(0);
  const [quality, setQuality] = useState(0);
  const [communication, setCommunication] = useState(0);
  const [professionalism, setProfessionalism] = useState(0);
  const [value, setValue] = useState(0);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);

  const allRated =
    overall > 0 && quality > 0 && communication > 0 && professionalism > 0 && value > 0;

  const handleSubmit = async () => {
    if (!allRated) {
      toast.error('Please rate each category before submitting.');
      return;
    }
    setLoading(true);
    const res = await fetch('/api/reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bookingRequestId: bookingId,
        ratingOverall: overall,
        ratingQuality: quality,
        ratingCommunication: communication,
        ratingProfessionalism: professionalism,
        ratingValue: value,
        comment: comment.trim() || undefined,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error || 'Failed to submit review');
      setLoading(false);
      return;
    }

    toast.success('Review submitted!');
    setLoading(false);
    onOpenChange(false);
    onSuccess?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Leave a Review</DialogTitle>
          <DialogDescription>
            {vendorName
              ? `Rate your experience with ${vendorName}.`
              : 'Rate your experience with this vendor.'}{' '}
            Rate (out of 5).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <StarRating value={overall} onChange={setOverall} label="Overall" />
          <StarRating value={quality} onChange={setQuality} label="Quality" />
          <StarRating value={communication} onChange={setCommunication} label="Communication" />
          <StarRating
            value={professionalism}
            onChange={setProfessionalism}
            label="Professionalism"
          />
          <StarRating value={value} onChange={setValue} label="Value" />

          <div className="space-y-2">
            <Label htmlFor="comment">Comment (optional)</Label>
            <Textarea
              id="comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="What stood out? Any details for other customers?"
              rows={4}
              maxLength={4000}
              autoComplete="off"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading || !allRated}>
            {loading ? 'Submitting…' : 'Submit Review'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
