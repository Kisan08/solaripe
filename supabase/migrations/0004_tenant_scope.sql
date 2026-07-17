-- Phase 2: tenant-scope leads/designs/projects/settings.
--
-- Explicitly OUT OF SCOPE for this phase: clients/call_sessions/call_logs
-- (the AI-calling tables). They're written by server-side Twilio webhooks
-- with no browser session at all, so auth.uid()-based RLS can't apply the
-- same way — that needs a different design, deferred to a later phase.
--
-- Per explicit instruction: existing rows in these four tables are being
-- cleared rather than backfilled to a specific tenant, so tenant_id can be
-- added as NOT NULL immediately with no backfill/UPDATE step.
truncate table public.leads, public.projects, public.designs, public.settings;

-- One trigger function, reused by all four tables below. Runs BEFORE
-- INSERT and unconditionally overwrites tenant_id with the current
-- session's auth.uid() — this is what makes "never trust a tenant_id the
-- client sends" true even though leads/designs/projects/settings are all
-- inserted directly from browser code (no backend API layer sits in front
-- of them to set this in application code). RLS's `with check` below is
-- still kept as a second, independent layer: if this trigger were ever
-- dropped, RLS would still reject a mismatched client-supplied tenant_id
-- rather than silently accepting it.
create function public.set_tenant_id()
returns trigger
language plpgsql
as $$
begin
  new.tenant_id := auth.uid();
  return new;
end;
$$;

-- ── leads ──────────────────────────────────────────────────────────
alter table public.leads
  add column tenant_id uuid not null references public.tenants(id) on delete cascade;

alter table public.leads enable row level security;

create policy "Tenant can select own leads" on public.leads
  for select using (auth.uid() = tenant_id);
create policy "Tenant can insert own leads" on public.leads
  for insert with check (auth.uid() = tenant_id);
create policy "Tenant can update own leads" on public.leads
  for update using (auth.uid() = tenant_id) with check (auth.uid() = tenant_id);
create policy "Tenant can delete own leads" on public.leads
  for delete using (auth.uid() = tenant_id);

grant select, insert, update, delete on public.leads to authenticated;

create trigger enforce_tenant_id_leads
  before insert on public.leads
  for each row execute function public.set_tenant_id();

-- ── projects ───────────────────────────────────────────────────────
alter table public.projects
  add column tenant_id uuid not null references public.tenants(id) on delete cascade;

alter table public.projects enable row level security;

create policy "Tenant can select own projects" on public.projects
  for select using (auth.uid() = tenant_id);
create policy "Tenant can insert own projects" on public.projects
  for insert with check (auth.uid() = tenant_id);
create policy "Tenant can update own projects" on public.projects
  for update using (auth.uid() = tenant_id) with check (auth.uid() = tenant_id);
create policy "Tenant can delete own projects" on public.projects
  for delete using (auth.uid() = tenant_id);

grant select, insert, update, delete on public.projects to authenticated;

create trigger enforce_tenant_id_projects
  before insert on public.projects
  for each row execute function public.set_tenant_id();

-- ── designs ────────────────────────────────────────────────────────
alter table public.designs
  add column tenant_id uuid not null references public.tenants(id) on delete cascade;

alter table public.designs enable row level security;

create policy "Tenant can select own designs" on public.designs
  for select using (auth.uid() = tenant_id);
create policy "Tenant can insert own designs" on public.designs
  for insert with check (auth.uid() = tenant_id);
create policy "Tenant can update own designs" on public.designs
  for update using (auth.uid() = tenant_id) with check (auth.uid() = tenant_id);
create policy "Tenant can delete own designs" on public.designs
  for delete using (auth.uid() = tenant_id);

grant select, insert, update, delete on public.designs to authenticated;

create trigger enforce_tenant_id_designs
  before insert on public.designs
  for each row execute function public.set_tenant_id();

-- ── settings ───────────────────────────────────────────────────────
-- Previously a single shared row keyed by a hardcoded id = 'default'.
-- That can't be tenant-scoped by just adding a column — every tenant
-- would collide on the same row. tenant_id becomes the real per-tenant
-- key going forward (unique constraint below); `id` stays as the primary
-- key column but the app now sets it to the tenant's own id rather than
-- the literal string 'default' (see lib/settings.ts).
alter table public.settings
  add column tenant_id uuid not null references public.tenants(id) on delete cascade;

alter table public.settings add constraint settings_tenant_id_key unique (tenant_id);

alter table public.settings enable row level security;

create policy "Tenant can select own settings" on public.settings
  for select using (auth.uid() = tenant_id);
create policy "Tenant can insert own settings" on public.settings
  for insert with check (auth.uid() = tenant_id);
create policy "Tenant can update own settings" on public.settings
  for update using (auth.uid() = tenant_id) with check (auth.uid() = tenant_id);
create policy "Tenant can delete own settings" on public.settings
  for delete using (auth.uid() = tenant_id);

grant select, insert, update, delete on public.settings to authenticated;

create trigger enforce_tenant_id_settings
  before insert on public.settings
  for each row execute function public.set_tenant_id();
