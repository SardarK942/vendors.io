'use client';
import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogFooter } from '@/components/ui/dialog';

interface Props {
  businessName: string;
  category: string;
  currentBio: string;
  onAccept: (polished: string) => void;
}

export function BioAssistButton({ businessName, category, currentBio, onAccept }: Props) {
  const [open, setOpen] = useState(false);
  const [suggestion, setSuggestion] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setOpen(true);
    setSuggestion('');
    setError(null);
    setStreaming(true);
    try {
      const res = await fetch('/api/ai/bio-assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessName, category, draft: currentBio }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({ error: 'Request failed' }));
        setError(e.error);
        setStreaming(false);
        return;
      }
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = JSON.parse(line.slice(6));
          if (payload.text) setSuggestion((s) => s + payload.text);
          if (payload.error) setError(payload.error);
        }
      }
      setStreaming(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Stream failed');
      setStreaming(false);
    }
  }

  const disabled = !businessName || !category;

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={start} disabled={disabled}>
        <Sparkles className="h-3 w-3 mr-1" />
        Help me write this
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogTitle>AI suggestion</DialogTitle>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="rounded-md border bg-muted/30 p-4 min-h-[120px] whitespace-pre-wrap text-sm">
            {suggestion || (streaming ? 'Generating…' : '')}
          </div>
          <p className="text-xs text-muted-foreground">
            Edit it below before accepting if you want changes.
          </p>
          <textarea
            className="w-full rounded-md border p-2 text-sm"
            rows={5}
            value={suggestion}
            onChange={(e) => setSuggestion(e.target.value)}
            disabled={streaming}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => { onAccept(suggestion); setOpen(false); }} disabled={streaming || !suggestion}>
              Use this
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
