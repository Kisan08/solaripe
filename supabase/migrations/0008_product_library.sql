-- Phase 5: shared product catalog, owned by the PLATFORM, not any tenant.
-- First table in this app that isn't tenant-scoped — every authenticated
-- tenant reads the same rows; only the platform admin writes.
--
-- Admin identity is a single hardcoded UUID for now (see lib/admin.ts for
-- the matching TS constant — PLATFORM_ADMIN_USER_ID, kept in exactly one
-- place on the app side). This is a deliberate simplification for a
-- single-admin setup; if a second admin is ever needed or this account is
-- rotated, replace this literal (in both this file's policies and
-- lib/admin.ts) with a real `role` column check instead. Flagged again in
-- the final report.
create table public.product_library (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('panel','inverter','cable','structure','battery')),
  brand text not null,
  model text not null,
  wattage_or_spec text,
  specs jsonb not null default '{}'::jsonb,
  warranty_years numeric,
  logo_url text,
  active boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index product_library_category_active_idx on public.product_library (category, active);

alter table public.product_library enable row level security;

-- One SELECT policy covers both cases: non-admins only ever see active
-- rows, the admin sees everything (including inactive, so they can
-- reactivate something from the management UI).
create policy "Read active products, or all products as admin" on public.product_library
  for select using (
    active = true or auth.uid() = '343b0352-74c6-4aea-9f2e-0bd09e7d3010'
  );

create policy "Only platform admin can insert products" on public.product_library
  for insert with check (auth.uid() = '343b0352-74c6-4aea-9f2e-0bd09e7d3010');

create policy "Only platform admin can update products" on public.product_library
  for update
  using (auth.uid() = '343b0352-74c6-4aea-9f2e-0bd09e7d3010')
  with check (auth.uid() = '343b0352-74c6-4aea-9f2e-0bd09e7d3010');

create policy "Only platform admin can delete products" on public.product_library
  for delete using (auth.uid() = '343b0352-74c6-4aea-9f2e-0bd09e7d3010');

-- Same lesson as every prior phase: creating a table doesn't grant the
-- authenticated role access to it — RLS above is what actually restricts
-- writes to the admin; this grant just lets the role attempt the
-- operation at all.
grant select, insert, update, delete on public.product_library to authenticated;
