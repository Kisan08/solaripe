-- Phase 4: tenant-configurable quote content (terms, warranty, scope,
-- payment schedule, tagline). Additive only — `settings` already has
-- tenant_id + RLS from migration 0004; no new RLS needed, same reasoning
-- as migration 0006.
--
-- NOT added here (confirmed with product owner, not assumed):
--  - authorized_signatory: redundant with the existing `proprietor` column,
--    which already serves exactly this purpose in P5's signature block.
--  - address: already exists (added before Phase 2/3 even started) —
--    genuinely unused in the quote's rendered output until this phase.

alter table public.settings
  -- Was a fixed line in PdfHeader ("Engineering · Procurement ·
  -- Construction (EPC) – Solar Division"), never tenant-configurable.
  add column tagline text not null default 'Engineering · Procurement · Construction (EPC) – Solar Division',

  add column default_terms text not null default 'By signing below, both parties agree to the Techno-Commercial Proposal terms. Payments as per milestone schedule. GST as applicable. Proposal valid for 30 days from date above.',

  -- Row color is auto-assigned by index at render time (cycling the same
  -- 4-color palette used today), not stored here — keeps the settings UI
  -- to plain text fields per row instead of a color picker per row.
  add column default_warranty jsonb not null default '[
    {"item":"Solar PV Modules","coverage":"Manufacturing Defect","period":"12 Years"},
    {"item":"Solar PV Modules","coverage":"Linear Performance (80%)","period":"30 Years"},
    {"item":"Inverter","coverage":"Standard OEM","period":"5 Yrs (ext. 8)"},
    {"item":"HDG Structure","coverage":"Corrosion Warranty","period":"15 Years"},
    {"item":"Balance of System","coverage":"OEM Standard","period":"1 Year"},
    {"item":"Workmanship","coverage":"Installation Quality","period":"1 Year"}
  ]'::jsonb,

  add column default_scope jsonb not null default '{
    "included": ["Solar modules, inverter, structure","DC and AC cables, connectors, trays","Earthing system and lightning arrester","Net meter with LT/CT box","DISCOM net metering approval","EAR and Marine insurance","Commissioning and monitoring setup","Remote monitoring (1 year free)"],
    "excluded": ["Water supply at site","Internet for monitoring","Power during installation","Service lift / crane","Roof access ladder","Removal of existing system","Meter merging / load enhancement","Civil / waterproofing work"]
  }'::jsonb,

  -- Exactly 4 milestones, matching the existing fixed 4-column layout on
  -- Page 2 — percentages are validated to sum to 100 in the settings page
  -- before save, not enforced at the DB level (keeps this migration
  -- simple; the application is the single place that writes this column).
  add column default_payment_schedule jsonb not null default '[
    {"label":"Advance on PO","percent":30},
    {"label":"Material Delivery","percent":40},
    {"label":"Installation & Commissioning","percent":20},
    {"label":"Net Meter & Handover","percent":10}
  ]'::jsonb;
