# Code Patterns & Style — Chicago Desi Wedding Vendor Marketplace

## Naming Conventions

| Element               | Convention                       | Example                               |
| --------------------- | -------------------------------- | ------------------------------------- |
| Files (components)    | PascalCase                       | `VendorCard.tsx`, `BookingForm.tsx`   |
| Files (utilities/lib) | camelCase                        | `embeddings.ts`, `resend.ts`          |
| Files (services)      | camelCase with `.service` suffix | `vendor.service.ts`                   |
| Files (types)         | camelCase with `.types` suffix   | `database.types.ts`                   |
| Files (API routes)    | `route.ts` in named folder       | `api/vendors/route.ts`                |
| React components      | PascalCase                       | `export function VendorCard()`        |
| Functions             | camelCase                        | `createBookingRequest()`              |
| Constants             | SCREAMING_SNAKE_CASE             | `PLATFORM_FEE_PERCENTAGE`             |
| Database columns      | snake_case                       | `vendor_profile_id`, `created_at`     |
| CSS classes           | Tailwind utilities               | `className="flex items-center gap-2"` |
| Environment variables | SCREAMING_SNAKE_CASE             | `STRIPE_SECRET_KEY`                   |
| Zod schemas           | camelCase with `Schema` suffix   | `bookingRequestSchema`                |

## Architecture Rules

### 1. Separation of Concerns (Strict)

```
Route Handler (app/api/...)    → Parse request, validate input, return response
  ↓ calls
Service Layer (services/...)   → Business logic, state machine transitions
  ↓ calls
Data Layer (lib/supabase/...)  → Database queries, RLS-enforced
```

**NEVER** put business logic in route handlers. **NEVER** call Supabase directly from route handlers.

### 2. API Route Handler Pattern

```typescript
// app/api/bookings/request/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createBookingRequest } from '@/services/booking.service';
import { bookingRequestSchema } from '@/types';

export async function POST(request: NextRequest) {
  // 1. Auth check
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2. Parse and validate input (Zod)
  const body = await request.json();
  const parsed = bookingRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  // 3. Delegate to service layer
  const result = await createBookingRequest(supabase, user.id, parsed.data);

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  // 4. Return response
  return NextResponse.json({ data: result.data }, { status: 201 });
}
```

### 3. Service Layer Pattern

```typescript
// services/booking.service.ts
import { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';
import type { BookingRequestInput } from '@/types';

type ServiceResult<T> = {
  data?: T;
  error?: string;
  status: number;
};

export async function createBookingRequest(
  supabase: SupabaseClient<Database>,
  coupleUserId: string,
  input: BookingRequestInput
): Promise<ServiceResult<{ id: string }>> {
  // Business logic: check if couple already has pending request for this vendor
  const { data: existing } = await supabase
    .from('booking_requests')
    .select('id')
    .eq('couple_user_id', coupleUserId)
    .eq('vendor_profile_id', input.vendorProfileId)
    .in('status', ['pending', 'quoted'])
    .single();

  if (existing) {
    return { error: 'You already have an active request with this vendor', status: 409 };
  }

  // Insert new booking request
  const { data, error } = await supabase
    .from('booking_requests')
    .insert({
      couple_user_id: coupleUserId,
      vendor_profile_id: input.vendorProfileId,
      event_date: input.eventDate,
      event_type: input.eventType,
      guest_count: input.guestCount,
      budget_min: input.budgetMin,
      budget_max: input.budgetMax,
      special_requests: input.specialRequests,
    })
    .select('id')
    .single();

  if (error) {
    return { error: 'Failed to create booking request', status: 500 };
  }

  // Trigger email notification (fire-and-forget)
  // sendBookingRequestEmail(vendorEmail, data.id); // async, don't await

  return { data: { id: data.id }, status: 201 };
}
```

### 4. Zod Validation Pattern

```typescript
// types/index.ts
import { z } from 'zod';

export const bookingRequestSchema = z.object({
  vendorProfileId: z.string().uuid(),
  eventDate: z.string().date(), // ISO date string
  eventType: z.enum(['engagement', 'mehndi', 'sangeet', 'wedding', 'reception', 'multiple']),
  guestCount: z.number().int().positive().optional(),
  budgetMin: z.number().int().nonnegative().optional(), // in cents
  budgetMax: z.number().int().nonnegative().optional(), // in cents
  specialRequests: z.string().max(1000).optional(),
});

export type BookingRequestInput = z.infer<typeof bookingRequestSchema>;

export const vendorSearchSchema = z.object({
  query: z.string().min(1).max(500),
  category: z
    .enum([
      'photography',
      'videography',
      'mehndi',
      'hair_makeup',
      'dj',
      'photobooth',
      'catering',
      'venue',
      'decor',
      'invitations',
    ])
    .optional(),
  priceMin: z.number().int().nonnegative().optional(),
  priceMax: z.number().int().nonnegative().optional(),
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(50).default(20),
});
```

