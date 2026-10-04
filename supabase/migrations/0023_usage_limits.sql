-- Per-account usage limits (AI calls, WhatsApp, AI chat, Google lookups).
-- Additive only: two new tables and two helper functions. No existing table
-- or row is touched. Apply by pasting into the Supabase SQL Editor.
--
-- Security model: customers can READ their own plan and usage but can never
-- write to either table. Counting happens only through the two functions
-- below, which only the server (service_role) may call. A customer therefore
-- cannot raise their own plan or reset their own counter.
begin;

-- ── Which plan each account is on ──────────────────────────────────────
-- No row = Starter. To move an account to a bigger plan, run for example:
--   insert into public.tenant_plans (tenant_id, plan)
--   values ('<tenant uuid>', 'growth')
--   on conflict (tenant_id) do update set plan = excluded.plan, updated_at = now();
create table public.tenant_plans (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  plan text not null default 'starter' check (plan in ('starter', 'growth', 'enterprise')),
  updated_at timestamptz not null default now()
);

-- ── How much each account has used in the current period ───────────────
-- period is 'YYYY-MM' for monthly metrics and 'YYYY-MM-DD' for daily ones
-- (India time). A new period simply starts a new row, so nothing needs a
-- reset job.
create table public.usage_counters (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  metric text not null,
  period text not null,
  used integer not null default 0 check (used >= 0),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, metric, period)
);

-- Row security is on, and customers are given no write permission at all
-- (only SELECT, below). The counting functions run as the table owner, which
-- is why FORCE ROW LEVEL SECURITY is deliberately not used here.
alter table public.tenant_plans enable row level security;
alter table public.usage_counters enable row level security;

revoke all on public.tenant_plans from anon, authenticated;
revoke all on public.usage_counters from anon, authenticated;
grant select on public.tenant_plans to authenticated;
grant select on public.usage_counters to authenticated;

create policy "Tenant can read own plan" on public.tenant_plans
  for select to authenticated using ((select auth.uid()) = tenant_id);
create policy "Tenant can read own usage" on public.usage_counters
  for select to authenticated using ((select auth.uid()) = tenant_id);

-- ── Count one use, but only if it fits under the limit ─────────────────
-- Atomic: the check and the increment happen in a single UPDATE, so two
-- requests arriving at the same moment cannot both squeeze past the limit.
create function public.consume_usage(
  p_tenant uuid, p_metric text, p_period text, p_amount integer, p_limit integer
) returns table (allowed boolean, used_after integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_used integer;
begin
  insert into public.usage_counters as uc (tenant_id, metric, period, used)
  values (p_tenant, p_metric, p_period, 0)
  on conflict (tenant_id, metric, period) do nothing;

  update public.usage_counters as uc
     set used = uc.used + p_amount, updated_at = now()
   where uc.tenant_id = p_tenant and uc.metric = p_metric and uc.period = p_period
     and uc.used + p_amount <= p_limit
  returning uc.used into v_used;

  if found then
    return query select true, v_used;
  else
    select uc.used into v_used from public.usage_counters as uc
     where uc.tenant_id = p_tenant and uc.metric = p_metric and uc.period = p_period;
    return query select false, coalesce(v_used, 0);
  end if;
end;
$$;

-- ── Give a use back (for example when Twilio refuses to dial) ──────────
create function public.refund_usage(
  p_tenant uuid, p_metric text, p_period text, p_amount integer
) returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.usage_counters as uc
     set used = greatest(uc.used - p_amount, 0), updated_at = now()
   where uc.tenant_id = p_tenant and uc.metric = p_metric and uc.period = p_period;
$$;

revoke all on function public.consume_usage(uuid, text, text, integer, integer) from public, anon, authenticated;
revoke all on function public.refund_usage(uuid, text, text, integer) from public, anon, authenticated;
grant execute on function public.consume_usage(uuid, text, text, integer, integer) to service_role;
grant execute on function public.refund_usage(uuid, text, text, integer) to service_role;

-- The platform owner's own account is not a paying customer: put it on the
-- biggest plan so testing and demos are not blocked. Change or delete this
-- row any time. Does nothing if that account does not exist.
insert into public.tenant_plans (tenant_id, plan)
select id, 'enterprise' from public.tenants
where id = '343b0352-74c6-4aea-9f2e-0bd09e7d3010'
on conflict (tenant_id) do nothing;

commit;
