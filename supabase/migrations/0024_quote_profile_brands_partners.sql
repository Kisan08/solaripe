-- Quote company profile, default inverter brand, and per-company partner brands.
-- Additive only: two new columns on public.settings, one new table, one new
-- storage bucket. No existing column, row or policy is changed or deleted.
-- Apply by pasting into the Supabase SQL Editor (review first, same as 0021-0023).
begin;

-- ── 1. Settings: optional company profile + default inverter brand ─────
alter table public.settings
  add column if not exists company_profile jsonb not null default '{}'::jsonb,
  add column if not exists inverter_brand text not null default '';

-- ── 2. Partner brands (logos shown in the quote's "Our Partner Brands") ─
create table public.tenant_partner_brands (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  logo_url text not null,
  display_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index tenant_partner_brands_order_idx
  on public.tenant_partner_brands (tenant_id, display_order);

alter table public.tenant_partner_brands enable row level security;
alter table public.tenant_partner_brands force row level security;

revoke all on public.tenant_partner_brands from anon;
grant select, insert, update, delete on public.tenant_partner_brands to authenticated;

create policy "Tenant can select own tenant_partner_brands" on public.tenant_partner_brands
  for select using (auth.uid() = tenant_id);
create policy "Tenant can insert own tenant_partner_brands" on public.tenant_partner_brands
  for insert with check (auth.uid() = tenant_id);
create policy "Tenant can update own tenant_partner_brands" on public.tenant_partner_brands
  for update using (auth.uid() = tenant_id) with check (auth.uid() = tenant_id);
create policy "Tenant can delete own tenant_partner_brands" on public.tenant_partner_brands
  for delete using (auth.uid() = tenant_id);

-- Same extra tenant fence as migration 0021 gives every other tenant table.
create policy tenant_access_fence on public.tenant_partner_brands
  as restrictive for all to authenticated
  using ((select auth.uid()) = tenant_id) with check ((select auth.uid()) = tenant_id);

-- tenant_id is always the signed-in user's id, never what the browser sends.
create trigger enforce_tenant_id_tenant_partner_brands
  before insert on public.tenant_partner_brands
  for each row execute function public.set_tenant_id();

-- At most 8 partner brands per company, enforced here and not only in the page.
create function public.enforce_partner_brand_limit()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_tenant uuid := coalesce(auth.uid(), new.tenant_id);
begin
  perform pg_advisory_xact_lock(hashtext('partner_brands:' || v_tenant::text));
  if (select count(*) from public.tenant_partner_brands where tenant_id = v_tenant) >= 8 then
    raise exception 'You can add up to 8 partner brands.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger enforce_partner_brand_limit
  before insert on public.tenant_partner_brands
  for each row execute function public.enforce_partner_brand_limit();

-- ── 3. Storage: a bucket just for partner logos ────────────────────────
-- Public so a logo can appear on a quote a customer opens without logging in,
-- but: PNG or JPG only and 1 MB at most (enforced by the bucket itself), a
-- company can write only inside its own folder (<tenant id>/...), and nobody
-- but that company can list or delete its files.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('partner-logos', 'partner-logos', true, 1048576, array['image/png', 'image/jpeg'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "Tenant can list own partner logos"
  on storage.objects for select to authenticated
  using (bucket_id = 'partner-logos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Tenant can upload own partner logos"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'partner-logos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Tenant can update own partner logos"
  on storage.objects for update to authenticated
  using (bucket_id = 'partner-logos' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'partner-logos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Tenant can delete own partner logos"
  on storage.objects for delete to authenticated
  using (bucket_id = 'partner-logos' and (storage.foldername(name))[1] = auth.uid()::text);

commit;
