-- Caches Google Static Maps satellite images per project so the 3D designer
-- (components/design/SolarDesign3D.tsx, via app/api/satellite-image/route.ts)
-- never re-fetches on every page load — only on first load for a project/
-- location/zoom combination, or when the user explicitly requests a refresh.
--
-- Keyed by project_id (not just lat/lng) because the image is meant to
-- represent that specific project's site, and a project's own refresh
-- action should only invalidate its own cached image, not any other
-- project that happens to share the same coordinates.
--
-- RLS enabled with no policies, matching solar_generation_cache's and
-- lib/supabaseAdmin.ts's "server-only" convention — this table is only
-- ever read/written via the service-role client from the API route (which
-- bypasses RLS), so anon/authenticated get no direct access.
create table public.satellite_image_cache (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  lat numeric(9,6) not null,
  lng numeric(9,6) not null,
  zoom integer not null,
  image_data_url text not null,
  created_at timestamptz not null default now()
);

create unique index satellite_image_cache_project_loc_idx
  on public.satellite_image_cache (project_id, lat, lng, zoom);

alter table public.satellite_image_cache enable row level security;
