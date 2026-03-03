'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { VENDOR_CATEGORIES, VENDOR_CATEGORY_LABELS, generateSlug } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import type { Database } from '@/types/database.types';

type VendorRow = Database['public']['Tables']['vendor_profiles']['Row'];

interface VendorProfileFormProps {
  vendorProfile: VendorRow | null;
}

export function VendorProfileForm({ vendorProfile }: VendorProfileFormProps) {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const businessName = formData.get('businessName') as string;

    const payload = {
      business_name: businessName,
      slug: vendorProfile?.slug || generateSlug(businessName),
      category: formData.get('category') as string,
      bio: formData.get('bio') as string,
      service_area: ['Chicago'],
      starting_price_min: formData.get('priceMin')
        ? Math.round(Number(formData.get('priceMin')) * 100)
        : null,
      starting_price_max: formData.get('priceMax')
        ? Math.round(Number(formData.get('priceMax')) * 100)
        : null,
      instagram_handle: (formData.get('instagram') as string) || null,
      website_url: (formData.get('website') as string) || null,
      response_sla_hours: Number(formData.get('sla')) || 48,
    };

    if (vendorProfile) {
      const { error } = await supabase
        .from('vendor_profiles')
        .update(payload)
        .eq('id', vendorProfile.id);

      if (error) {
        toast.error('Failed to update profile');
        setLoading(false);
        return;
      }
      toast.success('Profile updated');
    } else {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        toast.error('Not authenticated');
        setLoading(false);
        return;
      }

      const { error } = await supabase
        .from('vendor_profiles')
        .insert({ ...payload, user_id: user.id });

      if (error) {
        toast.error('Failed to create profile');
        setLoading(false);
        return;
      }
      toast.success('Profile created');
    }

    setLoading(false);
    router.refresh();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Vendor Details</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="businessName">Business Name</Label>
              <Input
                id="businessName"
                name="businessName"
                required
                defaultValue={vendorProfile?.business_name}
                placeholder="Mehndi by Priya"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <Select name="category" defaultValue={vendorProfile?.category || undefined} required>
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {VENDOR_CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {VENDOR_CATEGORY_LABELS[cat]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="bio">Bio / Description</Label>
            <Textarea
              id="bio"
              name="bio"
              rows={4}
              defaultValue={vendorProfile?.bio || ''}
              placeholder="Tell couples about your services, style, and experience..."
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="priceMin">Starting Price ($)</Label>
              <Input
                id="priceMin"
                name="priceMin"
                type="number"
                min={0}
                step={1}
                defaultValue={
                  vendorProfile?.starting_price_min ? vendorProfile.starting_price_min / 100 : ''
                }
                placeholder="500"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="priceMax">Max Price ($)</Label>
              <Input
                id="priceMax"
                name="priceMax"
                type="number"
                min={0}
                step={1}
                defaultValue={
                  vendorProfile?.starting_price_max ? vendorProfile.starting_price_max / 100 : ''
                }
                placeholder="2000"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="instagram">Instagram Handle</Label>
              <Input
                id="instagram"
                name="instagram"
                defaultValue={vendorProfile?.instagram_handle || ''}
                placeholder="mehndibypriya"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="website">Website URL</Label>
              <Input
                id="website"
                name="website"
                type="url"
                defaultValue={vendorProfile?.website_url || ''}
                placeholder="https://..."
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="sla">Response Time (hours)</Label>
            <Input
              id="sla"
              name="sla"
              type="number"
              min={1}
              max={168}
              defaultValue={vendorProfile?.response_sla_hours || 48}
            />
          </div>

          <Button type="submit" disabled={loading}>
            {loading ? 'Saving...' : vendorProfile ? 'Update Profile' : 'Create Profile'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
