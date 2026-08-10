-- ═══════════════════════════════════════════════════════════════════════
-- RESET YOUR ACCOUNT'S DATA AND SEED A DEMO DATASET
-- ═══════════════════════════════════════════════════════════════════════
-- This is a one-off DATA operation, not a schema migration — it doesn't
-- live in supabase/migrations/ and never runs automatically. You run it
-- by hand in the Supabase SQL editor, same as every migration this
-- project has used so far.
--
-- WHAT THIS DOES, IN ORDER:
--   1. Deletes every row belonging to YOUR tenant account across leads,
--      CRM clients, projects, 3D designs, quote settings, call history,
--      and the quote-branding media library (client logos/testimonials/
--      certifications/featured projects).
--   2. Renames your tenant to a fictional demo EPC company, "Suryodaya
--      Solar Solutions" (change this below if you want a different name
--      — search for it, appears in a few places).
--   3. Seeds fresh, clearly-fake demo data: 6 sales leads across every
--      pipeline stage, 5 CRM/AI-calling clients across every call status,
--      2 projects (one in progress, one completed), and one full 3D roof
--      design (roof outline + 6 panels + a water tank obstacle) attached
--      to the in-progress project, so the 3D Designer isn't empty either.
--
-- WHAT THIS DOES NOT TOUCH (left for later if you want it):
--   - tenant_pipeline_stages / project_pipeline_history — your existing
--     pipeline stage configuration is left as-is; the demo projects don't
--     reference a stage, so nothing breaks either way.
--   - Client logos / testimonials / certifications / featured projects
--     content — rows are cleared (so no stale real data lingers) but not
--     reseeded, since these need actual uploaded images to look right,
--     and I don't have real image assets to put there. Add a few by hand
--     in Settings if you want that section to show in the demo quote.
--
-- ⚠️  THIS IS IRREVERSIBLE. Anything currently in your account (leads,
--     projects, designs, call history) is gone once you run this — there
--     is no undo. If you want a safety net, export a CSV of your CRM
--     leads first (the app's own "Export CSV" button) before running this.
--
-- ── STEP 1 — find your tenant_id ────────────────────────────────────────
-- Run just this line first, on its own, and confirm which row is you
-- (there should only be one, but check company_name/created_at to be
-- sure) before touching anything below.
--
--   select id, company_name, created_at from public.tenants;
--
-- ── STEP 2 — paste your id below ────────────────────────────────────────
-- Replace fcf362ed-4f28-4292-9aa5-d7f32bc8209b everywhere it appears in this file (a simple
-- find-and-replace in your editor) with the uuid from Step 1, THEN run
-- everything from here down as one script.
-- ═══════════════════════════════════════════════════════════════════════

begin;

-- The tenant-scoping triggers (supabase/migrations/0004 and 0005) force
-- tenant_id := auth.uid() on every insert — correct for the app's own
-- browser-authenticated writes, but auth.uid() is null when running as
-- you in the SQL editor (no browser session here), which would make every
-- insert below fail its NOT NULL constraint. Disabling them for the
-- duration of this transaction lets the explicit tenant_id values below
-- actually stick; re-enabled at the end regardless of how this ends.
alter table public.leads          disable trigger enforce_tenant_id_leads;
alter table public.projects       disable trigger enforce_tenant_id_projects;
alter table public.designs        disable trigger enforce_tenant_id_designs;
alter table public.settings       disable trigger enforce_tenant_id_settings;
alter table public.clients        disable trigger enforce_tenant_id_clients;

-- ── 1. WIPE existing tenant data ────────────────────────────────────────
delete from public.designs                where tenant_id = 'fcf362ed-4f28-4292-9aa5-d7f32bc8209b';
delete from public.projects               where tenant_id = 'fcf362ed-4f28-4292-9aa5-d7f32bc8209b';
delete from public.leads                  where tenant_id = 'fcf362ed-4f28-4292-9aa5-d7f32bc8209b';
delete from public.clients                where tenant_id = 'fcf362ed-4f28-4292-9aa5-d7f32bc8209b';
delete from public.call_sessions          where tenant_id = 'fcf362ed-4f28-4292-9aa5-d7f32bc8209b';
delete from public.call_logs              where tenant_id = 'fcf362ed-4f28-4292-9aa5-d7f32bc8209b';
delete from public.settings               where tenant_id = 'fcf362ed-4f28-4292-9aa5-d7f32bc8209b';
delete from public.tenant_client_logos    where tenant_id = 'fcf362ed-4f28-4292-9aa5-d7f32bc8209b';
delete from public.tenant_testimonials    where tenant_id = 'fcf362ed-4f28-4292-9aa5-d7f32bc8209b';
delete from public.tenant_certifications  where tenant_id = 'fcf362ed-4f28-4292-9aa5-d7f32bc8209b';
delete from public.tenant_projects        where tenant_id = 'fcf362ed-4f28-4292-9aa5-d7f32bc8209b';

-- ── 2. Rename the tenant itself ─────────────────────────────────────────
update public.tenants
set company_name = 'Suryodaya Solar Solutions'
where id = 'fcf362ed-4f28-4292-9aa5-d7f32bc8209b';

-- ── 3. Quote/company settings ───────────────────────────────────────────
insert into public.settings (
  id, tenant_id, name, short_name, phone, email, gst, proprietor, address,
  website, panel_brand, panel_wp, default_rate, yield_kwh, gst_rate,
  twilio_number, owner_phone, logo_url, cover_image_url,
  primary_color, secondary_color, accent_color,
  show_why_solar, show_partner_logos, show_client_logos,
  tagline, default_terms, default_warranty, default_scope, default_payment_schedule,
  updated_at
) values (
  'fcf362ed-4f28-4292-9aa5-d7f32bc8209b', 'fcf362ed-4f28-4292-9aa5-d7f32bc8209b',
  'Suryodaya Solar Solutions', 'Suryodaya Solar',
  '+91 98765 43210', 'info@suryodayasolar.in', '27ABCDE1234F1Z5',
  'Rajesh Kulkarni', 'Thane West, Maharashtra 400601',
  'www.suryodayasolar.in',
  'Waaree', 580, 52, 1332, 8.9,
  '+91 98765 43210', '+91 98765 43210',
  null, null,
  '#0C447C', '#1E88E5', '#F5A623',
  true, true, false,
  'Powering a Brighter Tomorrow — Solar EPC Specialists',
  'By signing below, both parties agree to the Techno-Commercial Proposal terms. Payments as per milestone schedule. GST as applicable. Proposal valid for 30 days from date above.',
  '[
    {"item":"Solar PV Modules","coverage":"Manufacturing Defect","period":"12 Years"},
    {"item":"Solar PV Modules","coverage":"Linear Performance (80%)","period":"30 Years"},
    {"item":"Inverter","coverage":"Standard OEM","period":"5 Yrs (ext. 8)"},
    {"item":"HDG Structure","coverage":"Corrosion Warranty","period":"15 Years"},
    {"item":"Balance of System","coverage":"OEM Standard","period":"1 Year"},
    {"item":"Workmanship","coverage":"Installation Quality","period":"1 Year"}
  ]'::jsonb,
  '{
    "included": ["Solar modules, inverter, structure","DC and AC cables, connectors, trays","Earthing system and lightning arrester","Net meter with LT/CT box","DISCOM net metering approval","EAR and Marine insurance","Commissioning and monitoring setup","Remote monitoring (1 year free)"],
    "excluded": ["Water supply at site","Internet for monitoring","Power during installation","Service lift / crane","Roof access ladder","Removal of existing system","Meter merging / load enhancement","Civil / waterproofing work"]
  }'::jsonb,
  '[
    {"label":"Advance on PO","percent":30},
    {"label":"Material Delivery","percent":40},
    {"label":"Installation & Commissioning","percent":20},
    {"label":"Net Meter & Handover","percent":10}
  ]'::jsonb,
  now()
);

