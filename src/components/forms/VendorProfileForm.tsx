'use client';

import { useId, useState } from 'react';
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
import { SubcategoryMultiSelect } from '@/components/onboarding/SubcategoryMultiSelect';
import { getSubcategoriesForCategory } from '@/lib/vendor-subcategories';
import type { Database } from '@/types/database.types';
import {
  GooglePlacesAutocomplete,
  type PlaceData,
} from '@/components/forms/GooglePlacesAutocomplete';

// Supabase client is still used for profile creation (INSERT) where user_id is needed
// Profile updates (UPDATE) go through PATCH /api/vendor-profile

type VendorRow = Database['public']['Tables']['vendor_profiles']['Row'];

interface VendorProfileFormProps {
  vendorProfile: VendorRow | null;
}

export function VendorProfileForm({ vendorProfile }: VendorProfileFormProps) {
  const router = useRouter();
  const supabase = createClient();
  const streetAddressId = useId();
  const [loading, setLoading] = useState(false);
  const [category, setCategory] = useState<string>(vendorProfile?.category ?? '');
  const [subcategories, setSubcategories] = useState<string[]>(vendorProfile?.subcategories ?? []);
  const [baseAddress, setBaseAddress] = useState<Partial<PlaceData>>({
    address_line_1: (vendorProfile as Record<string, unknown> | null)?.base_address_line_1 as
      | string
      | undefined,
    city: (vendorProfile as Record<string, unknown> | null)?.base_city as string | undefined,
    state: (vendorProfile as Record<string, unknown> | null)?.base_state as string | undefined,
    postal_code: (vendorProfile as Record<string, unknown> | null)?.base_postal_code as
      | string
      | undefined,
    google_place_id: (vendorProfile as Record<string, unknown> | null)?.base_google_place_id as
      | string
      | undefined,
  });
  const [baseAddressPublic, setBaseAddressPublic] = useState<boolean>(
    Boolean((vendorProfile as Record<string, unknown> | null)?.base_address_public)
  );

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const businessName = formData.get('businessName') as string;

    const payload = {
      business_name: businessName,
      slug: vendorProfile?.slug || generateSlug(businessName),
      category: formData.get(
        'category'
      ) as Database['public']['Tables']['vendor_profiles']['Insert']['category'],
      bio: formData.get('bio') as string,
      service_area: ['Chicago'],
      instagram_handle: (formData.get('instagram') as string) || null,
      website_url: (formData.get('website') as string) || null,
      response_sla_hours: Number(formData.get('sla')) || 48,
      // A2: base address fields
      base_address_line_1: baseAddress.address_line_1 || null,
      base_city: baseAddress.city || null,
      base_state: baseAddress.state || null,
      base_postal_code: baseAddress.postal_code || null,
      base_google_place_id: baseAddress.google_place_id || null,
      base_address_public: baseAddressPublic,
      subcategories: getSubcategoriesForCategory(category).length > 0 ? subcategories : null,
    };

    if (vendorProfile) {
      const res = await fetch('/api/vendor-profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const json = await res.json();
        const msg = json?.error?.message ?? json?.error ?? 'Failed to update profile';
        toast.error(typeof msg === 'string' ? msg : 'Failed to update profile');
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
                autoComplete="organization"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <Select
                name="category"
                value={category}
                onValueChange={(v) => {
                  setCategory(v);
                  setSubcategories([]);
                }}
                required
              >
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

          {getSubcategoriesForCategory(category).length > 0 && (
            <div className="space-y-2">
              <Label>Cart types you offer</Label>
              <SubcategoryMultiSelect
                category={category}
                selected={subcategories}
                onChange={setSubcategories}
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="bio">Bio / Description</Label>
            <Textarea
              id="bio"
              name="bio"
              rows={4}
              defaultValue={vendorProfile?.bio || ''}
              placeholder="Tell customers about your services, style, and experience…"
              autoComplete="off"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="instagram">Instagram Handle</Label>
              <Input
                id="instagram"
                name="instagram"
                defaultValue={vendorProfile?.instagram_handle || ''}
                placeholder="mehndibypriya"
                autoComplete="off"
                spellCheck={false}
                autoCapitalize="none"
                autoCorrect="off"
                inputMode="text"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="website">Website URL</Label>
              <Input
                id="website"
                name="website"
                type="url"
                defaultValue={vendorProfile?.website_url || ''}
                placeholder="https://…"
                autoComplete="url"
                inputMode="url"
                spellCheck={false}
                autoCapitalize="none"
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
              inputMode="numeric"
              autoComplete="off"
            />
          </div>

          {/* A2: Base Address + visibility */}
          <div className="space-y-3 border-t pt-4">
            <div>
              <h3 className="font-medium">Base Address</h3>
              <p className="text-xs text-muted-foreground">
                Required if any of your packages have &ldquo;At my location&rdquo; set. Your city
                and state are always public.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor={streetAddressId}>Street Address</Label>
              <GooglePlacesAutocomplete
                id={streetAddressId}
                value={baseAddress}
                onChange={(place) => setBaseAddress(place)}
                placeholder="Start typing your address…"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              {baseAddress.city && (
                <p className="text-xs text-muted-foreground">
                  {baseAddress.city}, {baseAddress.state} {baseAddress.postal_code}
                </p>
              )}
            </div>
            <label className="flex cursor-pointer items-start gap-2">
              <input
                type="checkbox"
                className="mt-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo focus-visible:ring-offset-2 focus-visible:ring-offset-cream"
                checked={baseAddressPublic}
                onChange={(e) => setBaseAddressPublic(e.target.checked)}
              />
              <span className="text-sm">
                Make my full address publicly visible
                <span className="block text-xs text-muted-foreground">
                  Most home-studio vendors keep this off — your full address is then only shared
                  with customers who pay the deposit. Your city and state are always public.
                </span>
              </span>
            </label>
          </div>

          <Button type="submit" disabled={loading}>
            {loading ? 'Saving…' : vendorProfile ? 'Update Profile' : 'Create Profile'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
