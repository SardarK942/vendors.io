'use client';

import { useState } from 'react';
import { ClaimVendorProfile } from '@/components/dashboard/ClaimVendorProfile';
import { VendorProfileForm } from '@/components/forms/VendorProfileForm';
import { Button } from '@/components/ui/button';

interface ProfileSetupProps {
  initialMode: 'claim' | 'create';
}

export function ProfileSetup({ initialMode }: ProfileSetupProps) {
  const [mode, setMode] = useState<'claim' | 'create'>(initialMode);

  if (mode === 'create') {
    return (
      <div className="space-y-4">
        <Button variant="outline" size="sm" onClick={() => setMode('claim')}>
          &larr; Back to search
        </Button>
        <VendorProfileForm vendorProfile={null} />
      </div>
    );
  }

  return <ClaimVendorProfile onCreateNew={() => setMode('create')} />;
}