-- ── 4. Demo sales leads — one in every pipeline stage ───────────────────
insert into public.leads (tenant_id, name, phone, email, address, system_size, budget, source, stage, notes, follow_up_date) values
('fcf362ed-4f28-4292-9aa5-d7f32bc8209b', 'Priya Deshmukh', '+91 98000 00001', 'priya.deshmukh@example.com', 'Ghodbunder Road, Thane', 5,   275000, 'Website',      'New Lead',      'Enquired via website contact form, wants a quote for her independent house.', current_date + 3),
('fcf362ed-4f28-4292-9aa5-d7f32bc8209b', 'Anil Joshi',     '+91 98000 00002', 'anil.joshi@example.com',     'Dombivli East',          8,   440000, 'Referral',     'Site Visit',    'Site visit scheduled — referred by an existing customer.', current_date + 1),
('fcf362ed-4f28-4292-9aa5-d7f32bc8209b', 'Meera Kulkarni', '+91 98000 00003', 'meera.k@example.com',        'Kalyan West',            6,   330000, 'Social Media', 'Proposal Sent', 'Proposal sent, awaiting response on financing options.', current_date + 5),
('fcf362ed-4f28-4292-9aa5-d7f32bc8209b', 'Sanjay Patil',   '+91 98000 00004', 'sanjay.patil@example.com',   'Thane West',             10,  550000, 'Cold Call',    'Negotiation',   'Negotiating on payment schedule, close to closing.', current_date + 2),
('fcf362ed-4f28-4292-9aa5-d7f32bc8209b', 'Rohit Shah',     '+91 98000 00005', 'rohit.shah@example.com',     'Kalyan East',            7,   385000, 'Exhibition',   'Won',           'Signed — converted to project.', null),
('fcf362ed-4f28-4292-9aa5-d7f32bc8209b', 'Vikram Rane',    '+91 98000 00006', 'vikram.rane@example.com',    'Mumbai Central',         4,   220000, 'Walk-in',      'Lost',          'Went with a competitor on price.', null);

