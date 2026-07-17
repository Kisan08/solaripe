-- Phase 3: tenant-scope the AI-calling system (clients, call_sessions,
-- call_logs) — deliberately deferred from Phase 2 because these tables
-- are written by TWO fundamentally different kinds of callers:
--
--   1. Your own logged-in browser: extract-clients (import), crm/clients
--      (list), crm/reset, make-call. These DO have an auth session.
--   2. Twilio's own webhook servers: call-twiml, call-response,
--      call-webhook. These have ZERO session — Twilio calls these
--      directly with a clientId in the URL, no cookies at all.
--
-- auth.uid()-based RLS only works for (1). For (2), tenant_id is derived
-- from the existing clients row (fixed at import time), never from a
-- session that doesn't exist at that point.
--
-- Per explicit instruction: existing data cleared, not backfilled.
truncate table public.call_logs, public.call_sessions, public.clients;

-- ── clients ────────────────────────────────────────────────────────
alter table public.clients
  add column tenant_id uuid not null references public.tenants(id) on delete cascade;

-- phone was previously unique across ALL clients regardless of tenant —
-- that means two different businesses could never both have a lead with
-- the same phone number. Needs to become per-tenant unique instead.
-- (Constraint name assumed from Postgres/Supabase's default naming for a
-- single-column unique constraint added via the table editor — verify
-- this matches your actual constraint name before running; if it errors,
-- check \d clients in the SQL editor for the real name and adjust.)
alter table public.clients drop constraint if exists clients_phone_key;
alter table public.clients add constraint clients_tenant_id_phone_key unique (tenant_id, phone);

alter table public.clients enable row level security;

create policy "Tenant can select own clients" on public.clients
  for select using (auth.uid() = tenant_id);
create policy "Tenant can insert own clients" on public.clients
  for insert with check (auth.uid() = tenant_id);
create policy "Tenant can update own clients" on public.clients
  for update using (auth.uid() = tenant_id) with check (auth.uid() = tenant_id);
create policy "Tenant can delete own clients" on public.clients
  for delete using (auth.uid() = tenant_id);

grant select, insert, update, delete on public.clients to authenticated;

-- Reuses the same set_tenant_id() function from migration 0004 — it just
-- forces NEW.tenant_id := auth.uid(), which is exactly right here since
-- clients rows are only ever created via extract-clients, which now runs
-- with the importing tenant's session.
create trigger enforce_tenant_id_clients
  before insert on public.clients
  for each row execute function public.set_tenant_id();

-- ── call_sessions ──────────────────────────────────────────────────
-- No auth session exists when these are created (Twilio webhook, not a
-- browser request) — tenant_id must be derived from the associated
-- clients row instead of auth.uid().
alter table public.call_sessions
  add column tenant_id uuid not null references public.tenants(id) on delete cascade;

alter table public.call_sessions enable row level security;

create policy "Tenant can select own call_sessions" on public.call_sessions
  for select using (auth.uid() = tenant_id);
create policy "Tenant can insert own call_sessions" on public.call_sessions
  for insert with check (auth.uid() = tenant_id);
create policy "Tenant can update own call_sessions" on public.call_sessions
  for update using (auth.uid() = tenant_id) with check (auth.uid() = tenant_id);
create policy "Tenant can delete own call_sessions" on public.call_sessions
  for delete using (auth.uid() = tenant_id);

grant select, insert, update, delete on public.call_sessions to authenticated;

create function public.set_tenant_id_from_client()
returns trigger
language plpgsql
as $$
begin
  new.tenant_id := (select tenant_id from public.clients where id = new.client_id);
  return new;
end;
$$;

create trigger enforce_tenant_id_call_sessions
  before insert on public.call_sessions
  for each row execute function public.set_tenant_id_from_client();

-- ── call_logs ──────────────────────────────────────────────────────
alter table public.call_logs
  add column tenant_id uuid not null references public.tenants(id) on delete cascade;

alter table public.call_logs enable row level security;

create policy "Tenant can select own call_logs" on public.call_logs
  for select using (auth.uid() = tenant_id);
create policy "Tenant can insert own call_logs" on public.call_logs
  for insert with check (auth.uid() = tenant_id);
create policy "Tenant can update own call_logs" on public.call_logs
  for update using (auth.uid() = tenant_id) with check (auth.uid() = tenant_id);
create policy "Tenant can delete own call_logs" on public.call_logs
  for delete using (auth.uid() = tenant_id);

grant select, insert, update, delete on public.call_logs to authenticated;

create trigger enforce_tenant_id_call_logs
  before insert on public.call_logs
  for each row execute function public.set_tenant_id_from_client();

-- NOTE: none of these RLS policies matter for the Twilio-webhook routes
-- (call-twiml/call-response/call-webhook) — those use the service-role
-- key (lib/supabaseAdmin.ts), which bypasses RLS entirely, because there
-- is no auth.uid() available in that context to check against. Tenant
-- correctness there relies on the fact that they only ever act on a
-- specific, already-existing clientId whose tenant_id was fixed at import
-- time — not on RLS. The RLS above protects the browser-facing routes
-- (extract-clients, crm/clients, crm/reset, make-call), which is where an
-- actual logged-in user could otherwise try to reach another tenant's data.
