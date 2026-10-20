/**
 * Seed the DEV database with two fully-populated demo accounts — one couple and
 * one vendor — so the couple dashboard and vendor dashboard can be screenshotted
 * / screen-recorded in a realistic, "full" state (for a dashboard redesign).
 *
 * What it creates (all idempotent — re-running wipes the prior demo set first):
 *   • demo.couple@demo.baazar.local  (login: see creds printed at the end)
 *       - one celebration event with 3 functions, vendor-need slots, budget
 *         allocations and a tasks checklist (overdue / due-soon / done)
 *       - ~5 bookings across varied statuses against supporting vendors
 *       - saved vendors, notifications across all three tabs
 *   • demo.vendor@demo.baazar.local  (login: see creds printed at the end)
 *       - a published Mehndi artist profile with real portfolio photos
 *       - 3 packages (one featured) with add-ons
 *       - ~6 incoming bookings (needs-reply / closing-soon / waiting / confirmed
 *         / completed) → populates Inbox, Operations, Calendar holds, Earnings
 *       - notifications
 *   • a pool of supporting vendor profiles + couple users (no login) that sit on
 *     the "other side" of the demo accounts' bookings so every card renders.
 *
 * SAFETY: refuses to run against the prod project ref. DEV data is throwaway.
 * Requires NEXT_PUBLIC_SUPABASE_URL (dev) + SUPABASE_SERVICE_ROLE_KEY.
 *
 * Usage:  npm run seed:demo-dashboards        (seed)
 *         npm run seed:demo-dashboards -- --clean   (remove the demo set only)
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';
import type { CreateEventInput } from '@/types';
import { createEventWithGraph, linkBookingToFunction } from '@/services/events.service';

const PROD_REF = 'obpdgihdskbxzgyctaib';
const DEMO_DOMAIN = '@demo.baazar.local';
const DEMO_SLUG_PREFIX = 'demo-dash-';
const PASSWORD = 'DemoDash!2026';

type Sb = SupabaseClient<Database>;

// --- Real portfolio image URLs already present on DEV (utfs.io = allowed host).
// Reused across demo vendors so every card/gallery renders a real photo.
const HENNA = [
  'https://utfs.io/f/D4Fxxpb8A6TPElgsfmJMJROnvwgxzh9sCSWyLiaFpd86DVZX',
  'https://utfs.io/f/D4Fxxpb8A6TP0JnFdhVoltA1DWUHjYOsxnNI4wJQvogpLbKZ',
  'https://utfs.io/f/D4Fxxpb8A6TPzsXYLM7FkCncH9wE0KBr7l8gpm3fj2SqXW5o',
];
const CART = 'https://utfs.io/f/D4Fxxpb8A6TPgRhHG0LPrbZ8NB2jAVY1xSGqU67EOWX9cvdI';

// --- Date helpers (runtime-relative — never hardcode, per repo convention). ---
const DAY = 86_400_000;
const d = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY);
const iso = (dt: Date) => dt.toISOString();
const ymd = (dt: Date) => dt.toISOString().slice(0, 10);
/** A timestamptz at a given local-ish hour on a day N days from now. */
const at = (offsetDays: number, hour: number) => {
  const dt = d(offsetDays);
  dt.setUTCHours(hour, 0, 0, 0);
  return dt.toISOString();
};

async function getSb(): Promise<Sb> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  if (url.includes(PROD_REF)) throw new Error('Refusing to run: URL points at the PROD project.');
  console.log(`DB: ${url}`);
  return createClient<Database>(url, key, { auth: { persistSession: false } });
}

async function clean(sb: Sb) {
  console.log('\n— Cleaning any prior demo set —');
  // Belt-and-braces: remove demo vendor profiles by slug first (FK cleanup),
  // then delete the demo auth users (cascades public.users + owned rows).
  await sb.from('vendor_profiles').delete().like('slug', `${DEMO_SLUG_PREFIX}%`);
  const { data: list } = await sb.auth.admin.listUsers({ perPage: 1000 });
  const demoUsers = (list?.users ?? []).filter((u) => u.email?.endsWith(DEMO_DOMAIN));
  for (const u of demoUsers) {
    await sb.auth.admin.deleteUser(u.id);
  }
  console.log(`  removed ${demoUsers.length} demo auth users (+ cascaded rows)`);
}