-- ── 5. Demo CRM / AI-calling clients — one in every call status ─────────
insert into public.clients (tenant_id, name, phone, status, response, called_at) values
('fcf362ed-4f28-4292-9aa5-d7f32bc8209b', 'Kavita Mehta',  '+91 98000 00011', 'interested',     'Interested, wants a site visit next week.', now() - interval '2 days'),
('fcf362ed-4f28-4292-9aa5-d7f32bc8209b', 'Deepak Singh',  '+91 98000 00012', 'call_back',      'Asked to call back after 6pm.', now() - interval '1 day'),
('fcf362ed-4f28-4292-9aa5-d7f32bc8209b', 'Anita Rao',     '+91 98000 00013', 'pending',        null, null),
('fcf362ed-4f28-4292-9aa5-d7f32bc8209b', 'Suresh Iyer',   '+91 98000 00014', 'not_interested', 'Already has solar installed.', now() - interval '3 days'),
('fcf362ed-4f28-4292-9aa5-d7f32bc8209b', 'Neha Verma',    '+91 98000 00015', 'no_answer',      null, now() - interval '1 day');

-- ── 6. Demo projects ─────────────────────────────────────────────────────
insert into public.projects (tenant_id, client_name, phone, address, system_size, project_type, status, t1_paid, t2_paid, t3_paid, t4_paid, total_value, notes) values
('fcf362ed-4f28-4292-9aa5-d7f32bc8209b', 'Priya Deshmukh Residence', '+91 98000 00001', 'Ghodbunder Road, Thane, Maharashtra',      5, 'EPC', 'In Progress', true,  false, false, false, 275000, 'Installation scheduled for next month.'),
('fcf362ed-4f28-4292-9aa5-d7f32bc8209b', 'Rohit Shah Residence',     '+91 98000 00005', 'Kalyan East, Thane, Maharashtra 421306',   7, 'EPC', 'Completed',   true,  true,  true,  true,  385000, 'Commissioned and handed over — net meter approved.');

