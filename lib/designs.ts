// The plain lib/supabase.ts client manages its own session storage,
// completely separate from the cookie-based session proxy.ts/login use —
// so it always looks logged-out to Postgrest (auth.uid() is null there),
// which is exactly what caused "null value in column tenant_id violates
// not-null constraint" here (the set_tenant_id trigger sets
// tenant_id := auth.uid(), and auth.uid() was null). This got reverted
// once already (a later commit overwrote this fix) — if it comes back a
// third time, check what's clobbering it before just reapplying again.
// lib/supabase/client.ts's createClient() (built on @supabase/ssr) is the
// one that actually shares the logged-in session.
import { createClient } from './supabase/client';
import type {
  RoofPolygon, Obstacle, SolarPanel, Walkway,
  ProjectInfo, Equipment, MapConfig,
} from '../types';

export interface SavedDesign {
  id: string;
  project_id: string;
  roofs: RoofPolygon[];
  obstacles: Obstacle[];
  panels: SolarPanel[];
  walkways: Walkway[];
  project_info: ProjectInfo; 
  equipment: Equipment;
  map_config: MapConfig;
  wall_height_m: number | null; // NEW — building height, was previously never saved
  created_at: string;
  updated_at: string;
}

interface DesignPayload {
  projectId: string;
  roofs: RoofPolygon[];
  obstacles: Obstacle[];
  panels: SolarPanel[];
  walkways: Walkway[];
  projectInfo: ProjectInfo;
  equipment: Equipment;
  mapConfig: MapConfig;
  wallHeightM: number;
}

export async function saveDesign(payload: DesignPayload): Promise<{ error: string | null }> {
  const supabase = createClient();
  const { error } = await supabase
    .from('designs')
    .upsert(
      {
        project_id: payload.projectId,
        roofs: payload.roofs,
        obstacles: payload.obstacles,
        panels: payload.panels,
        walkways: payload.walkways,
        project_info: payload.projectInfo,
        equipment: payload.equipment,
        map_config: payload.mapConfig,
        wall_height_m: payload.wallHeightM, // NEW — was computed but never actually included in the row being written
      },
      { onConflict: 'project_id' }
    );

    if (error) {
    console.error('saveDesign error:', error.message);
    return { error: error.message };
    }
  return { error: null };
}

export async function loadDesign(
  projectId: string
): Promise<{ design: SavedDesign | null; error: string | null }> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('designs')
    .select('*')
    .eq('project_id', projectId)
    .maybeSingle();

  if (error) {
    console.error('loadDesign error:', error);
    return { design: null, error: error.message };
  }
  return { design: data as SavedDesign | null, error: null };
}