-- Adds storage for three new 3D-designer object types: carport/canopy
-- parking structures, ground patches (paver/grass), and parapet walls.
-- Same additive-only pattern as wall_height_m's own addition to this
-- table (which predates the migrations folder, added directly) — a
-- design saved before this migration just gets empty arrays back via
-- loadDesignData's `?? []` fallback in store/designStore.ts.
alter table public.designs
  add column if not exists carports jsonb not null default '[]'::jsonb,
  add column if not exists ground_patches jsonb not null default '[]'::jsonb,
  add column if not exists parapets jsonb not null default '[]'::jsonb;
