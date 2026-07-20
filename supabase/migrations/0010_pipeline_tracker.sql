-- Phase 7: subsidy / net-metering approval pipeline tracker. Purely a
-- MANUAL tracking aid — there is no government API to poll, so nothing
-- here syncs live state from PM Surya Ghar or any DISCOM. A tenant moves a
-- project's stage themselves after checking the actual portal; this just
-- gives them organization + a staleness nudge.
--
-- Stages vary by state/DISCOM, so they're tenant-owned data
-- (tenant_pipeline_stages), not a hardcoded enum — same tenant-scope
-- pattern as every other tenant table in this app (0004/0009).

-- ── Fix: set_tenant_id() must not clobber trusted server-side inserts ──
-- The shared trigger from 0004_tenant_scope.sql unconditionally does
-- `new.tenant_id := auth.uid()`, which is correct for ordinary
-- browser-session inserts (never trust a client-supplied tenant_id) but
-- wrong for this migration's own seeding: both the one-time backfill
-- below and the new-tenant seeding trigger run with no authenticated
-- session, so auth.uid() is null and would silently null out a tenant_id
-- that was already set correctly, tripping the NOT NULL constraint.
-- Coalescing preserves the exact original behavior whenever auth.uid()
-- IS set (every existing table's normal path, unchanged) and only backs
-- off when it's null, letting a trusted caller's own tenant_id stand.
create or replace function public.set_tenant_id()
returns trigger
language plpgsql
as $$
begin
  new.tenant_id := coalesce(auth.uid(), new.tenant_id);
  return new;
end;
$$;

-- ── tenant_pipeline_stages ────────────────────────────────────────────
create table public.tenant_pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  display_order integer not null default 0,
  expected_days integer, -- null = no staleness alert for this stage
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index tenant_pipeline_stages_tenant_active_order_idx
  on public.tenant_pipeline_stages (tenant_id, active, display_order);

alter table public.tenant_pipeline_stages enable row level security;

create policy "Tenant can select own tenant_pipeline_stages" on public.tenant_pipeline_stages
  for select using (auth.uid() = tenant_id);
create policy "Tenant can insert own tenant_pipeline_stages" on public.tenant_pipeline_stages
  for insert with check (auth.uid() = tenant_id);
create policy "Tenant can update own tenant_pipeline_stages" on public.tenant_pipeline_stages
  for update using (auth.uid() = tenant_id) with check (auth.uid() = tenant_id);
create policy "Tenant can delete own tenant_pipeline_stages" on public.tenant_pipeline_stages
  for delete using (auth.uid() = tenant_id);

grant select, insert, update, delete on public.tenant_pipeline_stages to authenticated;

create trigger enforce_tenant_id_tenant_pipeline_stages
  before insert on public.tenant_pipeline_stages
  for each row execute function public.set_tenant_id();

-- ── project_pipeline_history ──────────────────────────────────────────
-- No created_by / actor column — this app's auth model is one user per
-- tenant (tenants.id IS the signed-up user's auth.uid(), confirmed no
-- team/invite table exists anywhere), so tenant_id already unambiguously
-- identifies who made the change. A separate actor column would just
-- duplicate tenant_id for no benefit today; add one later if/when real
-- multi-user-per-tenant support exists.
create table public.project_pipeline_history (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  stage_id uuid not null references public.tenant_pipeline_stages(id),
  notes text,
  entered_at timestamptz not null default now()
);

create index project_pipeline_history_project_idx
  on public.project_pipeline_history (project_id, entered_at desc);

alter table public.project_pipeline_history enable row level security;

create policy "Tenant can select own project_pipeline_history" on public.project_pipeline_history
  for select using (auth.uid() = tenant_id);
create policy "Tenant can insert own project_pipeline_history" on public.project_pipeline_history
  for insert with check (auth.uid() = tenant_id);
create policy "Tenant can update own project_pipeline_history" on public.project_pipeline_history
  for update using (auth.uid() = tenant_id) with check (auth.uid() = tenant_id);
create policy "Tenant can delete own project_pipeline_history" on public.project_pipeline_history
  for delete using (auth.uid() = tenant_id);

grant select, insert, update, delete on public.project_pipeline_history to authenticated;

create trigger enforce_tenant_id_project_pipeline_history
  before insert on public.project_pipeline_history
  for each row execute function public.set_tenant_id();

-- ── projects: current stage pointer ────────────────────────────────────
-- The project's current stage is technically derivable from the latest
-- project_pipeline_history row, but is also stored directly here for fast
-- reads on the project list/card (no join needed to render every card) —
-- kept in sync by lib/pipeline.ts's updateProjectPipelineStage() on every
-- stage change (insert history row, then update these two columns).
alter table public.projects
  add column current_stage_id uuid references public.tenant_pipeline_stages(id),
  add column current_stage_entered_at timestamptz;

-- ── Default stage seeding ───────────────────────────────────────────────
-- These 9 stages/expected_days are a reasonable STARTING POINT, not
-- verified against any authoritative, current PM Surya Ghar / DISCOM
-- source — every tenant is expected to edit them to match their own
-- state's actual process (surfaced as a hint in the Settings UI itself,
-- see app/settings/MediaSections.tsx's PipelineStagesSection).
create function public.seed_default_pipeline_stages()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.tenant_pipeline_stages (tenant_id, name, display_order, expected_days) values
    (new.id, 'Registered on PM Surya Ghar', 0, 3),
    (new.id, 'DISCOM Feasibility Approval', 1, 10),
    (new.id, 'Installation Completed', 2, null),
    (new.id, 'Net Meter Application Submitted', 3, 7),
    (new.id, 'Net Meter Installed', 4, 14),
    (new.id, 'Joint Inspection / Verification', 5, 10),
    (new.id, 'Commissioning Certificate Issued', 6, 7),
    (new.id, 'Subsidy Claim Submitted', 7, 5),
    (new.id, 'Subsidy Disbursed', 8, 30);
  return new;
end;
$$;

-- Fires in the same transaction as tenant creation (right after
-- handle_new_user() inserts the tenants row — that trigger is untouched,
-- this is a separate, additive trigger on the same table) so every newly
-- signed-up tenant gets the default list immediately, with no dependency
-- on them ever opening Settings first.
create trigger on_tenant_created_seed_pipeline_stages
  after insert on public.tenants
  for each row execute function public.seed_default_pipeline_stages();

-- One-time backfill for tenants that already existed before this
-- migration — gives current test/production tenants the same default
-- list immediately rather than leaving them with zero stages until they
-- manually add their own.
insert into public.tenant_pipeline_stages (tenant_id, name, display_order, expected_days)
select t.id, defaults.name, defaults.display_order, defaults.expected_days
from public.tenants t
cross join (values
  ('Registered on PM Surya Ghar', 0, 3),
  ('DISCOM Feasibility Approval', 1, 10),
  ('Installation Completed', 2, null),
  ('Net Meter Application Submitted', 3, 7),
  ('Net Meter Installed', 4, 14),
  ('Joint Inspection / Verification', 5, 10),
  ('Commissioning Certificate Issued', 6, 7),
  ('Subsidy Claim Submitted', 7, 5),
  ('Subsidy Disbursed', 8, 30)
) as defaults(name, display_order, expected_days)
where not exists (
  select 1 from public.tenant_pipeline_stages existing where existing.tenant_id = t.id
);
