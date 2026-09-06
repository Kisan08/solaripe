-- Switch lead_quotes from "a row per save" to "one current quote per
-- lead". The Leads UI only ever opens the most recent row, so keeping the
-- history just grew the table every time Download / WhatsApp was pressed.
-- After this, storage is bounded by (leads that have a quote), and
-- lib/data.ts saveLeadQuote() upserts on lead_id instead of inserting.

-- 1. Keep only the newest row per lead.
delete from public.lead_quotes a
using public.lead_quotes b
where a.lead_id = b.lead_id
  and a.created_at < b.created_at;

-- 2. Tie-break any rows that somehow share the exact same created_at.
delete from public.lead_quotes a
using public.lead_quotes b
where a.lead_id = b.lead_id
  and a.created_at = b.created_at
  and a.id < b.id;

-- 3. Enforce one quote per lead so the app can upsert on lead_id.
--    lead_id is a uuid FK to a globally-unique leads.id, so a plain
--    unique constraint on it is enough (no need to include tenant_id).
alter table public.lead_quotes
  add constraint lead_quotes_lead_id_key unique (lead_id);