-- ── 7. Demo 3D design — attached to the "Priya Deshmukh" project ───────
-- A simple 12m × 9m rectangular roof, 6 panels in a 3×2 grid, one water
-- tank obstacle. Coordinates are in the app's internal "scene pixel"
-- space (traceMpp converts to real meters: 400px × 0.03 = 12m), matching
-- exactly what a real trace + Auto-Fill would have produced — this isn't
-- a special-cased demo format, it's the same shape the app writes for a
-- real design.
with demo_project as (
  select id from public.projects
  where tenant_id = 'fcf362ed-4f28-4292-9aa5-d7f32bc8209b' and client_name = 'Priya Deshmukh Residence'
  limit 1
)
insert into public.designs (
  project_id, tenant_id, roofs, obstacles, panels, walkways,
  project_info, equipment, map_config, wall_height_m
)
select
  demo_project.id, 'fcf362ed-4f28-4292-9aa5-d7f32bc8209b',
  '[{
    "id": "roof-demo-1", "type": "roof",
    "points": [{"x":50,"y":50},{"x":450,"y":50},{"x":450,"y":350},{"x":50,"y":350}],
    "slope": 10, "azimuth": 180, "color": "#38BDF8", "opacity": 0.25,
    "area": 108, "traceMpp": 0.03,
    "centroidLatLng": {"lat": 19.2183, "lng": 72.9781}
  }]'::jsonb,
  '[{
    "id": "obs-demo-1", "type": "obstacle",
    "x": 380, "y": 90, "width": 50, "height": 50, "rotation": 0,
    "label": "Water Tank"
  }]'::jsonb,
  '[
    {"id":"panel-demo-1","type":"panel","x":210,"y":155,"width":37.8,"height":75.9,"rotation":0,"orientation":"portrait","manufacturer":"Waaree","model":"Waaree 580W Mono PERC","power":580,"tilt":15,"stringNumber":1,"roofId":"roof-demo-1"},
    {"id":"panel-demo-2","type":"panel","x":250,"y":155,"width":37.8,"height":75.9,"rotation":0,"orientation":"portrait","manufacturer":"Waaree","model":"Waaree 580W Mono PERC","power":580,"tilt":15,"stringNumber":1,"roofId":"roof-demo-1"},
    {"id":"panel-demo-3","type":"panel","x":290,"y":155,"width":37.8,"height":75.9,"rotation":0,"orientation":"portrait","manufacturer":"Waaree","model":"Waaree 580W Mono PERC","power":580,"tilt":15,"stringNumber":1,"roofId":"roof-demo-1"},
    {"id":"panel-demo-4","type":"panel","x":210,"y":245,"width":37.8,"height":75.9,"rotation":0,"orientation":"portrait","manufacturer":"Waaree","model":"Waaree 580W Mono PERC","power":580,"tilt":15,"stringNumber":1,"roofId":"roof-demo-1"},
    {"id":"panel-demo-5","type":"panel","x":250,"y":245,"width":37.8,"height":75.9,"rotation":0,"orientation":"portrait","manufacturer":"Waaree","model":"Waaree 580W Mono PERC","power":580,"tilt":15,"stringNumber":1,"roofId":"roof-demo-1"},
    {"id":"panel-demo-6","type":"panel","x":290,"y":245,"width":37.8,"height":75.9,"rotation":0,"orientation":"portrait","manufacturer":"Waaree","model":"Waaree 580W Mono PERC","power":580,"tilt":15,"stringNumber":1,"roofId":"roof-demo-1"}
  ]'::jsonb,
  '[]'::jsonb,
  '{"clientName":"Priya Deshmukh","address":"Ghodbunder Road, Thane, Maharashtra","roofArea":108,"usableArea":90,"totalPanels":6,"dcCapacity":3.48,"acCapacity":3.0}'::jsonb,
  '{"panelModel":"Waaree 580W Mono PERC","panelPower":580,"panelWidth":1.134,"panelHeight":2.278,"inverter":"Growatt 5kW","mountingType":"Ballasted"}'::jsonb,
  '{"center":{"lat":19.2183,"lng":72.9781},"zoom":20,"mapTypeId":"satellite"}'::jsonb,
  3
from demo_project;

-- ── Re-enable the tenant-scoping triggers ───────────────────────────────
alter table public.leads          enable trigger enforce_tenant_id_leads;
alter table public.projects       enable trigger enforce_tenant_id_projects;
alter table public.designs        enable trigger enforce_tenant_id_designs;
alter table public.settings       enable trigger enforce_tenant_id_settings;
alter table public.clients        enable trigger enforce_tenant_id_clients;

commit;

-- Done. Log in and check: Dashboard (should show "Suryodaya Solar
-- Solutions" + the new lead/project counts), Leads (6 demo leads across
-- every stage), AI Calling / CRM (5 demo clients across every status),
-- Projects (2 demo projects), and open the "Priya Deshmukh Residence"
-- project's 3D Designer (should show a 12×9m roof with 6 panels and a
-- water tank already placed).
