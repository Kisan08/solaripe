import { Point } from '../types';
import { useDesignStore, metersPerPixel } from '../store/designStore';

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function polygonArea(points: Point[]): number {
  // Shoelace formula — returns pixel area
  let area = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += points[i].x * points[j].y;
    area -= points[j].x * points[i].y;
  }
  return Math.abs(area) / 2;
}

export function pointInPolygon(point: Point, polygon: Point[]): boolean {
  let inside = false;
  const n = polygon.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    if (((yi > point.y) !== (yj > point.y)) &&
      (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

export function snapToGrid(value: number, gridSize: number): number {
  return Math.round(value / gridSize) * gridSize;
}

export function snapPoint(pt: Point, gridSize: number, enabled: boolean): Point {
  if (!enabled) return pt;
  return { x: snapToGrid(pt.x, gridSize), y: snapToGrid(pt.y, gridSize) };
}

export function distancePx(a: Point, b: Point): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

export function polygonCentroid(points: Point[]): Point {
  const n = points.length;
  let cx = 0, cy = 0, area = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const cross = points[i].x * points[j].y - points[j].x * points[i].y;
    cx += (points[i].x + points[j].x) * cross;
    cy += (points[i].y + points[j].y) * cross;
    area += cross;
  }
  area /= 2;
  cx /= (6 * area);
  cy /= (6 * area);
  return { x: cx, y: cy };
}

export function rotatePx(pt: Point, center: Point, angleDeg: number): Point {
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = pt.x - center.x;
  const dy = pt.y - center.y;
  return {
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos,
  };
}

// ─────────────────────────────────────────────────────────────
// REAL-WORLD SCALE (replaces the old hardcoded PIXELS_PER_METER = 40)
//
// Canvas (scene) pixels → meters depends on TWO things:
//   1. The Google Maps ground resolution at the current zoom & latitude
//   2. The Konva stage's own zoom (`scale` in the design store),
//      because scene coords = screen px / stage scale.
//
// meters per SCENE pixel = metersPerPixel(lat, zoom) × stageScale
// ─────────────────────────────────────────────────────────────

/** Meters per Konva-scene-pixel, right now (live map zoom + stage scale). */
export function sceneMetersPerPixel(): number {
  const s = useDesignStore.getState();
  const mppScreen = metersPerPixel(s.mapConfig.center.lat, s.mapConfig.zoom);
  return mppScreen * (s.scale || 1);
}

/** Scene pixels per meter, right now. */
export function scenePixelsPerMeter(): number {
  return 1 / sceneMetersPerPixel();
}

/**
 * Convert a scene-pixel area to m².
 * Pass `mpp` (meters-per-scene-pixel captured at trace time, i.e. roof.traceMpp)
 * whenever you have it — that keeps areas correct even if the user zooms later.
 * Falls back to the live scale if not provided.
 */
export function pxToM2(pxArea: number, mpp?: number): number {
  const m = mpp ?? sceneMetersPerPixel();
  return pxArea * m * m;
}

export function formatArea(m2: number): string {
  return `${m2.toFixed(1)} m²`;
}

export function formatCapacity(kw: number): string {
  return kw >= 1 ? `${kw.toFixed(2)} kWp` : `${(kw * 1000).toFixed(0)} Wp`;
}

export function getPolygonBounds(points: Point[]): { minX: number; minY: number; maxX: number; maxY: number } {
  const xs = points.map(p => p.x);
  const ys = points.map(p => p.y);
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}