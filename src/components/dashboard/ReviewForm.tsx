'use client';

import { useState } from 'react';
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
}

function StarRating({
  value,
  onChange,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  label: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <Label>{label}</Label>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className="transition"
            aria-label={`${n} stars`}
          >
            <Star
              className={`h-6 w-6 ${
                n <= value ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground'
              }`}
            />
          </button>
        ))}
      </div>
    </div>
  );
}

export function ReviewForm({ bookingId, open, onOpenChange, onSuccess }: ReviewFormProps) {
  const [overall, setOverall] = useState(5);
  const [quality, setQuality] = useState(5);
  const [communication, setCommunication] = useState(5);
  const [professionalism, setProfessionalism] = useState(5);
  const [value, setValue] = useState(5);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
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
          <DialogTitle>Leave a review</DialogTitle>
          <DialogDescription>Rate your experience with this vendor.</DialogDescription>
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
              placeholder="What stood out? Any details for other couples?"
              rows={4}
              maxLength={4000}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? 'Submitting...' : 'Submit review'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
