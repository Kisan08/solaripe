import { containsFootprint, footprintsOverlap, rectangle, type GroundPoint } from './roofGeometry';

export function reanchorRoof(oldPoints: {x:number;y:number}[], newPoints: {x:number;y:number}[], anchor: {lat:number;lng:number} | undefined, mpp: number | undefined) {
  if (!anchor || !mpp || !Number.isFinite(mpp) || mpp <= 0 || !oldPoints.length || !newPoints.length) return anchor;
  const center = (points: {x:number;y:number}[]) => ({
    x: (Math.min(...points.map(p=>p.x)) + Math.max(...points.map(p=>p.x))) / 2,
    y: (Math.min(...points.map(p=>p.y)) + Math.max(...points.map(p=>p.y))) / 2,
  });
  const before = center(oldPoints), after = center(newPoints);
  const longitudeScale = 111320 * Math.cos(anchor.lat * Math.PI / 180);
  if (Math.abs(longitudeScale) < 1) return anchor;
  return {lat: anchor.lat - (after.y-before.y)*mpp/111320, lng: anchor.lng + (after.x-before.x)*mpp/longitudeScale};
}

export interface ModuleGeometry { x: number; z: number; widthM: number; depthM: number; tilt: number; azimuth: number }
export interface ObstructionGeometry { x: number; z: number; w: number; d: number; rotDeg: number }

export function moduleFootprint(panel: ModuleGeometry, margin = 0) {
  return rectangle(panel.x, panel.z, panel.widthM + margin * 2,
    panel.depthM * Math.cos(panel.tilt * Math.PI / 180) + margin * 2,
    (panel.azimuth - 180) * Math.PI / 180);
}

export function validModuleGeometry(p: ModuleGeometry) {
  return Object.values(p).every(Number.isFinite) && p.widthM > 0 && p.depthM > 0 && p.tilt >= 0 && p.tilt <= 90;
}

export function moduleFits(panel: ModuleGeometry, roof: GroundPoint[], obstacles: ObstructionGeometry[], setback: number, clearance = 0.15) {
  if (!validModuleGeometry(panel) || !containsFootprint(roof, moduleFootprint(panel, setback))) return false;
  const footprint = moduleFootprint(panel);
  return obstacles.every(o => !footprintsOverlap(footprint,
    rectangle(o.x, o.z, o.w + clearance * 2, o.d + clearance * 2, -o.rotDeg * Math.PI / 180)));
}
