// Google Solar API service
// Fetches building roof segments and solar data for a given location

export interface RoofSegment {
  pitchDegrees: number;
  azimuthDegrees: number;
  stats: {
    areaMeters2: number;
    sunshineQuantiles: number[];
  };
  center: { latitude: number; longitude: number };
  boundingBox: {
    sw: { latitude: number; longitude: number };
    ne: { latitude: number; longitude: number };
  };
  planeHeightAtCenterMeters: number;
}

export interface SolarBuildingData {
  name: string;
  center: { latitude: number; longitude: number };
  boundingBox: {
    sw: { latitude: number; longitude: number };
    ne: { latitude: number; longitude: number };
  };
  imageryDate: { year: number; month: number; day: number };
  imageryQuality: string;
  solarPotential: {
    maxArrayPanelsCount: number;
    maxArrayAreaMeters2: number;
    maxSunshineHoursPerYear: number;
    carbonOffsetFactorKgPerMwh: number;
    roofSegmentStats: RoofSegment[];
    wholeRoofStats: {
      areaMeters2: number;
      sunshineQuantiles: number[];
    };
  };
}

export async function fetchSolarData(
  lat: number,
  lng: number,
  apiKey: string
): Promise<SolarBuildingData | null> {
  try {
    const url = `https://solar.googleapis.com/v1/buildingInsights:findClosest?location.latitude=${lat}&location.longitude=${lng}&requiredQuality=LOW&key=${apiKey}`;
    const res = await fetch(url);
    if (!res.ok) {
      const err = await res.json();
      console.error('Solar API error:', err);
      return null;
    }
    return await res.json();
  } catch (e) {
    console.error('Solar API fetch failed:', e);
    return null;
  }
}

// Convert Solar API roof segment to canvas polygon points
// The Solar API gives us bounding box + azimuth + pitch
// We reconstruct a polygon from that
export function roofSegmentToCanvasPoints(
  segment: RoofSegment,
  mapCenter: { lat: number; lng: number },
  canvasWidth: number,
  canvasHeight: number,
  zoom: number
): { x: number; y: number }[] {
  const { sw, ne } = segment.boundingBox;

  // Degrees per pixel at this zoom level (approximate for lat ~19)
  const degreesPerPixelLng = 360 / (256 * Math.pow(2, zoom));
  const degreesPerPixelLat = degreesPerPixelLng * Math.cos(mapCenter.lat * Math.PI / 180);

  const toCanvas = (lat: number, lng: number) => ({
    x: canvasWidth / 2 + (lng - mapCenter.lng) / degreesPerPixelLng,
    y: canvasHeight / 2 - (lat - mapCenter.lat) / degreesPerPixelLat,
  });

  // Build a rotated rectangle from bounding box corners
  const corners = [
    toCanvas(ne.latitude, sw.longitude), // NW
    toCanvas(ne.latitude, ne.longitude), // NE
    toCanvas(sw.latitude, ne.longitude), // SE
    toCanvas(sw.latitude, sw.longitude), // SW
  ];

  return corners;
}

// Get best roof segment (most sun, largest, south-facing preferred)
export function getBestRoofSegment(segments: RoofSegment[]): RoofSegment {
  return segments.reduce((best, seg) => {
    const score = (seg.stats?.sunshineQuantiles?.[9] || 0) * (seg.stats?.areaMeters2 || 0);
    const bestScore = (best.stats?.sunshineQuantiles?.[9] || 0) * (best.stats?.areaMeters2 || 0);
    return score > bestScore ? seg : best;
  });
}

// Determine optimal panel orientation based on roof segment azimuth
// For India: south-facing (180°) is ideal
export function getOptimalOrientation(azimuthDegrees: number): {
  label: string;
  color: string;
  efficiency: number;
} {
  const diff = Math.abs(((azimuthDegrees - 180) + 180) % 360 - 180);
  if (diff < 30) return { label: 'South ✓ Optimal', color: '#22C55E', efficiency: 100 };
  if (diff < 60) return { label: 'SE/SW Good', color: '#84CC16', efficiency: 90 };
  if (diff < 90) return { label: 'E/W Acceptable', color: '#F59E0B', efficiency: 75 };
  return { label: 'North ✗ Poor', color: '#EF4444', efficiency: 50 };
}