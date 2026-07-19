-- Phase 3: per-tenant quote branding (logo, colors, company info already
-- existed, section visibility toggles). Additive only — `settings` already
-- has tenant_id + RLS from migration 0004, so no new RLS is needed on the
-- table itself; these are just new columns on the same tenant-scoped row.

alter table public.settings
  add column logo_url text,
  add column cover_image_url text,
  add column primary_color text not null default '#0F1E3D',
  add column secondary_color text not null default '#1E88E5',
  add column accent_color text not null default '#F5A623',
  -- Generic messaging, no third-party claims — safe to default on so
  -- nothing changes visually for a tenant who hasn't touched branding.
  add column show_why_solar boolean not null default true,
  add column show_partner_logos boolean not null default true,
  -- Deliberately OFF by default, unlike the two above: the "Our Clients"
  -- block on Page 5 hardcodes real third-party company names (Hiranandani,
  -- Lodha, JP Infra, etc.) as past clients. Defaulting this on for every
  -- tenant would have a brand-new solar EPC company's quote falsely claim
  -- someone else's client relationships — a factual problem, not just a
  -- cosmetic one. Confirmed explicitly with the product owner rather than
  -- assumed.
  add column show_client_logos boolean not null default false;

-- ── Storage bucket for logo/cover uploads ──────────────────────────
-- Public read (a logo needs to render in a shared quote/PDF without an
-- auth session — html2canvas and any customer opening a link both need
-- unauthenticated GET access). Write is restricted per tenant by folder:
-- objects are stored as branding/<tenant_id>/logo.<ext> and
-- branding/<tenant_id>/cover.<ext>, and the policies below only allow a
-- user to write inside the folder matching their own auth.uid().
insert into storage.buckets (id, name, public)
values ('branding', 'branding', true)
on conflict (id) do nothing;

create policy "Public read access to branding assets"
  on storage.objects for select
  using (bucket_id = 'branding');

create policy "Tenant can upload own branding assets"
  on storage.objects for insert
  with check (bucket_id = 'branding' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Tenant can update own branding assets"
  on storage.objects for update
  using (bucket_id = 'branding' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Tenant can delete own branding assets"
  on storage.objects for delete
  using (bucket_id = 'branding' and (storage.foldername(name))[1] = auth.uid()::text);
