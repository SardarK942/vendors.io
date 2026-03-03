'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertCircle } from 'lucide-react';

export default function StripeRefreshPage() {
  const [loading, setLoading] = useState(false);

  const handleRetry = async () => {
    setLoading(true);
    const res = await fetch('/api/vendors/stripe/connect', { method: 'POST' });
    const data = await res.json();

    if (!res.ok) {
      toast.error(data.error || 'Failed to restart onboarding');
      setLoading(false);
      return;
    }

    window.location.href = data.data.onboardingUrl;
  };

  return (
    <div className="mx-auto max-w-md">
      <Card>
        <CardHeader className="text-center">
          <AlertCircle className="mx-auto h-12 w-12 text-yellow-600" />
          <CardTitle className="mt-4">Onboarding Incomplete</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-center">
          <p className="text-muted-foreground">
            Your Stripe onboarding session expired or was interrupted. Click below to continue where
            you left off.
          </p>
          <Button onClick={handleRetry} disabled={loading}>
            {loading ? 'Loading...' : 'Continue Stripe Setup'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