### 5. Server Component Data Fetching (No useEffect)

```typescript
// app/(marketplace)/vendors/[slug]/page.tsx
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { VendorProfile } from '@/components/marketplace/VendorProfile';

interface VendorPageProps {
  params: Promise<{ slug: string }>;
}

export default async function VendorPage({ params }: VendorPageProps) {
  const { slug } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: vendor } = await supabase
    .from('vendor_profiles')
    .select('*, users!inner(full_name, email)')
    .eq('slug', slug)
    .eq('verified', true)
    .single();

  if (!vendor) notFound();

  return <VendorProfile vendor={vendor} />;
}

// Generate SEO metadata
export async function generateMetadata({ params }: VendorPageProps) {
  const { slug } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: vendor } = await supabase
    .from('vendor_profiles')
    .select('business_name, category, bio')
    .eq('slug', slug)
    .single();

  if (!vendor) return { title: 'Vendor Not Found' };

  return {
    title: `${vendor.business_name} — ${vendor.category} | Desi Wedding Marketplace`,
    description: vendor.bio?.slice(0, 160),
  };
}
```

### 6. Error Handling Pattern

```typescript
// lib/utils.ts

/**
 * Wrap async operations with consistent error handling.
 * Returns [data, null] on success, [null, error] on failure.
 */
export async function tryCatch<T>(fn: () => Promise<T>): Promise<[T, null] | [null, Error]> {
  try {
    const result = await fn();
    return [result, null];
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error(`[tryCatch] ${err.message}`, err);
    return [null, err];
  }
}
```

### 7. Money Handling (Always Cents)

```typescript
// All prices stored as integers in cents
// Display with formatPrice helper

export function formatPrice(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}

// Example: formatPrice(15000) → "$150.00"

// NEVER use floating point for money calculations
// BAD:  const total = price * 0.10;
// GOOD: const fee = Math.round(priceInCents * 10 / 100);
```

## Booking State Machine

```
STATES AND TRANSITIONS:

  pending ──→ quoted ──→ deposit_paid ──→ confirmed
    │            │            │
    ▼            ▼            ▼
  expired    cancelled     declined
             (by couple)   (by vendor → auto-refund)

RULES:
- pending → quoted:       Vendor submits quote (PUT /api/bookings/[id]/quote)
- pending → expired:      Auto-expire after 72 hours (cron job)
- pending → declined:     Vendor rejects request
- quoted → deposit_paid:  Couple pays via Stripe Checkout
- quoted → cancelled:     Couple cancels before payment
- deposit_paid → confirmed: Vendor confirms availability
- deposit_paid → declined:  Vendor double-booked → auto-refund

BUSINESS RULES:
- 72-hour expiration: Vendors must respond within 72 hours
- Quote validity: 7 days; couple must request new quote after
- Deposit hold: Stripe holds funds 7 days; auto-refund if vendor doesn't confirm
- Contact reveal: Vendor ONLY sees couple phone/email after deposit_paid
```

## Anti-Patterns (NEVER Do These)

```typescript
// BAD: Business logic in route handler
export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const body = await request.json();
  // ❌ Direct DB call with business logic in handler
  const { data } = await supabase.from('booking_requests').insert(body);
  return NextResponse.json(data);
}

// BAD: Using `any` type
const vendor: any = await getVendor(slug); // ❌

// BAD: Floating point money
const fee = price * 0.10; // ❌ Use integer cents

// BAD: useEffect for data fetching in a page component
useEffect(() => { fetch('/api/vendors').then(...) }, []); // ❌ Use server components

// BAD: Trusting client-side role checks alone
if (user.role === 'vendor') { /* allow */ } // ❌ Must also use Supabase RLS

// BAD: Exposing couple contact info before payment
return NextResponse.json({ phone: booking.couple_phone }); // ❌ Check couple_contact_revealed
```

## Git Commit Convention

```
feat: add vendor profile page with portfolio gallery
fix: resolve Stripe webhook signature verification error
chore: update Supabase types after migration
docs: update AGENTS.md roadmap after completing Phase 2
test: add unit tests for booking state machine
refactor: extract payment logic to payment.service.ts
```