/** Create a confirmed/known-password auth user + mirror row in public.users. */
async function makeUser(
  sb: Sb,
  email: string,
  role: 'couple' | 'vendor',
  fullName: string,
  extra: Partial<Database['public']['Tables']['users']['Update']> = {}
): Promise<string> {
  const { data, error } = await sb.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: fullName, role },
  });
  if (error || !data.user) throw new Error(`createUser ${email}: ${error?.message}`);
  const id = data.user.id;
  const { error: upErr } = await sb.from('users').upsert({ id, email, role, ...extra } as never);
  if (upErr) throw new Error(`users upsert ${email}: ${upErr.message}`);
  return id;
}

interface VendorSpec {
  slug: string;
  business_name: string;
  category: string;
  bio: string;
  images: string[];
  languages: string[];
  subcategories: string[];
  years: number;
  capacity?: number;
}

async function makeVendorProfile(sb: Sb, userId: string, v: VendorSpec): Promise<string> {
  const { data, error } = await sb
    .from('vendor_profiles')
    .insert({
      user_id: userId,
      slug: v.slug,
      business_name: v.business_name,
      category: v.category,
      bio: v.bio,
      service_area: ['Chicago', 'Naperville', 'Schaumburg'],
      portfolio_images: v.images,
      portfolio_videos: [],
      languages: v.languages,
      subcategories: v.subcategories,
      services: [v.category],
      served_event_types: ['wedding', 'reception'],
      base_city: 'Chicago',
      base_state: 'IL',
      base_address_public: false,
      instagram_handle: v.slug.replace(/[^a-z0-9]/g, ''),
      response_sla_hours: 24,
      years_in_business: v.years,
      concurrent_capacity: v.capacity ?? 2,
      verified: true,
      is_active: true,
      onboarding_complete: true,
      published_at: iso(d(-30)),
    } as never)
    .select('id')
    .single();
  if (error || !data) throw new Error(`vendor_profile ${v.slug}: ${error?.message}`);
  return (data as { id: string }).id;
}

interface BookingSpec {
  coupleUserId: string;
  coupleFullName: string;
  vendorProfileId: string;
  packageName: string;
  basePriceCents: number;
  totalCents: number;
  guestCount: number;
  finalStatus: Database['public']['Tables']['bookings']['Row']['status'];
  eventLabel: string;
  eventOffsetDays: number;
  eventHour?: number;
  specialRequests?: string | null;
  // status-specific extras
  adjustmentAmountCents?: number;
  adjustmentReason?: string;
  closingSoon?: boolean; // accepted with imminent expiry
}

/**
 * Insert a booking as `pending`, add its booking_event, then transition to the
 * desired final status so the calendar-hold trigger (AFTER UPDATE OF status)
 * fires with the event present. Returns the booking id.
 */
/** Map a human event label to a valid bookings.event_type slug (else null). */
const EVENT_TYPE_SLUGS: Record<string, string> = {
  mehndi: 'mehndi',
  'mehndi night': 'mehndi',
  nikkah: 'nikah',
  nikah: 'nikah',
  reception: 'reception',
  wedding: 'wedding',
  engagement: 'engagement',
  sangeet: 'sangeet',
  walima: 'walima',
};
const eventTypeSlug = (label: string): string | null =>
  EVENT_TYPE_SLUGS[label.trim().toLowerCase()] ?? null;

// Statuses that create calendar holds — these must be reached via an UPDATE OF
// status (the sync trigger is AFTER UPDATE only), so insert as `pending` first.
const LOCKING_STATUSES = new Set([
  'accepted',
  'adjusted_quote_sent',
  'adjusted_quote_declined',
  'deposit_paid',
  'completed',
]);

