-- 00070 — custom-quote flow v2: capture is-multi-day, city, venue, budget on booking rows.
-- Nullable / defaulted so old rows are unaffected. Rollback = drop the 4 columns.

alter table public.bookings
  add column if not exists is_multi_day boolean not null default false,
  add column if not exists event_city text,
  add column if not exists venue_name text,
  add column if not exists budget_range text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'bookings_budget_range_check'
  ) then
    alter table public.bookings
      add constraint bookings_budget_range_check
      check (budget_range is null or budget_range in ('lt_5k','5k_15k','15k_30k','gt_30k','discuss'));
  end if;
end $$;
