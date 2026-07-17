-- Phase 1 auth foundation: one tenants row per signed-up user/company.
-- Nothing else (leads/designs/projects) is tenant-scoped yet — that's
-- Phase 2, deliberately not touched here.

create table public.tenants (
  id uuid primary key references auth.users(id) on delete cascade,
  company_name text not null,
  created_at timestamptz not null default now()
);

alter table public.tenants enable row level security;

create policy "Users can read their own tenant row"
  on public.tenants for select
  using (auth.uid() = id);

create policy "Users can update their own tenant row"
  on public.tenants for update
  using (auth.uid() = id);

-- Deliberately no delete policy: nobody (not even the owning user) can
-- delete their own tenants row via the anon/authenticated role. Flag if
-- you want that allowed later.

-- Same lesson as call_sessions/call_logs earlier: creating a table does
-- NOT automatically grant the authenticated role access to it.
grant select, update on public.tenants to authenticated;

-- No client-side insert policy is needed. Email confirmation is required
-- on this project, so right after signUp() there is no authenticated
-- session yet (auth.uid() would be null) — a client-side insert guarded by
-- auth.uid() = id would fail in that window. Instead, this trigger
-- (security definer, bypasses RLS) creates the tenants row the instant the
-- auth.users row appears, regardless of confirmation status.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.tenants (id, company_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'company_name', 'My Company'));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
