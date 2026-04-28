'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { createClient } from '@/lib/supabase/client';
import { VENDOR_CATEGORY_LABELS } from '@/lib/utils';

interface UnclaimedVendor {
  id: string;
  business_name: string;
  category: string;
  service_area: string[];
  instagram_handle: string | null;
}

interface ClaimVendorProfileProps {
  onCreateNew: () => void;
}

export function ClaimVendorProfile({ onCreateNew }: ClaimVendorProfileProps) {
  const router = useRouter();
  const supabase = createClient();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UnclaimedVendor[]>([]);
  const [searching, setSearching] = useState(false);
  const [claimingId, setClaimingId] = useState<string | null>(null);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSearching(true);
      const { data } = await supabase
        .from('vendor_profiles')
        .select('id, business_name, category, service_area, instagram_handle')
        .is('user_id', null)
        .ilike('business_name', `%${query.trim()}%`)
        .limit(10)
        .abortSignal(controller.signal);

      setResults((data as UnclaimedVendor[] | null) ?? []);
      setSearching(false);
    }, 250);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query, supabase]);

  const handleClaim = async (vendorId: string) => {
    setClaimingId(vendorId);
    const res = await fetch('/api/vendors/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vendorProfileId: vendorId }),
    });
    const data = await res.json();

    if (!res.ok) {
      toast.error(data.error || 'Failed to claim profile');
      setClaimingId(null);
      return;
    }

    toast.success('Profile claimed!');
    router.refresh();
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <label className="text-sm font-medium">Search for your business</label>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Start typing your business name..."
        />
        <p className="text-xs text-muted-foreground">
          We pre-populated a directory of Chicago Desi wedding vendors. Find yours to claim it.
        </p>
      </div>

      {searching && <p className="text-sm text-muted-foreground">Searching...</p>}

      {!searching && query.trim().length >= 2 && results.length === 0 && (
        <Card>
          <CardContent className="space-y-3 pt-6 text-center">
            <p className="text-sm text-muted-foreground">
              No unclaimed listing matches &quot;{query}&quot;.
            </p>
            <Button onClick={onCreateNew} variant="outline">
              Create a new profile instead
            </Button>
          </CardContent>
        </Card>
      )}

      {results.length > 0 && (
        <div className="space-y-2">
          {results.map((v) => (
            <Card key={v.id}>
              <CardContent className="flex items-center justify-between gap-4 pt-6">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{v.business_name}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="outline">
                      {VENDOR_CATEGORY_LABELS[v.category] || v.category}
                    </Badge>
                    {v.service_area?.length > 0 && <span>{v.service_area.join(', ')}</span>}
                    {v.instagram_handle && <span>@{v.instagram_handle}</span>}
                  </div>
                </div>
                <Button onClick={() => handleClaim(v.id)} disabled={claimingId === v.id} size="sm">
                  {claimingId === v.id ? 'Claiming...' : 'This is me'}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="border-t pt-4 text-center text-sm text-muted-foreground">
        Don&apos;t see your business?{' '}
        <button onClick={onCreateNew} className="font-medium text-primary hover:underline">
          Create a new profile
        </button>
      </div>
    </div>
  );
}
