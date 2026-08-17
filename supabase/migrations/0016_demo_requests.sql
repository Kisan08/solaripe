-- Marketing landing page ("/") demo request form. These are prospective
-- SaaS TENANT leads (someone evaluating Amsu for their own EPC business),
-- an entirely different thing from the app's existing `leads` table (a
-- signed-in tenant's own sales pipeline of THEIR customers) — kept in a
-- separate table so the two are never confused.
--
-- No tenant_id: submitted by anonymous, logged-out visitors, so there is
-- no auth.uid() to scope by. Public INSERT is intentionally open (anyone
-- can submit the form); SELECT is restricted to platform admins only,
-- checked the same way /admin/* already gates access (see lib/admin.ts /
-- proxy.ts's isPlatformAdmin call) — this table has no per-tenant owner to
-- authorize against.
create table public.demo_requests (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  company_name text not null,
  phone text not null,
  email text not null,
  city text,
  created_at timestamptz not null default now()
);

alter table public.demo_requests enable row level security;

create policy "Anyone can submit a demo request" on public.demo_requests
  for insert to anon, authenticated with check (true);

grant insert on public.demo_requests to anon, authenticated;
