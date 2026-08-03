// Fetches a Google Static Maps satellite image for a project's location,
// server-only (reads GOOGLE_MAPS_API_KEY, never NEXT_PUBLIC_-prefixed) —
// this module must only be imported from server code (API routes), never
// from a "use client" component. Every exported function degrades to
// `null` on any failure (missing key, network error, non-OK response)
// rather than throwing, so a caller always has a safe fallback path.

const FETCH_TIMEOUT_MS = 8000;

async function fetchWithTimeout(url: string, timeoutMs = FETCH_TIMEOUT_MS): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export interface SatelliteImageResult {
  dataUrl: string; // data:image/jpeg;base64,... — ready to hand straight to an <img>/canvas/THREE.TextureLoader
}

// Fetches a satellite-view Static Maps image and returns it as a base64
// data URL (rather than just the remote URL) so the caller can cache the
// actual bytes in Supabase — the remote URL embeds the API key and Static
// Maps URLs aren't guaranteed stable/cacheable long-term the way the raw
// image bytes are.
export async function fetchSatelliteImage(params: {
  lat: number; lng: number; zoom: number; size?: number;
}): Promise<SatelliteImageResult | null> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    console.warn('[satelliteImage] GOOGLE_MAPS_API_KEY not set');
    return null;
  }
  const { lat, lng, zoom, size = 640 } = params;

  const qs = new URLSearchParams({
    center: `${lat},${lng}`,
    zoom: String(zoom),
    size: `${size}x${size}`,
    scale: '2', // retina-resolution imagery, sharper on the 3D ground plane
    maptype: 'satellite',
    key: apiKey,
  });
  const url = `https://maps.googleapis.com/maps/api/staticmap?${qs}`;
  const res = await fetchWithTimeout(url);

  if (!res) {
    console.warn('[satelliteImage] request failed (network/timeout)');
    return null;
  }
  if (!res.ok) {
    console.warn(`[satelliteImage] Static Maps returned ${res.status}`);
    return null;
  }

  try {
    const contentType = res.headers.get('content-type') || 'image/jpeg';
    const buf = await res.arrayBuffer();
    const base64 = Buffer.from(buf).toString('base64');
    return { dataUrl: `data:${contentType};base64,${base64}` };
  } catch {
    return null;
  }
}
