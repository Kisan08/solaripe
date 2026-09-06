-- "Recipe" storage for generated quotes, per lead.
--
-- Stores the full INPUT snapshot that app/quote/page.tsx feeds into
-- <QuotationDocument> — the QuoteForm, the resolved tenant settings /
-- branding, the selected panel/inverter products, and the media-library
-- arrays — NOT a rendered PDF. Reopening a saved quote (/quote?quoteId=…)
-- re-hydrates that state and re-renders the same document client-side, so
-- an EPC can pull back a quote they already sent without rebuilding it.
--
-- Why not the PDF itself: the html2canvas/jsPDF output is ~1 MB per quote;
-- on Supabase's free 1 GB storage tier that caps out around a thousand
-- quotes. This snapshot is a few KB of JSON in an existing table instead —
-- effectively unlimited on the same free tier, and it also stays editable
-- (reopen → tweak → re-save) rather than being a frozen file.
--
-- Multiple rows per lead are allowed on purpose (a save history). The
-- Leads UI opens the most recent by created_at. Deleting a lead cascades
-- its quotes away.
create table public.lead_quotes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  proposal_no text,
  client_name text,
  system_kwp numeric,
  total_value numeric,
  snapshot jsonb not null,
  created_at timestamptz not null default now()
);

-- Covers both access patterns: "latest quote for this lead" (the card
-- indicator / double-click target) and "all my quotes newest first".
create index if not exists lead_quotes_tenant_lead_idx
  on public.lead_quotes (tenant_id, lead_id, created_at desc);

alter table public.lead_quotes enable row level security;

create policy "Tenant can select own lead_quotes" on public.lead_quotes
  for select using (auth.uid() = tenant_id);
create policy "Tenant can insert own lead_quotes" on public.lead_quotes
  for insert with check (auth.uid() = tenant_id);
create policy "Tenant can update own lead_quotes" on public.lead_quotes
  for update using (auth.uid() = tenant_id) with check (auth.uid() = tenant_id);
create policy "Tenant can delete own lead_quotes" on public.lead_quotes
  for delete using (auth.uid() = tenant_id);

grant select, insert, update, delete on public.lead_quotes to authenticated;

-- Reuses the shared BEFORE INSERT trigger fn from 0004_tenant_scope.sql —
-- it unconditionally stamps tenant_id = auth.uid(), so the client-side
-- insert in lib/data.ts never sends (and can't spoof) tenant_id. The RLS
-- `with check` above stays as an independent second layer.
create trigger enforce_tenant_id_lead_quotes
  before insert on public.lead_quotes
  for each row execute function public.set_tenant_id();
