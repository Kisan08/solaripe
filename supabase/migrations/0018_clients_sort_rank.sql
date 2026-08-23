-- Server-side pagination for the AI Calling table (app/crm/page.tsx) needs
-- a real ORDER BY column for the existing "Priority" / "Lead Score" sort
-- modes — both were previously a client-side JS rank map over `status`/
-- `lead_score` (STATUS_PRIORITY / LEAD_SCORE_PRIORITY), which only worked
-- because the whole table was loaded into memory at once. Neither column
-- is naturally orderable in Postgres (status/lead_score priority isn't
-- alphabetical), so these generated columns mirror those exact JS rank
-- maps — keep them in sync if the rank maps ever change.
alter table public.clients
  add column if not exists status_rank int generated always as (
    case status
      when 'interested' then 1
      when 'call_back' then 2
      when 'calling' then 3
      when 'pending' then 4
      when 'no_answer' then 5
      when 'failed' then 6
      when 'not_interested' then 7
      else 8
    end
  ) stored,
  add column if not exists lead_score_rank int generated always as (
    case lead_score
      when 'hot' then 1
      when 'warm' then 2
      when 'cold' then 3
      else 4
    end
  ) stored;

create index if not exists clients_tenant_status_rank_idx on public.clients (tenant_id, status_rank);
create index if not exists clients_tenant_lead_score_rank_idx on public.clients (tenant_id, lead_score_rank);