async function makeBooking(sb: Sb, b: BookingSpec): Promise<string> {
  const depositCents = Math.round(b.totalCents * 0.05);
  const isQuote = b.finalStatus === 'pending_quote';
  const needsTransition = LOCKING_STATUSES.has(b.finalStatus);
  const initialStatus = needsTransition ? 'pending' : b.finalStatus;
  const { data: booking, error } = await sb
    .from('bookings')
    .insert({
      couple_user_id: b.coupleUserId,
      vendor_profile_id: b.vendorProfileId,
      couple_full_name: b.coupleFullName,
      couple_contact_phone: '(312) 555-0142',
      guest_count: b.guestCount,
      special_requests: b.specialRequests ?? null,
      status: initialStatus,
      package_name_snapshot: isQuote ? null : b.packageName,
      package_base_price_cents_snapshot: isQuote ? null : b.basePriceCents,
      selected_addons: [],
      total_price_cents: b.totalCents,
      event_type: eventTypeSlug(b.eventLabel),
      expires_at: iso(d(3)),
    } as never)
    .select('id')
    .single();
  if (error || !booking) throw new Error(`booking (${b.finalStatus}): ${error?.message}`);
  const bookingId = (booking as { id: string }).id;

  const completed = b.finalStatus === 'completed';
  const { error: evtErr } = await sb.from('booking_events').insert({
    booking_id: bookingId,
    sequence: 1,
    event_date: ymd(d(b.eventOffsetDays)),
    event_start_time: at(b.eventOffsetDays, b.eventHour ?? 16),
    event_end_time: at(b.eventOffsetDays, (b.eventHour ?? 16) + 4),
    event_type_label: b.eventLabel,
    address_line_1: '939 W Randolph St',
    city: 'Chicago',
    state: 'IL',
    postal_code: '60607',
    guest_count_override: b.guestCount,
    completed_at: completed ? iso(d(b.eventOffsetDays)) : null,
  } as never);
  if (evtErr) throw new Error(`booking_event (${b.finalStatus}): ${evtErr.message}`);

  if (needsTransition) {
    const update: Record<string, unknown> = { status: b.finalStatus };
    if (b.closingSoon) update.expires_at = iso(d(0.5));
    if (b.finalStatus === 'adjusted_quote_sent') {
      update.adjustment_amount_cents = b.adjustmentAmountCents ?? 25000;
      update.adjustment_reason = b.adjustmentReason ?? 'travel';
      update.adjustment_explanation =
        'Design complexity + travel to your venue for a larger bridal party.';
      update.vendor_adjustment_count = 1;
      update.negotiation_round_count = 1;
      update.total_price_cents = b.totalCents + (b.adjustmentAmountCents ?? 25000);
      update.expires_at = iso(d(2));
    }
    if (b.finalStatus === 'deposit_paid' || b.finalStatus === 'completed') {
      update.deposit_amount = depositCents;
      update.deposit_paid_at = iso(d(Math.min(b.eventOffsetDays - 5, -1)));
      update.couple_contact_revealed = true;
      update.couple_phone = '(312) 555-0142';
      update.couple_email = 'couple.contact@demo.baazar.local';
    }
    if (b.finalStatus === 'completed') update.completed_at = iso(d(b.eventOffsetDays));
    const { error: upErr } = await sb
      .from('bookings')
      .update(update as never)
      .eq('id', bookingId);
    if (upErr) throw new Error(`booking update (${b.finalStatus}): ${upErr.message}`);
  }
  return bookingId;
}

async function notify(
  sb: Sb,
  userId: string,
  type: string,
  title: string,
  body: string,
  bookingId: string | null,
  opts: { read?: boolean; ageDays?: number } = {}
) {
  const createdAt = iso(d(-(opts.ageDays ?? 0)));
  await sb.from('notifications').insert({
    user_id: userId,
    type,
    title,
    body,
    link: bookingId ? `/dashboard/bookings/${bookingId}` : '/dashboard',
    metadata: bookingId ? { booking_id: bookingId } : {},
    read_at: opts.read ? createdAt : null,
    created_at: createdAt,
    email_status: 'sent',
  } as never);
}

