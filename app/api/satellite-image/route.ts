import { NextRequest, NextResponse } from 'next/server';
import { fetchSatelliteImage } from '@/lib/satelliteImage';

// Server boundary for lib/satelliteImage.ts: serves a cached satellite
// image for a project's location if one exists, otherwise fetches fresh
// from Google Static Maps and caches it. Called from
// components/design/SolarDesign3D.tsx (a client component) — this route
// exists because GOOGLE_MAPS_API_KEY (server-only) and the Supabase
// service-role key must never reach the browser bundle.

interface SatelliteImageResponse {
  dataUrl: string | null;
  cached: boolean;
  fallback: boolean; // true whenever the caller should use the paver/grass ground instead
}

function fallbackResponse(): SatelliteImageResponse {
  return { dataUrl: null, cached: false, fallback: true };
}

// The cache client is a pure optimization, not a dependency — importing
// lib/supabaseAdmin.ts lazily (inside a try/catch) instead of statically
// means a missing/broken SUPABASE_SERVICE_ROLE_KEY degrades to "always do
// a live fetch" rather than crashing this whole route at module load (the
// same fragility fixed in app/api/generation-estimate/route.ts previously).
async function getCacheClient() {
  try {
    const { supabaseAdmin } = await import('@/lib/supabaseAdmin');
    return supabaseAdmin;
  } catch (err) {
    console.warn('[satellite-image] cache client unavailable, skipping cache', err);
    return null;
  }
}

export async function GET(request: NextRequest) {
  const startedAt = Date.now();
  const { searchParams } = new URL(request.url);

  const projectId = searchParams.get('projectId');
  const lat = Number(searchParams.get('lat'));
  const lng = Number(searchParams.get('lng'));
  const zoom = Number(searchParams.get('zoom') ?? '20');
  const refresh = searchParams.get('refresh') === 'true';

  if (!projectId || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    console.log(`[satellite-image] missing projectId/lat/lng — falling back, ${Date.now() - startedAt}ms`);
    return NextResponse.json(fallbackResponse());
  }

  try {
    // Rounded to ~11cm — effectively exact for a single project's site,
    // just avoids float-precision mismatches breaking the cache key.
    const latR = Math.round(lat * 1e6) / 1e6;
    const lngR = Math.round(lng * 1e6) / 1e6;

    const cacheClient = await getCacheClient();

    if (cacheClient && !refresh) {
      const { data: cached, error: selectErr } = await cacheClient
        .from('satellite_image_cache')
        .select('image_data_url')
        .eq('project_id', projectId).eq('lat', latR).eq('lng', lngR).eq('zoom', zoom)
        .maybeSingle();
      if (selectErr) console.warn('[satellite-image] cache read failed, doing a live fetch', selectErr.message);

      if (cached?.image_data_url) {
        console.log(`[satellite-image] cache hit project=${projectId} lat=${latR} lng=${lngR}, ${Date.now() - startedAt}ms`);
        return NextResponse.json<SatelliteImageResponse>({ dataUrl: cached.image_data_url, cached: true, fallback: false });
      }
    }

    const result = await fetchSatelliteImage({ lat: latR, lng: lngR, zoom });
    console.log(`[satellite-image] fresh fetch project=${projectId} lat=${latR} lng=${lngR} success=${!!result}, ${Date.now() - startedAt}ms`);

    if (!result) {
      return NextResponse.json(fallbackResponse());
    }

    // Best-effort cache write — a failed write shouldn't stop us returning
    // the image we already have.
    if (cacheClient) {
      const { error: upsertErr } = await cacheClient.from('satellite_image_cache').upsert({
        project_id: projectId, lat: latR, lng: lngR, zoom, image_data_url: result.dataUrl,
      }, { onConflict: 'project_id,lat,lng,zoom' });
      if (upsertErr) console.warn('[satellite-image] cache write failed', upsertErr.message);
    }

    return NextResponse.json<SatelliteImageResponse>({ dataUrl: result.dataUrl, cached: false, fallback: false });
  } catch (err) {
    console.error('[satellite-image] unexpected error', err);
    return NextResponse.json(fallbackResponse());
  }
}
