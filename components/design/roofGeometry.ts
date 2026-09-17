import type { RoofTerrace } from '../../types';

export interface GroundPoint { x: number; z: number }

export function rectangle(x: number, z: number, width: number, depth: number, angle = 0): GroundPoint[] {
  const c = Math.cos(angle), s = Math.sin(angle);
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => ({
    x: x + a * width / 2 * c - b * depth / 2 * s,
    z: z + a * width / 2 * s + b * depth / 2 * c,
  }));
}

export function containsPoint(p: GroundPoint, polygon: GroundPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a.z > p.z) !== (b.z > p.z) && p.x < (b.x - a.x) * (p.z - a.z) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}

function cross(a: GroundPoint, b: GroundPoint, c: GroundPoint) {
  return (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
}

export function containsFootprint(outer: GroundPoint[], inner: GroundPoint[]) {
  if (!inner.every(p => containsPoint(p, outer))) return false;
  // Corner tests alone miss concave roof notches that cross a module edge.
  return !inner.some((a, i) => outer.some((c, j) => {
    const b = inner[(i + 1) % inner.length], d = outer[(j + 1) % outer.length];
    return cross(a, b, c) * cross(a, b, d) < -1e-9 && cross(c, d, a) * cross(c, d, b) < -1e-9;
  }));
}

// Separating-axis intersection for convex footprints, including rotated modules.
export function footprintsOverlap(a: GroundPoint[], b: GroundPoint[]) {
  return ![a, b].some(poly => poly.some((p, i) => {
    const q = poly[(i + 1) % poly.length];
    const nx = -(q.z - p.z), nz = q.x - p.x;
    const aa = a.map(v => v.x * nx + v.z * nz), bb = b.map(v => v.x * nx + v.z * nz);
    return Math.max(...aa) <= Math.min(...bb) || Math.max(...bb) <= Math.min(...aa);
  }));
}

export function terraceAt(p: GroundPoint, terraces: RoofTerrace[]) {
  return terraces.find(t => Math.abs(p.x - t.x) < t.width / 2 && Math.abs(p.z - t.z) < t.depth / 2);
}

export function fitsRoofSurface(footprint: GroundPoint[], roof: GroundPoint[], terraces: RoofTerrace[], clearance = 0.2) {
  if (!containsFootprint(roof, footprint)) return false;
  const center = footprint.reduce((p, v) => ({ x: p.x + v.x / footprint.length, z: p.z + v.z / footprint.length }), { x: 0, z: 0 });
  const owner = terraceAt(center, terraces);
  if (owner && !containsFootprint(rectangle(owner.x, owner.z, owner.width - 2 * clearance, owner.depth - 2 * clearance), footprint)) return false;
  return terraces.every(t => t.id === owner?.id || !footprintsOverlap(footprint, rectangle(t.x, t.z, t.width + 2 * clearance, t.depth + 2 * clearance)));
}

export function defaultObstacleHeight(label: string) {
  const l = label.toLowerCase();
  if (l.includes('water')) return 1.4;
  if (l.includes('stair') || l.includes('lift')) return 2.7;
  if (l.includes('sky')) return 0.2;
  if (l.includes('vent')) return 0.9;
  return 0.7;
}