async function main() {
  const sb = await getSb();
  await clean(sb);
  if (process.argv.includes('--clean')) {
    console.log('\nClean-only run complete.');
    return;
  }

  console.log('\n— Creating demo accounts —');

  // === LOGIN VENDOR: a Mehndi artist (real henna photos fit perfectly) ========
  const vendorUserId = await makeUser(sb, `demo.vendor${DEMO_DOMAIN}`, 'vendor', 'Nadia Rahman');
  const vendorProfileId = await makeVendorProfile(sb, vendorUserId, {
    slug: `${DEMO_SLUG_PREFIX}henna-atelier`,
    business_name: 'Henna Atelier by Nadia',
    category: 'mehndi',
    bio: 'Bridal mehndi artistry with intricate Indo-Arabic detailing. Over a decade adorning Chicago brides for their mehndi, nikkah, and reception celebrations.',
    images: HENNA,
    languages: ['English', 'Urdu', 'Hindi'],
    subcategories: ['bridal', 'arabic'],
    years: 11,
    capacity: 2,
  });
  await sb
    .from('users')
    .update({ active_vendor_profile_id: vendorProfileId } as never)
    .eq('id', vendorUserId);

  // Packages (one featured) + add-ons
  const pkgs: Array<{
    name: string;
    price: number;
    featured: boolean;
    attrs: Record<string, unknown>;
    order: number;
    image: string;
  }> = [
    {
      name: 'Bridal Mehndi',
      price: 45000,
      featured: true,
      order: 0,
      image: HENNA[0],
      attrs: {
        coverage: 'Full hands + feet, elbow length',
        num_artists: 1,
        style: 'Indo-Arabic bridal',
      },
    },
    {
      name: 'Bridal Party (per person)',
      price: 8000,
      featured: false,
      order: 1,
      image: HENNA[1],
      attrs: { coverage: 'One side, wrist length', num_artists: 2, style: 'Modern / minimal' },
    },
    {
      name: 'Mehndi Night Package',
      price: 120000,
      featured: false,
      order: 2,
      image: HENNA[2],
      attrs: { coverage: 'Bride full + up to 10 guests', num_artists: 3, style: 'Mixed' },
    },
  ];
  const pkgIds: string[] = [];
  for (const p of pkgs) {
    const { data, error } = await sb
      .from('packages')
      .insert({
        vendor_profile_id: vendorProfileId,
        name: p.name,
        description:
          p.name === 'Bridal Mehndi'
            ? 'The signature bridal experience — a relaxed 3–4 hour session with intricate, long-lasting designs.'
            : 'Flexible coverage for your celebration.',
        base_price_cents: p.price,
        included_items: ['Consultation', 'Premium organic henna', 'Aftercare kit'],
        max_guests: null,
        duration_hours: 4,
        events_count: 1,
        location_mode: 'couple_provides',
        featured_image_url: p.image,
        display_order: p.order,
        is_active: true,
        is_featured: p.featured,
        capacity_unit: 'guests',
        pricing_unit: 'flat',
        attributes: p.attrs,
      } as never)
      .select('id')
      .single();
    if (error || !data) throw new Error(`package ${p.name}: ${error?.message}`);
    pkgIds.push((data as { id: string }).id);
  }
  await sb.from('package_addons').insert([
    {
      package_id: pkgIds[0],
      name: 'Groom / family hands',
      price_delta_cents: 6000,
      display_order: 0,
    },
    {
      package_id: pkgIds[0],
      name: 'Glitter & gems finish',
      price_delta_cents: 3500,
      display_order: 1,
    },
  ] as never);
  console.log(`  vendor: Henna Atelier by Nadia (${pkgIds.length} packages)`);

  // === SUPPORTING VENDOR POOL (couple's "other side" — no login) ==============
  const poolVendorOwner = await makeUser(
    sb,
    `demo.pool.vendors${DEMO_DOMAIN}`,
    'vendor',
    'Demo Vendor Pool'
  );
  const poolVendorSpecs: VendorSpec[] = [
    {
      slug: `${DEMO_SLUG_PREFIX}lumiere`,
      business_name: 'Lumière Studios',
      category: 'photography',
      bio: 'Editorial wedding photography.',
      images: [HENNA[0]],
      languages: ['English', 'Hindi'],
      subcategories: ['editorial'],
      years: 8,
    },
    {
      slug: `${DEMO_SLUG_PREFIX}saffron-table`,
      business_name: 'Saffron Table Catering',
      category: 'catering',
      bio: 'Chef-driven Desi feasts.',
      images: [HENNA[1]],
      languages: ['English', 'Punjabi'],
      subcategories: ['north-indian'],
      years: 12,
    },
    {
      slug: `${DEMO_SLUG_PREFIX}marigold`,
      business_name: 'Marigold & Co Decor',
      category: 'decor',
      bio: 'Lush florals and mandaps.',
      images: [HENNA[2]],
      languages: ['English'],
      subcategories: ['floral'],
      years: 7,
    },
    {
      slug: `${DEMO_SLUG_PREFIX}dhol-bass`,
      business_name: 'Dhol & Bass',
      category: 'dj',
      bio: 'High-energy sets and dhol.',
      images: [CART],
      languages: ['English', 'Punjabi'],
      subcategories: ['bhangra'],
      years: 9,
    },
    {
      slug: `${DEMO_SLUG_PREFIX}glow-bar`,
      business_name: 'Glow Bar Beauty',
      category: 'hair_makeup',
      bio: 'Soft-glam bridal beauty.',
      images: [HENNA[0]],
      languages: ['English', 'Urdu'],
      subcategories: ['bridal'],
      years: 6,
    },
  ];
  const pool: Record<string, string> = {};
  for (const spec of poolVendorSpecs) {
    pool[spec.category] = await makeVendorProfile(sb, poolVendorOwner, spec);
  }
  console.log(`  supporting vendor pool: ${poolVendorSpecs.length} profiles`);

  // === LOGIN COUPLE ===========================================================
  const coupleUserId = await makeUser(
    sb,
    `demo.couple${DEMO_DOMAIN}`,
    'couple',
    'Ayesha Siddiqui',
    {
      onboarding_data: {
        event_date: ymd(d(50)),
        categories: ['mehndi', 'photography', 'catering', 'decor', 'dj'],
        just_browsing: false,
      },
    }
  );

  // Celebration event graph (3 functions, needs, budget, tasks)
  const eventInput: CreateEventInput = {
    name: 'Ayesha & Omar’s Wedding',
    celebration_type: 'wedding',
    city: 'Chicago',
    total_budget_cents: 6_000_000,
    functions: [
      {
        label: 'Mehndi',
        date: ymd(d(48)),
        guest_estimate: 80,
        vendor_needs: [
          { category: 'mehndi', manual_booked: false },
          { category: 'decor', manual_booked: false },
          {
            category: 'catering',
            manual_booked: true,
            manual_vendor_name: 'Auntie’s Kitchen (family)',
            manual_amount_cents: 150000,
          },
        ],
      },
      {
        label: 'Nikkah',
        date: ymd(d(49)),
        guest_estimate: 200,
        vendor_needs: [
          { category: 'photography', manual_booked: false },
          { category: 'catering', manual_booked: false },
        ],
      },
      {
        label: 'Reception',
        date: ymd(d(50)),
        guest_estimate: 350,
        vendor_needs: [
          { category: 'dj', manual_booked: false },
          { category: 'decor', manual_booked: false },
          { category: 'hair_makeup', manual_booked: false },
        ],
      },
    ],
    allocations: [
      { category: 'catering', planned_cents: 2_500_000 },
      { category: 'decor', planned_cents: 1_200_000 },
      { category: 'photography', planned_cents: 800_000 },
      { category: 'dj', planned_cents: 500_000 },
      { category: 'mehndi', planned_cents: 300_000 },
    ],
    tasks: [
      { title: 'Finalize guest list', due_date: ymd(d(-5)), function_index: null },
      { title: 'Confirm mehndi artist', due_date: ymd(d(2)), function_index: 0 },
      { title: 'Send reception menu tasting date', due_date: ymd(d(10)), function_index: 2 },
      { title: 'Book hair & makeup trial', due_date: ymd(d(20)), function_index: 2 },
      { title: 'Choose photographer shot list', due_date: ymd(d(35)), function_index: 1 },
      { title: 'Create welcome sign artwork', due_date: null, function_index: null },
    ],
  };
  const evt = await createEventWithGraph(sb, coupleUserId, eventInput);
  if (evt.error || !evt.data) throw new Error(`event graph: ${evt.error}`);
  const fnByLabel = new Map(evt.data.functions.map((f) => [f.label, f.id]));
  // Mark the first two tasks done so the checklist shows a "completed" bucket.
  const { data: tasksRows } = await sb
    .from('event_tasks')
    .select('id, sort')
    .eq('event_id', evt.data.eventId)
    .order('sort');
  for (const t of (tasksRows ?? []).slice(0, 2)) {
    await sb
      .from('event_tasks')
      .update({ completed_at: iso(d(-1)) } as never)
      .eq('id', (t as { id: string }).id);
  }
  console.log(
    `  couple event: 3 functions, ${eventInput.tasks.length} tasks, ${eventInput.allocations.length} budget lines`
  );

  // Couple's bookings against the supporting vendor pool, varied statuses.
  const coupleBookings: Array<{
    status: BookingSpec['finalStatus'];
    cat: string;
    label: string;
    offset: number;
    pkg: string;
    base: number;
    total: number;
    guests: number;
    link?: string;
    special?: string;
  }> = [
    {
      status: 'deposit_paid',
      cat: 'photography',
      label: 'Nikkah',
      offset: 49,
      pkg: 'Full-Day Coverage',
      base: 420000,
      total: 420000,
      guests: 200,
      link: 'Nikkah',
      special: 'Candid-forward, two shooters for the nikkah + reception.',
    },
    {
      status: 'accepted',
      cat: 'catering',
      label: 'Reception',
      offset: 50,
      pkg: 'Reception Dinner (plated)',
      base: 2200000,
      total: 2200000,
      guests: 350,
      link: 'Nikkah',
    },
    {
      status: 'adjusted_quote_sent',
      cat: 'decor',
      label: 'Reception',
      offset: 50,
      pkg: 'Reception Stage + Florals',
      base: 950000,
      total: 950000,
      guests: 350,
      link: 'Reception',
    },
    {
      status: 'pending',
      cat: 'dj',
      label: 'Reception',
      offset: 50,
      pkg: 'Reception DJ + Dhol',
      base: 450000,
      total: 450000,
      guests: 350,
      link: 'Reception',
    },
    {
      status: 'completed',
      cat: 'hair_makeup',
      label: 'Engagement',
      offset: -40,
      pkg: 'Bridal Trial + Event',
      base: 160000,
      total: 160000,
      guests: 1,
    },
  ];
  const coupleBookingIds: Record<string, string> = {};
  for (const cb of coupleBookings) {
    const id = await makeBooking(sb, {
      coupleUserId,
      coupleFullName: 'Ayesha Siddiqui',
      vendorProfileId: pool[cb.cat],
      packageName: cb.pkg,
      basePriceCents: cb.base,
      totalCents: cb.total,
      guestCount: cb.guests,
      finalStatus: cb.status,
      eventLabel: cb.label,
      eventOffsetDays: cb.offset,
      specialRequests: cb.special ?? null,
    });
    coupleBookingIds[cb.cat] = id;
    // Link confirmed/active bookings into the journal so slots show "booked".
    if (cb.link && fnByLabel.has(cb.link)) {
      await linkBookingToFunction(sb, coupleUserId, {
        bookingId: id,
        eventFunctionId: fnByLabel.get(cb.link)!,
      });
    }
  }
  console.log(`  couple bookings: ${coupleBookings.length} (varied statuses)`);

  // Saved vendors (shortlist)
  const { error: savedErr } = await sb.from('saved_vendors').insert(
    [pool.photography, pool.decor, pool.dj, vendorProfileId].map((vid) => ({
      user_id: coupleUserId,
      vendor_profile_id: vid,
    })) as never
  );
  if (savedErr) throw new Error(`saved_vendors: ${savedErr.message}`);

  // Couple notifications — spread across Action / Updates / Archived tabs.
  await notify(
    sb,
    coupleUserId,
    'vendor_adjusted_quote',
    'Marigold & Co sent an adjusted quote',
    'Reception Stage + Florals — review the new total.',
    coupleBookingIds.decor
  );
  await notify(
    sb,
    coupleUserId,
    'deposit_paid',
    'Deposit received — you’re confirmed!',
    'Lumière Studios for your Nikkah.',
    coupleBookingIds.photography
  );
  await notify(
    sb,
    coupleUserId,
    'vendor_accepted',
    'Saffron Table accepted your request',
    'Pay your deposit to lock the date.',
    coupleBookingIds.catering,
    { read: true, ageDays: 2 }
  );
  await notify(
    sb,
    coupleUserId,
    'event_task_overdue',
    'A task is overdue',
    'Finalize guest list was due recently.',
    null,
    { read: true, ageDays: 1 }
  );
  await notify(
    sb,
    coupleUserId,
    'booking_completed',
    'Glow Bar Beauty marked your booking complete',
    'Leave a review to help other couples.',
    coupleBookingIds.hair_makeup,
    { read: true, ageDays: 40 }
  );
  console.log('  couple notifications: 5 (action/updates/archived)');

  // === DEMO VENDOR INBOX: incoming bookings from a pool of couples ============
  const poolCouples: Array<{ name: string; email: string }> = [
    { name: 'Priya & Arjun', email: 'c1' },
    { name: 'Fatima & Bilal', email: 'c2' },
    { name: 'Sana & Rohan', email: 'c3' },
    { name: 'Mariam & Yusuf', email: 'c4' },
    { name: 'Neha & Karan', email: 'c5' },
  ];
  const poolCoupleIds: string[] = [];
  for (const c of poolCouples) {
    poolCoupleIds.push(await makeUser(sb, `demo.pool.${c.email}${DEMO_DOMAIN}`, 'couple', c.name));
  }

  const vendorBookings: Array<{
    status: BookingSpec['finalStatus'];
    name: string;
    label: string;
    offset: number;
    pkg: string;
    base: number;
    total: number;
    guests: number;
    closing?: boolean;
    adj?: number;
    special?: string;
  }> = [
    {
      status: 'pending',
      name: poolCouples[0].name,
      label: 'Mehndi',
      offset: 60,
      pkg: 'Bridal Mehndi',
      base: 45000,
      total: 45000,
      guests: 1,
      special: 'Love intricate elbow-length designs — saw your IG reel!',
    },
    {
      status: 'pending_quote',
      name: poolCouples[1].name,
      label: 'Mehndi Night',
      offset: 75,
      pkg: 'Custom quote request',
      base: 0,
      total: 0,
      guests: 12,
    },
    {
      status: 'adjusted_quote_sent',
      name: poolCouples[2].name,
      label: 'Mehndi',
      offset: 44,
      pkg: 'Mehndi Night Package',
      base: 120000,
      total: 120000,
      guests: 10,
      adj: 20000,
    },
    {
      status: 'accepted',
      name: poolCouples[3].name,
      label: 'Mehndi',
      offset: 15,
      pkg: 'Bridal Mehndi',
      base: 45000,
      total: 45000,
      guests: 1,
      closing: true,
    },
    {
      status: 'deposit_paid',
      name: poolCouples[4].name,
      label: 'Mehndi',
      offset: 1,
      pkg: 'Bridal Mehndi',
      base: 45000,
      total: 45000,
      guests: 1,
    },
    {
      status: 'deposit_paid',
      name: poolCouples[0].name,
      label: 'Mehndi',
      offset: 4,
      pkg: 'Mehndi Night Package',
      base: 120000,
      total: 120000,
      guests: 10,
    },
    {
      status: 'completed',
      name: poolCouples[1].name,
      label: 'Mehndi',
      offset: -25,
      pkg: 'Bridal Mehndi',
      base: 45000,
      total: 45000,
      guests: 1,
    },
  ];
  const vendorBookingIds: string[] = [];
  for (let i = 0; i < vendorBookings.length; i++) {
    const vb = vendorBookings[i];
    const id = await makeBooking(sb, {
      coupleUserId: poolCoupleIds[i % poolCoupleIds.length],
      coupleFullName: vb.name,
      vendorProfileId: vendorProfileId,
      packageName: vb.pkg,
      basePriceCents: vb.base,
      totalCents: vb.total,
      guestCount: vb.guests,
      finalStatus: vb.status,
      eventLabel: vb.label,
      eventOffsetDays: vb.offset,
      eventHour: 11 + (i % 5), // spread hours so same-day holds never overlap
      closingSoon: vb.closing,
      adjustmentAmountCents: vb.adj,
      specialRequests: vb.special ?? null,
    });
    vendorBookingIds.push(id);
  }
  console.log(`  vendor incoming bookings: ${vendorBookings.length}`);

  // A vendor personal calendar block (vendor_blocked hold)
  await sb.from('vendor_calendar_holds').insert({
    vendor_profile_id: vendorProfileId,
    booking_event_id: null,
    hold_type: 'vendor_blocked',
    hold_range: `[${at(30, 0)},${at(32, 0)})`,
  } as never);

  // Vendor notifications
  await notify(
    sb,
    vendorUserId,
    'booking_request_received',
    'New booking request',
    `${poolCouples[0].name} requested Bridal Mehndi.`,
    vendorBookingIds[0]
  );
  await notify(
    sb,
    vendorUserId,
    'custom_request_received',
    'New custom quote request',
    `${poolCouples[1].name} wants a Mehndi Night package.`,
    vendorBookingIds[1]
  );
  await notify(
    sb,
    vendorUserId,
    'deposit_paid',
    'Deposit paid 🎉',
    `${poolCouples[4].name} confirmed — contact unlocked.`,
    vendorBookingIds[4],
    { read: true, ageDays: 1 }
  );
  await notify(
    sb,
    vendorUserId,
    'booking_completed',
    'Booking completed',
    `${poolCouples[1].name}'s mehndi is marked complete.`,
    vendorBookingIds[6],
    { read: true, ageDays: 24 }
  );
  console.log('  vendor notifications: 4');

  console.log('\n✅ Demo dashboards seeded.\n');
  console.log('Logins (both password:', PASSWORD + '):');
  console.log(`  COUPLE  →  demo.couple${DEMO_DOMAIN}`);
  console.log(`  VENDOR  →  demo.vendor${DEMO_DOMAIN}`);
  console.log('\nScreens to capture:');
  console.log(
    '  Couple:  /dashboard  /dashboard/events  /dashboard/events/<id>  /dashboard/bookings  /dashboard/saved  /dashboard/notifications'
  );
  console.log(
    '  Vendor:  /dashboard  /dashboard/bookings  /dashboard/profile/packages  /dashboard/profile/calendar  /dashboard/money  /dashboard/profile  /dashboard/notifications'
  );
}

main().catch((err) => {
  console.error('\n❌', err);
  process.exit(1);
});
