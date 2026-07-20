-- Phase 6: tenant-owned media/content library — client logos, testimonials,
-- certifications, completed projects. All four replace or add to content
-- that was previously hardcoded (or absent) in the quote PDF (app/quote/page.tsx).
--
-- Tenant-scoped exactly like leads/projects/designs/settings in
-- 0004_tenant_scope.sql: tenant_id = auth.uid(), enforced by both RLS and
-- the existing set_tenant_id() trigger (reused here, not redefined).
--
-- No new storage bucket/policies needed — uploads reuse the `branding`
-- bucket and its existing folder-scoped policies from 0006_quote_branding.sql
-- (public read; write restricted to the uploader's own auth.uid() folder),
-- same precedent as product logos in 0008_product_library.sql /
-- lib/products.ts's uploadProductLogo. New paths live under
-- branding/<tenant_id>/media/<type>-<id>.<ext>.

-- ── tenant_client_logos ──────────────────────────────────────────────
create table public.tenant_client_logos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  logo_url text not null,
  display_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index tenant_client_logos_tenant_active_order_idx
  on public.tenant_client_logos (tenant_id, active, display_order);

alter table public.tenant_client_logos enable row level security;

create policy "Tenant can select own tenant_client_logos" on public.tenant_client_logos
  for select using (auth.uid() = tenant_id);
create policy "Tenant can insert own tenant_client_logos" on public.tenant_client_logos
  for insert with check (auth.uid() = tenant_id);
create policy "Tenant can update own tenant_client_logos" on public.tenant_client_logos
  for update using (auth.uid() = tenant_id) with check (auth.uid() = tenant_id);
create policy "Tenant can delete own tenant_client_logos" on public.tenant_client_logos
  for delete using (auth.uid() = tenant_id);

grant select, insert, update, delete on public.tenant_client_logos to authenticated;

create trigger enforce_tenant_id_tenant_client_logos
  before insert on public.tenant_client_logos
  for each row execute function public.set_tenant_id();

-- ── tenant_testimonials ───────────────────────────────────────────────
create table public.tenant_testimonials (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  customer_name text not null,
  customer_company text,
  designation text,
  photo_url text,
  rating numeric check (rating >= 1 and rating <= 5),
  testimonial_text text not null,
  display_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index tenant_testimonials_tenant_active_order_idx
  on public.tenant_testimonials (tenant_id, active, display_order);

alter table public.tenant_testimonials enable row level security;

create policy "Tenant can select own tenant_testimonials" on public.tenant_testimonials
  for select using (auth.uid() = tenant_id);
create policy "Tenant can insert own tenant_testimonials" on public.tenant_testimonials
  for insert with check (auth.uid() = tenant_id);
create policy "Tenant can update own tenant_testimonials" on public.tenant_testimonials
  for update using (auth.uid() = tenant_id) with check (auth.uid() = tenant_id);
create policy "Tenant can delete own tenant_testimonials" on public.tenant_testimonials
  for delete using (auth.uid() = tenant_id);

grant select, insert, update, delete on public.tenant_testimonials to authenticated;

create trigger enforce_tenant_id_tenant_testimonials
  before insert on public.tenant_testimonials
  for each row execute function public.set_tenant_id();

-- ── tenant_certifications ─────────────────────────────────────────────
create table public.tenant_certifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  issuing_authority text,
  certificate_number text,
  issue_date date,
  expiry_date date,
  certificate_image_url text,
  description text,
  display_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index tenant_certifications_tenant_active_order_idx
  on public.tenant_certifications (tenant_id, active, display_order);

alter table public.tenant_certifications enable row level security;

create policy "Tenant can select own tenant_certifications" on public.tenant_certifications
  for select using (auth.uid() = tenant_id);
create policy "Tenant can insert own tenant_certifications" on public.tenant_certifications
  for insert with check (auth.uid() = tenant_id);
create policy "Tenant can update own tenant_certifications" on public.tenant_certifications
  for update using (auth.uid() = tenant_id) with check (auth.uid() = tenant_id);
create policy "Tenant can delete own tenant_certifications" on public.tenant_certifications
  for delete using (auth.uid() = tenant_id);

grant select, insert, update, delete on public.tenant_certifications to authenticated;

create trigger enforce_tenant_id_tenant_certifications
  before insert on public.tenant_certifications
  for each row execute function public.set_tenant_id();

-- ── tenant_projects ────────────────────────────────────────────────────
-- `featured` gates whether a project appears in the PDF's Completed
-- Projects page (only featured=true rows render there) — see
-- lib/media.ts's fetchFeaturedProjects(). Non-featured active rows still
-- show in the Settings list, just not on the quote.
create table public.tenant_projects (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  title text not null,
  site_name text,
  location text,
  system_capacity_kwp numeric,
  completion_date date,
  main_image_url text,
  description text,
  featured boolean not null default false,
  display_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index tenant_projects_tenant_active_order_idx
  on public.tenant_projects (tenant_id, active, display_order);

alter table public.tenant_projects enable row level security;

create policy "Tenant can select own tenant_projects" on public.tenant_projects
  for select using (auth.uid() = tenant_id);
create policy "Tenant can insert own tenant_projects" on public.tenant_projects
  for insert with check (auth.uid() = tenant_id);
create policy "Tenant can update own tenant_projects" on public.tenant_projects
  for update using (auth.uid() = tenant_id) with check (auth.uid() = tenant_id);
create policy "Tenant can delete own tenant_projects" on public.tenant_projects
  for delete using (auth.uid() = tenant_id);

grant select, insert, update, delete on public.tenant_projects to authenticated;

create trigger enforce_tenant_id_tenant_projects
  before insert on public.tenant_projects
  for each row execute function public.set_tenant_id();
