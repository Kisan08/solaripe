'use client';
import React, { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { useDesignStore, metersPerPixel } from '../../store/designStore';
import type { SolarPanel } from '../../types';

interface RoofPoint { x: number; y: number; }
// x/z are METERS, centered on roof. azimuth = the panel's facing (also the array's rotation).
interface Panel3D { id: string; x: number; z: number; tilt: number; azimuth: number; }
// Obstacle footprint in centered METERS, same frame as panels/roof.
interface Obstacle3D { id: string; x: number; z: number; w: number; d: number; rotDeg: number; label: string; }
interface SolarDesign3DProps { roofPoints: RoofPoint[]; onClose: () => void; lat?: number; readOnly?: boolean; }

const PANEL_W_M = 1.134;   // module width  (portrait: short side, runs along a row)
const PANEL_H_M = 2.278;   // module height (portrait: long side, along the slope)
const PANEL_POWER = 580;
const MOUNT_H = 0.3;       // front leg height (m)
const COL_GAP = 0.02;      // 2 cm between panels IN a row (frames nearly touching)
const DEFAULT_ROW_GAP = 1.0; // 1m default anti-shading gap between rows (was 0.6m — too tight, causes inter-row shading at low sun angles)
const TX = { text: '#1E293B', muted: '#64748B', border: '#E2E8F0', navy: '#1E3A5F', blue: '#2563EB' };

function sunPosition(lat: number, hour: number, dayOfYear: number) {
  const rad = Math.PI / 180;
  const decl = 23.45 * Math.sin(rad * (360 / 365) * (dayOfYear - 81));
  const ha = 15 * (hour - 12);
  const sinE = Math.sin(rad * lat) * Math.sin(rad * decl) + Math.cos(rad * lat) * Math.cos(rad * decl) * Math.cos(rad * ha);
  const elev = Math.asin(sinE) / rad;
  const cosA = (Math.sin(rad * decl) - Math.sin(rad * lat) * sinE) / (Math.cos(rad * lat) * Math.cos(Math.asin(sinE)));
  let az = Math.acos(Math.max(-1, Math.min(1, cosA))) / rad;
  if (ha > 0) az = 360 - az;
  return { azimuth: az, elevation: Math.max(0, elev) };
}

function dirFromAz(az: number): string {
  if (az < 23 || az >= 338) return 'N';
  if (az < 68) return 'NE'; if (az < 113) return 'E'; if (az < 158) return 'SE';
  if (az < 203) return 'S'; if (az < 248) return 'SW'; if (az < 293) return 'W'; return 'NW';
}

// A row perpendicular to the roof's dominant edge has TWO valid facing
// directions 180° apart (either is equally correct for keeping panels
// non-overlapping — see buildLattice). But only one of them is actually
// useful for generation: whichever one points toward the equator (south in
// the northern hemisphere, north in the southern). Without this check the
// auto-generated azimuth could just as easily face away from the sun
// entirely, depending on which way the roof happened to be traced.
function preferEquatorFacing(azimuthDeg: number, lat: number): number {
  const aziRad = azimuthDeg * Math.PI / 180;
  // Standard compass facing vector (verified against sunPosition()'s own
  // convention, where az=180° i.e. true south must map to +Z): (sin(az), -cos(az)).
  const southComponent = -Math.cos(aziRad);
  const wantsSouth = lat >= 0;
  const isCurrentlySouth = southComponent > 0;
  return wantsSouth === isCurrentlySouth ? azimuthDeg : (azimuthDeg + 180) % 360;
}

// Rotate (x,z) about origin by `angle` radians (scene space)
function rotatePt(x: number, z: number, angle: number): { x: number; z: number } {
  const cos = Math.cos(angle), sin = Math.sin(angle);
  return { x: x * cos - z * sin, z: x * sin + z * cos };
}

// Direction (radians) of the polygon's LONGEST edge — the building's dominant angle
function dominantAngle(poly: { x: number; z: number }[]): number {
  let maxLen = 0, angle = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const dx = b.x - a.x, dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    if (len > maxLen) { maxLen = len; angle = Math.atan2(dz, dx); }
  }
  return angle;
}

function pointInPoly(px: number, pz: number, poly: { x: number; z: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, zi = poly[i].z, xj = poly[j].x, zj = poly[j].z;
    if (((zi > pz) !== (zj > pz)) && (px < (xj - xi) * (pz - zi) / (zj - zi) + xi)) inside = !inside;
  }
  return inside;
}

// ─────────────────────────────────────────────────────────────
// REAL PHYSICAL STRING ORDERING (replaces naive array-index chunking).
// 1. Connected-components clustering — two panels belong to the same
//    physical group only if they're within a realistic row/column distance
//    of each other. This is what correctly keeps two separate roof wings
//    (or two independently-run Auto-Fill/Zone-Fill passes) from ever
//    blending into the same string, since they're spatially far apart.
// 2. Within each cluster, rotate into that cluster's own row-aligned frame
//    (using its dominant azimuth), split into actual physical ROWS by
//    detecting real gaps along the row-to-row axis, then sort each row
//    left-to-right. This produces a genuine row-major physical ordering,
//    not just "whatever order they happened to be created in."
// ─────────────────────────────────────────────────────────────
interface OrderablePanel { id: string; x: number; z: number; azimuth: number; }

function clusterPanelsByProximity<T extends OrderablePanel>(panels: T[], linkDistance: number): T[][] {
  const n = panels.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (i: number): number => parent[i] === i ? i : (parent[i] = find(parent[i]));
  const union = (a: number, b: number) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; };
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = panels[i].x - panels[j].x, dz = panels[i].z - panels[j].z;
      if (Math.hypot(dx, dz) <= linkDistance) union(i, j);
    }
  }
  const groups = new Map<number, T[]>();
  panels.forEach((p, i) => {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(p);
  });
  // Stable ordering: process clusters in the order their first member
  // originally appeared, so results don't jump around unpredictably.
  return Array.from(groups.values()).sort((a, b) => panels.indexOf(a[0]) - panels.indexOf(b[0]));
}

function orderClusterRowMajor<T extends OrderablePanel>(cluster: T[]): T[] {
  if (cluster.length <= 1) return cluster;
  // theta = the cluster's row direction (its shared azimuth represents the
  // facing angle, which is perpendicular to the row line — see buildLattice).
  const theta = cluster[0].azimuth * Math.PI / 180;
  const aligned = cluster.map(p => ({ panel: p, ...rotatePt(p.x, p.z, -theta) }));
  aligned.sort((a, b) => a.z - b.z); // group into rows along the row-to-row axis

  const rows: (typeof aligned)[] = [];
  const rowGapThreshold = 1.0; // real row-to-row spacing is several meters; same-row noise is near-zero
  let currentRow: typeof aligned = [aligned[0]];
  for (let i = 1; i < aligned.length; i++) {
    if (aligned[i].z - aligned[i - 1].z > rowGapThreshold) { rows.push(currentRow); currentRow = []; }
    currentRow.push(aligned[i]);
  }
  rows.push(currentRow);

  const ordered: T[] = [];
  rows.forEach(row => {
    row.sort((a, b) => a.x - b.x); // left-to-right along the row
    row.forEach(r => ordered.push(r.panel));
  });
  return ordered;
}

function computePhysicalPanelOrder<T extends OrderablePanel>(panels: T[]): T[] {
  if (panels.length === 0) return [];
  const clusters = clusterPanelsByProximity(panels, 4); // 4m safely bridges same/adjacent rows, not separate wings
  return clusters.flatMap(orderClusterRowMajor);
}

// Is (px,pz) inside a rotated rectangle obstacle (with a clearance margin)?
function pointInObstacle(px: number, pz: number, obs: Obstacle3D, margin = 0): boolean {
  const rad = -obs.rotDeg * Math.PI / 180; // inverse-rotate the point into the obstacle's local frame
  const dx = px - obs.x, dz = pz - obs.z;
  const lx = dx * Math.cos(rad) - dz * Math.sin(rad);
  const lz = dx * Math.sin(rad) + dz * Math.cos(rad);
  return Math.abs(lx) <= obs.w / 2 + margin && Math.abs(lz) <= obs.d / 2 + margin;
}

function anyObstacleBlocks(px: number, pz: number, obstacles: Obstacle3D[], margin = 0): boolean {
  return obstacles.some(o => pointInObstacle(px, pz, o, margin));
}

// Centroid of a set of panels (their x/z means)
function panelsCentroid(ps: { x: number; z: number }[]): { x: number; z: number } {
  if (ps.length === 0) return { x: 0, z: 0 };
  let sx = 0, sz = 0;
  ps.forEach(p => { sx += p.x; sz += p.z; });
  return { x: sx / ps.length, z: sz / ps.length };
}

export function SolarDesign3D({ roofPoints, onClose, lat = 19.24, readOnly = false }: SolarDesign3DProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const sunRef = useRef<THREE.DirectionalLight | null>(null);
  const sunSphereRef = useRef<THREE.Mesh | null>(null);
  const panelMeshGroup = useRef<THREE.Group | null>(null);
  const obstacleMeshGroup = useRef<THREE.Group | null>(null);
  const frameRef = useRef<number>(0);
  const raycaster = useRef(new THREE.Raycaster());
  const mouse = useRef(new THREE.Vector2());

  const equipment = useDesignStore(s => s.equipment);
  const project = useDesignStore(s => s.project);
  const roofId = useDesignStore(s => s.roofs[0]?.id ?? '');
  const roofAreaM2 = useDesignStore(s => s.roofs[0]?.area ?? 0);
  const router = useRouter();
  const mapConfig = useDesignStore(s => s.mapConfig);
  const stageScale = useDesignStore(s => s.scale);
  const traceMpp = useDesignStore(s => s.roofs[0]?.traceMpp);

  // Real-world scale: prefer trace-time scale, fall back to live zoom × stage scale.
  const mpp = useMemo(
    () => traceMpp ?? (metersPerPixel(mapConfig.center?.lat ?? lat, mapConfig.zoom ?? 20) * (stageScale || 1)),
    [traceMpp, mapConfig.center?.lat, mapConfig.zoom, lat, stageScale]
  );

  const [showEnv, setShowEnv] = useState(true);
  const [advancedMode, setAdvancedMode] = useState(false); // Simple mode is the default for EPC vendors
  // Optimal default facing: south in the northern hemisphere, north below the equator.
  const optimalAzimuth = lat >= 0 ? 180 : 0;
  const [rows, setRows] = useState(5);
  const [cols, setCols] = useState(4);
  const [targetKw, setTargetKw] = useState(50);
  const [globalTilt, setGlobalTilt] = useState(15);
  const [globalAzimuth, setGlobalAzimuth] = useState(lat >= 0 ? 180 : 0);
  // Was local-only useState(4) before — meant it silently reset on every
  // reload since it never got included in what's saved to Supabase. Now reads
  // from the persisted store, same as roofs/panels/obstacles/equipment.
  const wallHeightM = useDesignStore(s => s.wallHeightM);
  const setWallHeightM = useDesignStore(s => s.setWallHeightM);
  const [rowGapM, setRowGapM] = useState(DEFAULT_ROW_GAP);
  const [forceTrueSouth, setForceTrueSouth] = useState(false);
  const [stringSize, setStringSize] = useState(12); // panels per electrical string (MPPT input sizing)
  const [showStrings, setShowStrings] = useState(false); // color panels by string instead of the default navy
  const [shadingResults, setShadingResults] = useState<Record<string, number> | null>(null); // panelId -> shaded fraction 0-1
  const [runningShading, setRunningShading] = useState(false);
  const [highlightShading, setHighlightShading] = useState(true);

  // Distinct colors cycled per string so an installer can see wiring groups
  // at a glance in the 3D view.
  const STRING_COLORS = ['#2563EB', '#16A34A', '#EA580C', '#7C3AED', '#DC2626', '#0891B2', '#CA8A04', '#DB2777'];

  const [panels, setPanels] = useState<Panel3D[]>(() => {
    if (roofPoints.length < 3) return [];
    const st = useDesignStore.getState();
    const m = st.roofs[0]?.traceMpp
      ?? (metersPerPixel(st.mapConfig.center?.lat ?? lat, st.mapConfig.zoom ?? 20) * (st.scale || 1));
    const xs = roofPoints.map(p => p.x), ys = roofPoints.map(p => p.y);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    return st.panels.map(sp => ({
      id: sp.id, x: (sp.x - cx) * m, z: (sp.y - cy) * m, tilt: sp.tilt, azimuth: sp.rotation,
    }));
  });

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [hour, setHour] = useState(12);
  const [month, setMonth] = useState(6);
  const [animating, setAnimating] = useState(false);
  const [mode, setMode] = useState<'orbit' | 'select' | 'drag' | 'zone'>('orbit');
  const [boxSel, setBoxSel] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);

  // Zone-based placement (Solar Ladder-style): user drags a box directly on
  // the roof; the rectangle is in world METERS (same frame as panels), not
  // screen pixels, since it needs to persist and be filled regardless of
  // camera angle. null = no zone drawn (whole-roof tools behave as before).
  const [zoneRect, setZoneRect] = useState<{ x1: number; z1: number; x2: number; z2: number } | null>(null);
  const [zoneTargetKw, setZoneTargetKw] = useState(10);
  const zoneMeshGroup = useRef<THREE.Group | null>(null);

  const selectedIdsRef = useRef<string[]>([]);
  selectedIdsRef.current = selectedIds;
  const panelsRef = useRef<Panel3D[]>([]);
  panelsRef.current = panels;
  const modeRef = useRef(mode);
  modeRef.current = mode;

  const roofDims = useMemo(() => {
    if (roofPoints.length < 3) return null;
    const xs = roofPoints.map(p => p.x), ys = roofPoints.map(p => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    return {
      minX, maxX, minY, maxY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2,
      widthM: (maxX - minX) * mpp, heightM: (maxY - minY) * mpp,
    };
  }, [roofPoints, mpp]);

  const roofPolyMeters = useMemo(() => {
    if (!roofDims) return [];
    const { cx, cy } = roofDims;
    return roofPoints.map(p => ({ x: (p.x - cx) * mpp, z: (p.y - cy) * mpp }));
  }, [roofPoints, roofDims, mpp]);

  // Obstacles are now fully owned and edited HERE in 3D (add/move/resize/
  // rotate/delete) — the 2D tool has been removed. Hydrate once from the
  // store on mount, same centered-meter frame as the roof and panels.
  const [obstacles, setObstacles] = useState<Obstacle3D[]>(() => {
    if (roofPoints.length < 3) return [];
    const st = useDesignStore.getState();
    const m = st.roofs[0]?.traceMpp
      ?? (metersPerPixel(st.mapConfig.center?.lat ?? lat, st.mapConfig.zoom ?? 20) * (st.scale || 1));
    const xs = roofPoints.map(p => p.x), ys = roofPoints.map(p => p.y);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    return st.obstacles.map(o => ({
      id: o.id, x: (o.x - cx) * m, z: (o.y - cy) * m,
      w: o.width * m, d: o.height * m, rotDeg: o.rotation, label: o.label,
    }));
  });
  const [selectedObstacleId, setSelectedObstacleId] = useState<string | null>(null);
  const obstaclesRef = useRef<Obstacle3D[]>([]);
  obstaclesRef.current = obstacles;
  const selectedObstacleIdRef = useRef<string | null>(null);
  selectedObstacleIdRef.current = selectedObstacleId;

  // Realistic default footprints (meters) for a quick "Add" click
  const DEFAULT_OBSTACLE_SIZE_M: Record<string, { w: number; d: number }> = {
    'AC Unit': { w: 1.0, d: 0.7 },
    'Water Tank': { w: 1.5, d: 1.5 },
    'Skylight': { w: 1.2, d: 1.8 },
    'Staircase': { w: 2.2, d: 2.2 },
    'Vent': { w: 0.5, d: 0.5 },
  };

  const addObstacleAtCenter = useCallback((label: string) => {
    const def = DEFAULT_OBSTACLE_SIZE_M[label] || { w: 1, d: 1 };
    const nudge = obstaclesRef.current.length * 0.4; // spread stacked adds apart a bit
    const newObs: Obstacle3D = {
      id: `obs-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      x: nudge, z: nudge, w: def.w, d: def.d, rotDeg: 0, label,
    };
    setObstacles(prev => [...prev, newObs]);
    setSelectedObstacleId(newObs.id);
  }, []);

  const updateObstacle = useCallback((id: string, patch: Partial<Obstacle3D>) => {
    setObstacles(prev => prev.map(o => o.id === id ? { ...o, ...patch } : o));
  }, []);

  const deleteObstacle = useCallback((id: string) => {
    setObstacles(prev => prev.filter(o => o.id !== id));
    setSelectedObstacleId(prev => prev === id ? null : prev);
  }, []);

  // Real physical ordering for string grouping — clusters panels into
  // spatially-separate groups (so two roof wings never blend into one
  // string) and sorts each group row-major, left-to-right. Replaces the
  // old naive "whatever order they were created in" array-index chunking.
  const physicalOrderMap = useMemo(() => {
    const ordered = computePhysicalPanelOrder(panels);
    const map = new Map<string, number>();
    ordered.forEach((p, i) => map.set(p.id, i));
    return map;
  }, [panels]);

  // ── Sync 3D panels BACK to store (meters → canvas px) ──
  const firstSyncRef = useRef(true);
  useEffect(() => {
    if (firstSyncRef.current) { firstSyncRef.current = false; return; }
    if (!roofDims) return;
    const ppm = 1 / mpp;
    const { cx, cy } = roofDims;
    const mapped: SolarPanel[] = panels.map((p) => {
      const physicalIdx = physicalOrderMap.get(p.id) ?? 0;
      return {
        id: p.id, type: 'panel',
        x: cx + p.x * ppm, y: cy + p.z * ppm,
        width: PANEL_W_M * ppm, height: PANEL_H_M * ppm,
        rotation: p.azimuth, orientation: 'portrait',
        manufacturer: equipment.panelModel.split(' ')[0] || 'Waaree',
        model: equipment.panelModel, power: equipment.panelPower,
        tilt: p.tilt, stringNumber: Math.floor(physicalIdx / stringSize) + 1, roofId,
      };
    });
    useDesignStore.setState({ panels: mapped, saveStatus: 'unsaved' });
  }, [panels, equipment, roofId, roofDims, mpp, stringSize, physicalOrderMap]);

  // ── Sync 3D obstacles BACK to store (meters → canvas px) ──
  const firstObsSyncRef = useRef(true);
  useEffect(() => {
    if (firstObsSyncRef.current) { firstObsSyncRef.current = false; return; }
    if (!roofDims) return;
    const ppm = 1 / mpp;
    const { cx, cy } = roofDims;
    const mappedObs = obstacles.map(o => ({
      id: o.id, type: 'obstacle' as const,
      x: cx + o.x * ppm, y: cy + o.z * ppm,
      width: o.w * ppm, height: o.d * ppm,
      rotation: o.rotDeg, label: o.label,
    }));
    useDesignStore.setState({ obstacles: mappedObs, saveStatus: 'unsaved' });
  }, [obstacles, roofDims, mpp]);

  // ─────────────────────────────────────────────────────────────
  // ROTATED-LATTICE GRID
  // Panels sit on a lattice aligned to `angleRad`. Row pitch uses the
  // TILTED footprint (cos tilt) so rows pack like a real install.
  // Every panel gets azimuth = the lattice angle → whole block reads as
  // clean parallel rows, not a scatter.
  // ─────────────────────────────────────────────────────────────
  const buildLattice = useCallback((
    nRows: number, nCols: number, angleRad: number, tilt: number,
    center: { x: number; z: number }, idPrefix: string,
  ): Panel3D[] => {
    const colPitch = PANEL_W_M + COL_GAP;                       // along the row
    const rowFootprint = PANEL_H_M * Math.cos(tilt * Math.PI / 180);
    const rowPitch = rowFootprint + rowGapM;                    // row to row
    const azimuthRaw = ((angleRad * 180 / Math.PI) + 360) % 360; // width aligns with row direction, given the corrected (180-az) rendering transform
    const azimuth = preferEquatorFacing(azimuthRaw, lat); // pick whichever of the two valid facings points toward the equator

    const out: Panel3D[] = [];
    const x0 = -(nCols - 1) / 2 * colPitch;
    const z0 = -(nRows - 1) / 2 * rowPitch;
    for (let r = 0; r < nRows; r++) {
      for (let c = 0; c < nCols; c++) {
        // lattice position (unrotated), then rotate about origin, then translate to center
        const lx = x0 + c * colPitch;
        const lz = z0 + r * rowPitch;
        const rp = rotatePt(lx, lz, angleRad);
        out.push({
          id: `${idPrefix}-${r}-${c}`,
          x: center.x + rp.x, z: center.z + rp.z,
          tilt, azimuth,
        });
      }
    }
    return out;
  }, [rowGapM, lat]);

  const generateGrid = useCallback(() => {
    if (!roofDims || roofPolyMeters.length < 3) return;
    const angle = forceTrueSouth ? 0 : dominantAngle(roofPolyMeters);
    const existingGrids = Math.floor(panelsRef.current.length / Math.max(rows * cols, 1));
    const nudge = existingGrids * 0.5;
    const center = { x: nudge, z: nudge };
    const candidates = buildLattice(rows, cols, angle, globalTilt, center, `p-${Date.now()}-${existingGrids}`);

    // Same validation Auto-Fill and Zone-Fill already use: stay inside the
    // roof, avoid marked obstacles, and never sit on top of an existing panel.
    // Without this, a second "Add Grid" click after an Auto-Fill/Zone-Fill
    // would drop a fresh grid right on top of what's already there — the
    // "braided rows" look.
    const rowFootprint = PANEL_H_M * Math.cos(globalTilt * Math.PI / 180);
    const halfW = PANEL_W_M / 2, halfZ = rowFootprint / 2;
    const clearance = 0.15;
    const valid: Panel3D[] = [];
    let skippedOffRoof = 0, skippedOverlap = 0;

    candidates.forEach(p => {
      const aziRad = p.azimuth * Math.PI / 180;
      const corners = ([[-halfW, -halfZ], [halfW, -halfZ], [-halfW, halfZ], [halfW, halfZ]] as [number, number][])
        .map(([lx, lz]) => rotatePt(lx, lz, aziRad))
        .map(rel => ({ x: p.x + rel.x, z: p.z + rel.z }));

      const insideRoof = corners.every(c => pointInPoly(c.x, c.z, roofPolyMeters));
      if (!insideRoof) { skippedOffRoof++; return; }

      const blockedByObstacle = obstacles.length > 0 && (
        anyObstacleBlocks(p.x, p.z, obstacles, clearance) ||
        corners.some(c => anyObstacleBlocks(c.x, c.z, obstacles, clearance))
      );
      if (blockedByObstacle) { skippedOffRoof++; return; }

      const overlapsExisting = panelsRef.current.some(ep => Math.hypot(ep.x - p.x, ep.z - p.z) < Math.min(PANEL_W_M, rowFootprint) * 0.6);
      if (overlapsExisting) { skippedOverlap++; return; }

      valid.push(p);
    });

    if (valid.length === 0) {
      alert('No room for this grid here — it would fall off the roof, hit an obstacle, or overlap existing panels. Try Move-ing existing panels first, or use Zone Fill to target empty space directly.');
      return;
    }
    if (skippedOffRoof > 0 || skippedOverlap > 0) {
      alert(`Placed ${valid.length} of ${rows * cols} panels — ${skippedOffRoof + skippedOverlap} were skipped (off-roof, an obstacle, or overlapping an existing panel).`);
    }

    setPanels(prev => [...prev, ...valid]);
    setSelectedIds(valid.map(p => p.id));
  }, [rows, cols, globalTilt, roofDims, roofPolyMeters, buildLattice, obstacles, forceTrueSouth]);

  // ─────────────────────────────────────────────────────────────
  // AUTO-FILL — lay continuous rows along the building's long edge,
  // wall-to-wall inside the polygon (real-installation style).
  // ─────────────────────────────────────────────────────────────
  // Pure computation — no state reads/writes — so both the button and the
  // "Perfect Align" one-click can call it and set state exactly once, with
  // no async gap where an old panel could survive a rebuild.
  const computeWholeRoofFill = useCallback((effTargetKw: number): Panel3D[] => {
    if (!roofDims || roofPolyMeters.length < 3) return [];
    const panelsNeeded = Math.ceil((effTargetKw * 1000) / PANEL_POWER);

    const colPitch = PANEL_W_M + COL_GAP;
    const rowFootprint = PANEL_H_M * Math.cos(globalTilt * Math.PI / 180);
    const rowPitch = rowFootprint + rowGapM;

    // Normally rows align to the roof's longest edge for the tightest fit.
    // With forceTrueSouth on, rows run due East-West instead (theta=0),
    // trading some corner-fitting efficiency for guaranteed south orientation.
    const theta = forceTrueSouth ? 0 : dominantAngle(roofPolyMeters);
    const aligned = roofPolyMeters.map(p => rotatePt(p.x, p.z, -theta));
    const xs = aligned.map(p => p.x), zs = aligned.map(p => p.z);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minZ = Math.min(...zs), maxZ = Math.max(...zs);

    const setback = 0.5;
    const usableMinX = minX + setback, usableMaxX = maxX - setback;
    const usableMinZ = minZ + setback, usableMaxZ = maxZ - setback;

    const nCols = Math.floor((usableMaxX - usableMinX + COL_GAP) / colPitch);
    const nRows = Math.floor((usableMaxZ - usableMinZ + rowGapM) / rowPitch);
    if (nCols < 1 || nRows < 1) return [];

    const blockW = nCols * colPitch - COL_GAP;
    const blockH = nRows * rowPitch - rowGapM;
    const startX = usableMinX + ((usableMaxX - usableMinX) - blockW) / 2 + PANEL_W_M / 2;
    const startZ = usableMinZ + ((usableMaxZ - usableMinZ) - blockH) / 2 + rowFootprint / 2;

    const azimuthRaw = ((theta * 180 / Math.PI) + 360) % 360; // see buildLattice comment for why not -theta
    const azimuth = preferEquatorFacing(azimuthRaw, lat);
    const placed: Panel3D[] = [];
    for (let r = 0; r < nRows && placed.length < panelsNeeded; r++) {
      for (let c = 0; c < nCols && placed.length < panelsNeeded; c++) {
        const ax = startX + c * colPitch;
        const az = startZ + r * rowPitch;
        const halfW = PANEL_W_M / 2, halfZ = rowFootprint / 2;
        const cornersAligned: [number, number][] = [
          [ax - halfW, az - halfZ], [ax + halfW, az - halfZ],
          [ax - halfW, az + halfZ], [ax + halfW, az + halfZ],
        ];
        const allInsideRoof = cornersAligned.every(([cxp, czp]) => pointInPoly(cxp, czp, aligned));
        if (!allInsideRoof) continue;

        const cornersReal = cornersAligned.map(([cxp, czp]) => rotatePt(cxp, czp, theta));
        const centerReal = rotatePt(ax, az, theta);
        const clearance = 0.15;
        const blocked = obstacles.length > 0 && (
          anyObstacleBlocks(centerReal.x, centerReal.z, obstacles, clearance) ||
          cornersReal.some(p => anyObstacleBlocks(p.x, p.z, obstacles, clearance))
        );
        if (blocked) continue;

        placed.push({ id: `af-${r}-${c}-${Date.now()}`, x: centerReal.x, z: centerReal.z, tilt: globalTilt, azimuth });
      }
    }
    return placed;
  }, [roofDims, roofPolyMeters, globalTilt, obstacles, rowGapM, lat, forceTrueSouth]);

  const autoFillToTarget = useCallback((overrideKw?: number) => {
    const effTargetKw = overrideKw ?? targetKw;
    const panelsNeeded = Math.ceil((effTargetKw * 1000) / PANEL_POWER);
    const placed = computeWholeRoofFill(effTargetKw);
    if (placed.length < panelsNeeded) {
      alert(`Roof fits ${placed.length} panels (${((placed.length * PANEL_POWER) / 1000).toFixed(1)} kW max, obstacles avoided). Target was ${panelsNeeded} panels for ${effTargetKw} kW.`);
    }
    setPanels(placed);
    setSelectedIds([]);
  }, [computeWholeRoofFill, targetKw]);

  // Safety net: after a manual Rotate or Move, remove any panel whose center
  // ended up outside the roof edge (this is what causes the "overhang" look —
  // manual rotation doesn't re-check the boundary the way Auto-Fill does).
  const pruneOutOfBoundsPanels = useCallback(() => {
    if (roofPolyMeters.length < 3) return;
    setPanels(prev => {
      const kept = prev.filter(p => pointInPoly(p.x, p.z, roofPolyMeters));
      const removedCount = prev.length - kept.length;
      if (removedCount > 0) {
        setTimeout(() => alert(`${removedCount} panel(s) ended up past the roof edge after that change and were removed. Tip: use "🧭 Perfect Align" instead of manual rotation to avoid this.`), 0);
      }
      return kept;
    });
  }, [roofPolyMeters]);

  // ONE-CLICK FIX for the "manually rotating makes it look weird" problem:
  // regenerate the whole layout at the SAME panel count, freshly aligned and
  // bounded, in a SINGLE setPanels call — no clear-then-refill race that
  // could leave a stray old panel behind.
  const alignAllToBuilding = useCallback(() => {
    if (panels.length === 0) return;
    const currentKw = Math.max(0.5, (panels.length * PANEL_POWER) / 1000);
    const placed = computeWholeRoofFill(currentKw);
    setPanels(placed);
    setSelectedIds([]);
  }, [panels.length, computeWholeRoofFill]);

  // ─────────────────────────────────────────────────────────────
  // CLIENT VIEW EXPORT — captures whatever angle the vendor has orbited to
  // (rather than guessing an "optimal" angle, which is subjective), composites
  // a caption bar with client name / address / system size onto it, and
  // triggers a PNG download the vendor can drop straight into the quote PDF
  // or send over WhatsApp.
  // ─────────────────────────────────────────────────────────────
  const exportClientView = useCallback(() => {
    const renderer = rendererRef.current, scene = sceneRef.current, camera = cameraRef.current;
    if (!renderer || !scene || !camera) return;

    // Force one fresh render right before capture (preserveDrawingBuffer:true
    // on the renderer, set at creation, is what makes toDataURL work at all).
    renderer.render(scene, camera);
    const shotW = renderer.domElement.width, shotH = renderer.domElement.height;

    const canvas = document.createElement('canvas');
    canvas.width = shotW;
    canvas.height = shotH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(renderer.domElement, 0, 0, shotW, shotH);

    // Bottom caption band
    const bandH = Math.round(shotH * 0.16);
    const grad = ctx.createLinearGradient(0, shotH - bandH, 0, shotH);
    grad.addColorStop(0, 'rgba(15,23,42,0)');
    grad.addColorStop(0.4, 'rgba(15,23,42,0.78)');
    grad.addColorStop(1, 'rgba(15,23,42,0.88)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, shotH - bandH, shotW, bandH);

    const pad = Math.round(shotW * 0.025);
    const clientName = project.clientName?.trim() || 'Proposed Solar System';
    const address = project.address?.trim() && project.address !== 'Enter address...' ? project.address : '';

    ctx.fillStyle = '#ffffff';
    ctx.font = `700 ${Math.round(shotH * 0.032)}px Inter, system-ui, sans-serif`;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(clientName, pad, shotH - bandH * 0.52);

    if (address) {
      ctx.fillStyle = 'rgba(255,255,255,0.82)';
      ctx.font = `400 ${Math.round(shotH * 0.02)}px Inter, system-ui, sans-serif`;
      ctx.fillText(address, pad, shotH - bandH * 0.30);
    }

    const localKwp = (panels.length * PANEL_POWER) / 1000;
    const statLine = `${localKwp.toFixed(2)} kWp  ·  ${panels.length} panels  ·  ~${(localKwp * 1332 / 1000).toFixed(1)} MWh/yr`;
    ctx.fillStyle = '#93C5FD';
    ctx.font = `600 ${Math.round(shotH * 0.024)}px Inter, system-ui, sans-serif`;
    ctx.textAlign = 'right';
    ctx.fillText(statLine, shotW - pad, shotH - bandH * 0.40);
    ctx.textAlign = 'left';

    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const safeName = clientName.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '') || 'client';
      a.href = url;
      a.download = `${safeName}-solar-design.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    }, 'image/png');
  }, [project.clientName, project.address, panels.length]);

  // Same integration as the 2D Statistics panel's "Generate Quote" button —
  // duplicated here since finishing the design in 3D is often the natural
  // moment to jump straight to the quote, without going back to 2D first.
  const generateQuote = useCallback(() => {
    if (panels.length === 0) return;
    const localKwp = (panels.length * PANEL_POWER) / 1000;
    const params = new URLSearchParams({
      name: project.clientName && project.clientName !== 'New Client' ? project.clientName : '',
      address: project.address && project.address !== 'Enter address...' ? project.address : '',
      system_size: localKwp.toFixed(2),
      panel_count: String(panels.length),
      roof_area: roofAreaM2.toFixed(1),
      yearly_units: String(Math.round(localKwp * 1332)),
      monthly_units: String(Math.round(localKwp * 1332 / 12)),
    });
    // Hard navigation, not router.push — see page.tsx's generateQuote for why
    window.location.href = `/quote?${params.toString()}`;
  }, [panels.length, project.clientName, project.address, roofAreaM2, router]);

  // ─────────────────────────────────────────────────────────────
  // SHADING ANALYSIS — for each panel, sample the sun's position across a
  // representative spread of the year (4 months × several daytime hours),
  // and raycast from the panel toward the sun. If ANY other panel, marked
  // obstacle, or the building's own parapet blocks that ray, this panel is
  // "shaded" for that sample. The fraction of samples shaded becomes a rough
  // per-panel shading estimate — genuinely useful for spotting problem
  // panels/rows, though it's a sampled approximation (20 time-of-year
  // samples), not a full irradiance-weighted simulation like PVsyst/PVGIS.
  // ─────────────────────────────────────────────────────────────
  const runShadingAnalysis = useCallback(() => {
    const scene = sceneRef.current;
    const pg = panelMeshGroup.current;
    const og = obstacleMeshGroup.current;
    if (!scene || !pg || panels.length === 0) return;
    setRunningShading(true);

    // Defer to next tick so the "Running…" state actually paints before the
    // (synchronous, potentially chunky) raycasting work blocks the main thread.
    setTimeout(() => {
      const buildingObstructions: THREE.Object3D[] = [];
      scene.traverse(obj => { if (obj.userData.isBuildingMass) buildingObstructions.push(obj); });
      const obstacleObstructions = og ? og.children : [];

      const sampleMonths = [1, 4, 7, 10]; // Jan, Apr, Jul, Oct — spread across the year
      const sampleHours = [8, 10, 12, 14, 16];
      const raycaster = new THREE.Raycaster();
      const results: Record<string, number> = {};

      panels.forEach(panel => {
        const tiltRad = panel.tilt * Math.PI / 180;
        // Roughly the panel's center height above the roof, accounting for tilt
        const centerY = wallHeightM + MOUNT_H + Math.sin(tiltRad) * PANEL_H_M / 2 + 0.15;
        const origin = new THREE.Vector3(panel.x, centerY, panel.z);

        // Every OTHER panel's assembly is a valid obstruction; a panel can't
        // shade itself, so exclude meshes tagged with this panel's own id.
        const otherPanelMeshes = pg.children.filter(child => {
          let hasThisId = false;
          child.traverse(c => { if (c.userData.panelId === panel.id) hasThisId = true; });
          return !hasThisId;
        });
        const candidates = [...otherPanelMeshes, ...obstacleObstructions, ...buildingObstructions];

        let daytimeSamples = 0, shadedSamples = 0;
        sampleMonths.forEach(month => {
          const doy = Math.floor((month - 1) * 30.4) + 15;
          sampleHours.forEach(hour => {
            const { azimuth, elevation } = sunPosition(lat, hour, doy);
            if (elevation <= 2) return; // sun too low to matter / below horizon
            daytimeSamples++;
            const azR = azimuth * Math.PI / 180, elR = elevation * Math.PI / 180;
            const dir = new THREE.Vector3(
              Math.cos(elR) * Math.sin(azR),
              Math.sin(elR),
              -Math.cos(elR) * Math.cos(azR),
            ).normalize();
            raycaster.set(origin, dir);
            raycaster.far = 100;
            // Same-row panels sit only 2cm apart — without a minimum hit
            // distance, the ray toward the sun grazes that immediate
            // neighbor's edge at nearly every angle and registers as a false
            // "shaded" hit every time, which is what produced the impossible
            // 100%-shaded-on-every-panel result. Coplanar same-row panels
            // can never actually shade each other; real inter-row shading
            // happens several meters away, so this threshold safely clears
            // same-row geometry while still catching genuine shading.
            raycaster.near = 1.5;
            const hits = raycaster.intersectObjects(candidates, true);
            if (hits.length > 0) shadedSamples++;
          });
        });
        results[panel.id] = daytimeSamples > 0 ? shadedSamples / daytimeSamples : 0;
      });

      setShadingResults(results);
      setRunningShading(false);
    }, 30);
  }, [panels, lat, wallHeightM]);

  // Derived summary from the last analysis run
  const shadingSummary = (() => {
    if (!shadingResults) return null;
    const entries = Object.entries(shadingResults);
    const shadedPanels = entries.filter(([, frac]) => frac > 0.1); // >10% of sampled daytime hours
    const avgLossAcrossShaded = shadedPanels.length > 0
      ? shadedPanels.reduce((a, [, f]) => a + f, 0) / shadedPanels.length
      : 0;
    // Rough annual energy loss estimate: affected panels' kWp × their average
    // shaded fraction × the same generation constant used elsewhere (1332 kWh/kWp/yr)
    const estLossKwh = shadedPanels.length * (PANEL_POWER / 1000) * avgLossAcrossShaded * 1332;
    return { totalPanels: entries.length, shadedCount: shadedPanels.length, estLossKwh, avgLossAcrossShaded };
  })();

  // ─────────────────────────────────────────────────────────────
  // ZONE FILL (Solar Ladder-style): fill only the rectangle the user
  // dragged on the roof. Rows still align to the building's dominant edge,
  // but candidates are also bounded by the zone box, and — unlike whole-roof
  // Auto-Fill — this APPENDS to existing panels instead of replacing them,
  // so different areas of a large roof can be filled at different densities.
  // ─────────────────────────────────────────────────────────────
  const fillZone = useCallback(() => {
    if (!roofDims || roofPolyMeters.length < 3 || !zoneRect) return;
    const zMinX = Math.min(zoneRect.x1, zoneRect.x2), zMaxX = Math.max(zoneRect.x1, zoneRect.x2);
    const zMinZ = Math.min(zoneRect.z1, zoneRect.z2), zMaxZ = Math.max(zoneRect.z1, zoneRect.z2);

    const panelsNeeded = Math.ceil((zoneTargetKw * 1000) / PANEL_POWER);
    const sx = PANEL_W_M + 0.15;
    const rowFootprint = PANEL_H_M * Math.cos(globalTilt * Math.PI / 180);
    const sz = rowFootprint + rowGapM;

    const theta = forceTrueSouth ? 0 : dominantAngle(roofPolyMeters); // see computeWholeRoofFill comment
    const aligned = roofPolyMeters.map(p => rotatePt(p.x, p.z, -theta));
    const xs = aligned.map(p => p.x), zs = aligned.map(p => p.z);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minZ = Math.min(...zs), maxZ = Math.max(...zs);
    const nCols = Math.ceil((maxX - minX) / sx);
    const nRows = Math.ceil((maxZ - minZ) / sz);
    const azimuthRaw = ((theta * 180 / Math.PI) + 360) % 360; // see buildLattice comment for why not -theta
    const azimuth = preferEquatorFacing(azimuthRaw, lat);
    const clearance = 0.15;

    const placed: Panel3D[] = [];
    outer:
    for (let r = 0; r < nRows; r++) {
      for (let c = 0; c < nCols; c++) {
        const ax = minX + PANEL_W_M / 2 + c * sx;
        const az = minZ + rowFootprint / 2 + r * sz;
        const halfW = PANEL_W_M / 2, halfZ = rowFootprint / 2;
        const cornersAligned: [number, number][] = [
          [ax - halfW, az - halfZ], [ax + halfW, az - halfZ],
          [ax - halfW, az + halfZ], [ax + halfW, az + halfZ],
        ];
        if (!cornersAligned.every(([cxp, czp]) => pointInPoly(cxp, czp, aligned))) continue;

        const cornersReal = cornersAligned.map(([cxp, czp]) => rotatePt(cxp, czp, theta));
        const centerReal = rotatePt(ax, az, theta);

        // Must fall inside the drawn zone box (world space)
        if (centerReal.x < zMinX || centerReal.x > zMaxX || centerReal.z < zMinZ || centerReal.z > zMaxZ) continue;

        const blockedByObstacle = obstacles.length > 0 && (
          anyObstacleBlocks(centerReal.x, centerReal.z, obstacles, clearance) ||
          cornersReal.some(p => anyObstacleBlocks(p.x, p.z, obstacles, clearance))
        );
        if (blockedByObstacle) continue;

        // Don't stack on top of panels already placed (e.g. from a previous zone)
        const tooClose = panelsRef.current.some(p => Math.hypot(p.x - centerReal.x, p.z - centerReal.z) < Math.min(PANEL_W_M, rowFootprint) * 0.6);
        if (tooClose) continue;

        placed.push({ id: `zf-${Date.now()}-${r}-${c}`, x: centerReal.x, z: centerReal.z, tilt: globalTilt, azimuth });
        if (placed.length >= panelsNeeded) break outer;
      }
    }

    if (placed.length < panelsNeeded) {
      alert(`This area fits ${placed.length} panels (${((placed.length * PANEL_POWER) / 1000).toFixed(1)} kW max). Target was ${panelsNeeded} panels for ${zoneTargetKw} kW.`);
    }
    setPanels(prev => [...prev, ...placed]);
  }, [roofDims, roofPolyMeters, zoneRect, zoneTargetKw, globalTilt, obstacles, rowGapM, lat, forceTrueSouth]);

  const clearZone = useCallback(() => setZoneRect(null), []);

  // ── Tilt: update value directly. Azimuth: RIGIDLY ROTATE the selected
  //    array about its centroid so rows stay intact (no shearing). ──
  // Rotate Array uses a SNAPSHOT of the selection's original positions/azimuths,
  // captured once at drag-start. Every slider tick rotates from that fixed
  // reference — not from the previous tick's already-rotated result — so
  // rapid-fire slider events can never compound drift into a sheared "fan".
  interface RotateSnapshot {
    sig: string; baselineValue: number;
    center: { x: number; z: number };
    snapshot: { id: string; x: number; z: number; azimuth: number }[];
  }
  const rotateSnapshotRef = useRef<RotateSnapshot | null>(null);

  const captureRotateSnapshot = useCallback(() => {
    const ids = selectedIdsRef.current;
    if (ids.length === 0) return;
    const sel = panelsRef.current.filter(p => ids.includes(p.id));
    if (sel.length === 0) return;
    rotateSnapshotRef.current = {
      sig: [...ids].sort().join(','),
      baselineValue: sel[0].azimuth,
      center: panelsCentroid(sel),
      snapshot: sel.map(p => ({ id: p.id, x: p.x, z: p.z, azimuth: p.azimuth })),
    };
  }, []);

  const updateSelected = useCallback((field: 'tilt' | 'azimuth', value: number) => {
    const ids = selectedIdsRef.current;
    if (ids.length === 0) return;

    if (field === 'tilt') {
      setPanels(prev => prev.map(p => ids.includes(p.id) ? { ...p, tilt: value } : p));
      return;
    }

    // AZIMUTH → rigidly rotate the whole selected block from its captured snapshot
    const sig = [...ids].sort().join(',');
    let snap = rotateSnapshotRef.current;
    if (!snap || snap.sig !== sig) {
      // Safety net if drag-start wasn't captured (e.g. arrow-key nudging the slider)
      const sel = panelsRef.current.filter(p => ids.includes(p.id));
      if (sel.length === 0) return;
      snap = {
        sig, baselineValue: sel[0].azimuth, center: panelsCentroid(sel),
        snapshot: sel.map(p => ({ id: p.id, x: p.x, z: p.z, azimuth: p.azimuth })),
      };
      rotateSnapshotRef.current = snap;
    }
    const delta = value - snap.baselineValue;
    const deltaRad = delta * Math.PI / 180;
    const { center, snapshot } = snap;
    setPanels(prev => prev.map(p => {
      const s = snapshot.find(x => x.id === p.id);
      if (!s) return p;
      const rel = rotatePt(s.x - center.x, s.z - center.z, deltaRad);
      const newAz = ((s.azimuth + delta) % 360 + 360) % 360;
      return { ...p, x: center.x + rel.x, z: center.z + rel.z, azimuth: newAz };
    }));
  }, []);

  const applyGlobalToAll = useCallback(() => {
    // Rotate every panel to the global azimuth about the overall centroid, set tilt.
    setPanels(prev => {
      if (prev.length === 0) return prev;
      const c = panelsCentroid(prev);
      const curAz = prev[0].azimuth;
      const deltaRad = (globalAzimuth - curAz) * Math.PI / 180;
      return prev.map(p => {
        const rel = rotatePt(p.x - c.x, p.z - c.z, deltaRad);
        return { ...p, x: c.x + rel.x, z: c.z + rel.z, tilt: globalTilt, azimuth: globalAzimuth };
      });
    });
  }, [globalTilt, globalAzimuth]);

  const clearPanels = useCallback(() => { setPanels([]); setSelectedIds([]); }, []);
  const deleteSelected = useCallback(() => {
    setPanels(prev => prev.filter(p => !selectedIds.includes(p.id)));
    setSelectedIds([]);
  }, [selectedIds]);
  const selectAll = useCallback(() => setSelectedIds(panels.map(p => p.id)), [panels]);

  // ── Build scene (1 unit = 1 meter) ──
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || !roofDims) return;
    // Guard against the "0×0 canvas" crash: if this container hasn't been
    // laid out yet (e.g. right when switching into 3D view, before the
    // absolutely-positioned overlay has taken on its parent's size), clientWidth/
    // Height can briefly be 0. Creating a WebGL canvas at 0×0 is what throws
    // "InvalidStateError: drawImage... width or height of 0" the moment
    // anything (browser devtools, a screenshot lib, even Three's own internals)
    // touches that canvas. A ResizeObserver below catches the real size once
    // layout settles, so this only affects the very first frame if at all.
    const W = Math.max(mount.clientWidth, 1), H = Math.max(mount.clientHeight, 1);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#aed4e8');
    scene.fog = new THREE.Fog('#B0D4E8', 100, 450);
    sceneRef.current = scene;

    const WALL_H = wallHeightM;
    const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 1500);
    const roofSpanM = Math.max(roofDims.widthM, roofDims.heightM, 8);
    const camDist = Math.max(18, roofSpanM * 1.6);
    camera.position.set(camDist * 0.5, camDist * 0.6, camDist * 0.9);
    camera.lookAt(0, WALL_H, 0);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 5;
    controls.maxDistance = Math.max(150, camDist * 3);
    controls.maxPolarAngle = Math.PI / 2.05;
    controls.target.set(0, WALL_H, 0);
    controls.update();
    controlsRef.current = controls;

    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const sun = new THREE.DirectionalLight(0xfff8e8, 1.5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    // Fit the shadow frustum to the ACTUAL building size (with headroom for
    // panel tilt + the sun swinging across the sky) instead of a fixed ±120m
    // box. A frustum much bigger than the scene wastes depth-buffer precision
    // and is the main cause of "shadow acne" — jagged self-shadowing noise
    // on tilted surfaces like our panels. Bias values below tune out the
    // remaining acne without introducing visible peter-panning (shadows
    // detaching from their casters).
    const shadowHalfSpan = Math.max(20, roofSpanM * 0.9);
    // IMPORTANT: `far` must safely exceed the sun's actual distance from the
    // scene (see the sun-position effect below, which uses this same
    // Math.max(120, ...) formula for light distance). The old value here
    // (roofSpanM * 3, often under 100) was routinely SMALLER than the sun's
    // minimum distance of 120 — meaning the shadow camera's far clipping
    // plane sat closer than the light itself, clipping the whole scene out
    // of the shadow map. That's what "shadows not working" was.
    const maxSunDist = Math.max(120, roofSpanM * 4, wallHeightM * 10);
    Object.assign(sun.shadow.camera, {
      near: 1, far: maxSunDist + shadowHalfSpan * 2,
      left: -shadowHalfSpan, right: shadowHalfSpan,
      top: shadowHalfSpan, bottom: -shadowHalfSpan,
    });
    sun.shadow.bias = -0.0015;
    sun.shadow.normalBias = 0.02;
    sun.shadow.camera.updateProjectionMatrix();
    scene.add(sun);
    sunRef.current = sun;

    const sunSphere = new THREE.Mesh(new THREE.SphereGeometry(2.5, 16, 16), new THREE.MeshBasicMaterial({ color: 0xffdd44 }));
    scene.add(sunSphere);
    sunSphereRef.current = sunSphere;

    const fill = new THREE.DirectionalLight(0xaaccff, 0.3);
    fill.position.set(-30, 20, -30);
    scene.add(fill);

    const normPoints = roofPolyMeters;

    const grass = new THREE.Mesh(new THREE.PlaneGeometry(500, 500), new THREE.MeshLambertMaterial({ color: '#6a9f4c' }));
    grass.rotation.x = -Math.PI / 2; grass.position.y = -0.05; grass.receiveShadow = true;
    scene.add(grass);

    // Environment (real meter sizes)
    const envGroup = new THREE.Group(); envGroup.name = 'environment';
    const roadDist = Math.max(45, roofSpanM * 2.2);
    const road = new THREE.Mesh(new THREE.PlaneGeometry(500, 8), new THREE.MeshLambertMaterial({ color: '#3a3a3a' }));
    road.rotation.x = -Math.PI / 2; road.position.set(0, 0.01, -roadDist); envGroup.add(road);
    for (let i = -240; i < 240; i += 12) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(4, 0.35), new THREE.MeshLambertMaterial({ color: '#f5d020' }));
      m.rotation.x = -Math.PI / 2; m.position.set(i, 0.02, -roadDist); envGroup.add(m);
    }
    const makeTree = (x: number, z: number, s = 1) => {
      const t = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18 * s, 0.25 * s, 3 * s), new THREE.MeshLambertMaterial({ color: '#5d4037' }));
      trunk.position.y = 1.5 * s; trunk.castShadow = true; t.add(trunk);
      const fm = new THREE.MeshLambertMaterial({ color: '#2e7d32' });
      [[0, 3.8, 0, 1.7], [-0.7, 3.1, 0.7, 1.2], [0.8, 3.3, -0.6, 1.1]].forEach(([fx, fy, fz, fr]) => {
        const f = new THREE.Mesh(new THREE.SphereGeometry(fr * s, 8, 8), fm); f.position.set(fx * s, fy * s, fz * s); f.castShadow = true; t.add(f);
      });
      t.position.set(x, 0, z); return t;
    };
    const treeR = Math.max(30, roofSpanM * 1.6);
    [[-treeR, -treeR * 0.9], [treeR, -treeR * 0.85], [-treeR * 1.1, treeR * 0.55], [treeR * 1.05, treeR * 0.65], [-treeR * 0.9, treeR]].forEach(([x, z]) => envGroup.add(makeTree(x, z, 0.9 + Math.random() * 0.5)));
    const makeCar = (x: number, z: number, color: number) => {
      const car = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(4.5, 1.4, 1.8), new THREE.MeshPhongMaterial({ color, shininess: 100 }));
      body.position.y = 0.8; body.castShadow = true; car.add(body);
      const top = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.0, 1.6), new THREE.MeshPhongMaterial({ color, shininess: 100 }));
      top.position.set(-0.2, 1.8, 0); car.add(top); car.position.set(x, 0, z); return car;
    };
    envGroup.add(makeCar(-20, -roadDist, 0xcc2222)); envGroup.add(makeCar(22, -roadDist + 1.5, 0x2244cc));
    const makeB = (x: number, z: number, w: number, d: number, h: number, c: number) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color: c }));
      b.position.set(x, h / 2, z); b.castShadow = true; b.receiveShadow = true; return b;
    };
    const nb = Math.max(35, roofSpanM * 1.8);
    envGroup.add(makeB(-nb, 0, 12, 15, 9, 0xc8b8a0));
    envGroup.add(makeB(nb + 4, 6, 15, 18, 12, 0xb0a890));
    envGroup.add(makeB(-nb * 0.95, nb, 14, 12, 7, 0xd0c0a8));
    scene.add(envGroup);

    // Main building — real-world colors: warm cream walls, weathered concrete
    // roof deck (matches an actual RCC terrace, not a painted/tiled surface)
    const shape = new THREE.Shape();
    normPoints.forEach((p, i) => { i === 0 ? shape.moveTo(p.x, p.z) : shape.lineTo(p.x, p.z); });
    shape.closePath();
    const bg = new THREE.ExtrudeGeometry(shape, { depth: WALL_H, bevelEnabled: false });
    bg.rotateX(Math.PI / 2); bg.translate(0, WALL_H, 0);
    const building = new THREE.Mesh(bg, new THREE.MeshLambertMaterial({ color: '#EDE4D3' }));
    building.castShadow = true; building.receiveShadow = true;
    scene.add(building);
    const rg = new THREE.ShapeGeometry(shape);
    rg.rotateX(Math.PI / 2); rg.translate(0, WALL_H, 0);
    const roofMesh = new THREE.Mesh(rg, new THREE.MeshLambertMaterial({ color: '#9E9488', side: THREE.DoubleSide }));
    roofMesh.receiveShadow = true; roofMesh.name = 'roof';
    scene.add(roofMesh);

    // Windows — one row per floor, spread up the FULL height of the building.
    // (Previously used a single fixed sill height capped near the ground —
    // fine for a short building, but a tall one just got one clump of
    // windows near the base instead of a row per storey.)
    if (WALL_H > 2.5) {
      const winMat = new THREE.MeshPhongMaterial({ color: '#A8D0E6', shininess: 90, opacity: 0.88, transparent: true, side: THREE.DoubleSide });
      const frameMat2 = new THREE.MeshLambertMaterial({ color: '#FAF7F0' });
      const winW = 1.1, winH = 1.3;
      const floorH = 3.2; // typical floor-to-floor height (m)
      const nFloors = Math.max(1, Math.round(WALL_H / floorH));
      const actualFloorH = WALL_H / nFloors; // spread evenly across the real height
      const sillYs: number[] = [];
      for (let f = 0; f < nFloors; f++) {
        const rowCenter = f * actualFloorH + actualFloorH * 0.45;
        if (rowCenter + winH / 2 < WALL_H - 0.3) sillYs.push(rowCenter); // stay clear of the parapet
      }

      for (let i = 0; i < normPoints.length; i++) {
        const a = normPoints[i], b = normPoints[(i + 1) % normPoints.length];
        const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz);
        if (len < winW * 2.2) continue; // too short a segment for a window to read well
        const wallAngle = -Math.atan2(dz, dx);
        const nWindows = Math.max(1, Math.floor(len / 3.2));
        const spacing = len / (nWindows + 1);
        for (let w = 1; w <= nWindows; w++) {
          const t = (spacing * w) / len;
          const wx = a.x + dx * t, wz = a.z + dz * t;
          sillYs.forEach(rowY => {
            const frame = new THREE.Mesh(new THREE.BoxGeometry(winW + 0.15, winH + 0.15, 0.08), frameMat2);
            const glass = new THREE.Mesh(new THREE.PlaneGeometry(winW, winH), winMat);
            glass.position.z = 0.05;
            const group = new THREE.Group();
            group.add(frame); group.add(glass);
            group.position.set(wx, rowY + winH / 2, wz);
            group.rotation.y = wallAngle;
            scene.add(group);
          });
        }
      }
    }

    const PH = 1.0;
    const pm = new THREE.MeshLambertMaterial({ color: '#D8CCB8' });
    for (let i = 0; i < normPoints.length; i++) {
      const a = normPoints[i], b = normPoints[(i + 1) % normPoints.length];
      const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz);
      const par = new THREE.Mesh(new THREE.BoxGeometry(len, PH, 0.3), pm);
      par.position.set((a.x + b.x) / 2, WALL_H + PH / 2, (a.z + b.z) / 2);
      par.rotation.y = -Math.atan2(dz, dx); par.castShadow = true;
      par.userData.isBuildingMass = true; // shading analysis raycasts against this
      scene.add(par);
    }
    const corner = normPoints.reduce((a, b) => (a.x + a.z < b.x + b.z ? a : b));
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.8, 8), new THREE.MeshLambertMaterial({ color: '#F97316' }));
    arrow.position.set(corner.x - 2, WALL_H + 2.5, corner.z - 2); scene.add(arrow);

    const pg = new THREE.Group(); pg.name = 'panels'; scene.add(pg);
    panelMeshGroup.current = pg;

    const og = new THREE.Group(); og.name = 'obstacles'; scene.add(og);
    obstacleMeshGroup.current = og;

    const zg = new THREE.Group(); zg.name = 'zone'; scene.add(zg);
    zoneMeshGroup.current = zg;

    let isDisposed = false;
    const animate = () => {
      if (isDisposed) return;
      frameRef.current = requestAnimationFrame(animate);
      controls.update();
      // Guard against rendering into a 0×0 or already-detached canvas — this
      // is what causes "drawImage... width or height of 0" when navigating
      // away right as an in-flight frame was mid-execution during teardown.
      if (renderer.domElement.width === 0 || renderer.domElement.height === 0) return;
      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      if (!mount) return;
      const w = mount.clientWidth, h = mount.clientHeight;
      if (w === 0 || h === 0) return; // still not laid out — nothing to size to yet
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);
    // Catches layout settling that isn't a window resize at all — e.g. this
    // container going from 0×0 to its real size right after switching into
    // 3D view — which is what the initial clamp above is protecting against.
    const ro = new ResizeObserver(onResize);
    ro.observe(mount);
    return () => {
      isDisposed = true; // stop any in-flight frame from rendering mid-teardown — must be first
      cancelAnimationFrame(frameRef.current);
      window.removeEventListener('resize', onResize);
      ro.disconnect();
      controls.dispose(); renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, [roofPoints, roofDims, roofPolyMeters, wallHeightM]);

  useEffect(() => {
    const env = sceneRef.current?.getObjectByName('environment');
    if (env) env.visible = showEnv;
  }, [showEnv]);

  useEffect(() => {
    const sun = sunRef.current, sphere = sunSphereRef.current, scene = sceneRef.current;
    if (!sun || !sphere || !scene || !roofDims) return;
    const doy = Math.floor((month - 1) * 30.4) + 15;
    const { azimuth, elevation } = sunPosition(lat, hour, doy);
    const azR = azimuth * Math.PI / 180, elR = elevation * Math.PI / 180;
    // Sun distance/height must scale with building height too — otherwise a
    // fixed-height sun appears to "sink" as the roof grows taller toward it.
    const d = Math.max(120, Math.max(roofDims.widthM, roofDims.heightM) * 4, wallHeightM * 10);
    const x = d * Math.cos(elR) * Math.sin(azR);
    const y = wallHeightM + d * Math.sin(elR); // measured from ROOF level, not ground
    const z = -d * Math.cos(elR) * Math.cos(azR);
    sun.position.set(x, Math.max(wallHeightM + 2, y), z);
    sphere.position.set(x, Math.max(wallHeightM + 2, y), z);
    sphere.visible = elevation > 0;
    sun.intensity = 0.3 + (elevation / 90) * 1.3;
    const t = Math.max(0, elevation / 60);
    scene.background = new THREE.Color().lerpColors(new THREE.Color('#FF9A56'), new THREE.Color('#aed4e8'), t);
  }, [hour, month, lat, roofDims, wallHeightM]);

  useEffect(() => {
    if (!animating) return;
    const iv = setInterval(() => setHour(h => { const n = h + 0.25; return n > 19 ? 6 : n; }), 100);
    return () => clearInterval(iv);
  }, [animating]);

  // Rebuild panel meshes (real Waaree 580 dims)
  useEffect(() => {
    const pg = panelMeshGroup.current;
    if (!pg || !roofDims) return;
    while (pg.children.length) pg.remove(pg.children[0]);
    const WALL_H = wallHeightM;
    const pw = PANEL_W_M, ph = PANEL_H_M;
    const frameMat = new THREE.MeshLambertMaterial({ color: '#2a2a2a' });
    const cellMat = new THREE.LineBasicMaterial({ color: '#3a6aaa' });
    const legMat = new THREE.MeshLambertMaterial({ color: '#999' });

    panels.forEach((panel, panelIdx) => {
      const tiltRad = panel.tilt * Math.PI / 180;
      // panel.azimuth is a standard compass bearing (0=N, 90=E, 180=S, 270=W —
      // the same convention dirFromAz() and sunPosition() use). Three.js's
      // rotation.y turns in the OPPOSITE rotational sense from that compass
      // convention, so feeding azimuth in directly (as this used to do)
      // silently faced panels the WRONG way — verified by checking against
      // sunPosition()'s own (x,z) formula, where az=180° (true south) must
      // produce +Z, which only holds if the mesh rotation uses (180-azimuth).
      const aziRad = (180 - panel.azimuth) * Math.PI / 180;
      const isSel = selectedIds.includes(panel.id);
      const physicalIdx = physicalOrderMap.get(panel.id) ?? panelIdx;
      const stringIdx = Math.floor(physicalIdx / Math.max(stringSize, 1));
      const stringColor = STRING_COLORS[stringIdx % STRING_COLORS.length];
      const shadeFrac = shadingResults?.[panel.id] ?? 0;
      const isShaded = highlightShading && shadeFrac > 0.1;
      const shadeColor = shadeFrac > 0.35 ? '#DC2626' : '#F59E0B'; // red = heavily shaded, amber = mild

      const assembly = new THREE.Group();
      assembly.position.set(panel.x, WALL_H, panel.z);
      assembly.rotation.y = aziRad;
      assembly.userData.panelId = panel.id;

      const pGroup = new THREE.Group();
      pGroup.rotation.x = -tiltRad;
      pGroup.position.y = MOUNT_H + Math.sin(tiltRad) * ph / 2;

      const frame = new THREE.Mesh(new THREE.BoxGeometry(pw + 0.05, 0.06, ph + 0.05),
        isSel ? new THREE.MeshLambertMaterial({ color: '#22C55E' }) : frameMat);
      pGroup.add(frame);
      const surf = new THREE.Mesh(new THREE.BoxGeometry(pw, 0.04, ph), new THREE.MeshPhongMaterial({
        color: isSel ? '#22C55E' : (isShaded ? shadeColor : (showStrings ? stringColor : '#1e3a6e')),
        emissive: isSel ? '#14532D' : '#0a1a3a',
        emissiveIntensity: 0.25, shininess: 100, specular: new THREE.Color('#5599cc'),
      }));
      surf.position.y = 0.05; surf.castShadow = true; surf.userData.panelId = panel.id;
      pGroup.add(surf);
      const g1 = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0.07, -ph / 2), new THREE.Vector3(0, 0.07, ph / 2)]);
      pGroup.add(new THREE.Line(g1, cellMat));
      for (let r = 1; r < 4; r++) {
        const lz = -ph / 2 + r * ph / 4;
        const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-pw / 2, 0.07, lz), new THREE.Vector3(pw / 2, 0.07, lz)]);
        pGroup.add(new THREE.Line(g, cellMat));
      }
      assembly.add(pGroup);
      const backH = MOUNT_H + Math.sin(tiltRad) * ph, frontH = MOUNT_H;
      ([[-pw / 2 + 0.08, frontH, ph / 2 - 0.08], [pw / 2 - 0.08, frontH, ph / 2 - 0.08], [-pw / 2 + 0.08, backH, -ph / 2 + 0.08], [pw / 2 - 0.08, backH, -ph / 2 + 0.08]] as [number, number, number][]).forEach(([lx, lh, lz]) => {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, lh), legMat);
        leg.position.set(lx, lh / 2, lz); leg.castShadow = true; assembly.add(leg);
      });
      pg.add(assembly);
    });
  }, [panels, roofDims, selectedIds, wallHeightM, stringSize, showStrings, shadingResults, highlightShading, physicalOrderMap]);

  // Rebuild obstacle meshes (skylights, AC units, water tanks, staircase
  // heads) — raised blocks sitting on the roof at their real footprint.
  useEffect(() => {
    const og = obstacleMeshGroup.current;
    if (!og || !roofDims) return;
    while (og.children.length) og.remove(og.children[0]);
    const WALL_H = wallHeightM;

    const heightFor = (label: string): { h: number; color: string } => {
      const l = label.toLowerCase();
      if (l.includes('water')) return { h: 1.4, color: '#7C93A6' };   // tall cylindrical tank
      if (l.includes('ac') || l.includes('hvac')) return { h: 0.7, color: '#94A3B8' };
      if (l.includes('sky')) return { h: 0.15, color: '#BFDBFE' };     // low, glass-like
      if (l.includes('stair')) return { h: 2.4, color: '#C8B8A0' };    // full stair headroom
      if (l.includes('vent')) return { h: 0.9, color: '#9CA3AF' };
      return { h: 0.8, color: '#A8A29E' };
    };

    obstacles.forEach(o => {
      const { h, color } = heightFor(o.label);
      const isWaterTank = o.label.toLowerCase().includes('water');
      const isSel = o.id === selectedObstacleId;
      const group = new THREE.Group();
      group.position.set(o.x, WALL_H, o.z);
      group.rotation.y = o.rotDeg * Math.PI / 180;
      group.userData.obstacleId = o.id;

      const mat = new THREE.MeshLambertMaterial({ color: isSel ? '#22C55E' : color });
      let mesh: THREE.Mesh;
      if (isWaterTank) {
        const r = Math.min(o.w, o.d) / 2;
        mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 16), mat);
      } else {
        mesh = new THREE.Mesh(new THREE.BoxGeometry(o.w, h, o.d), mat);
      }
      mesh.position.y = h / 2;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.obstacleId = o.id;
      group.add(mesh);

      // Thin outline so obstacles read clearly against the roof (green when selected)
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(mesh.geometry),
        new THREE.LineBasicMaterial({ color: isSel ? '#16A34A' : '#334155' })
      );
      edges.position.copy(mesh.position);
      edges.userData.obstacleId = o.id;
      group.add(edges);

      og.add(group);
    });
  }, [obstacles, roofDims, wallHeightM, selectedObstacleId]);

  // Render the zone rectangle (live while dragging, persists until Fill/Clear)
  useEffect(() => {
    const zg = zoneMeshGroup.current;
    if (!zg || !roofDims) return;
    while (zg.children.length) zg.remove(zg.children[0]);
    if (!zoneRect) return;
    const WALL_H = wallHeightM;
    const minX = Math.min(zoneRect.x1, zoneRect.x2), maxX = Math.max(zoneRect.x1, zoneRect.x2);
    const minZ = Math.min(zoneRect.z1, zoneRect.z2), maxZ = Math.max(zoneRect.z1, zoneRect.z2);
    const w = Math.max(maxX - minX, 0.05), d = Math.max(maxZ - minZ, 0.05);
    const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;

    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(w, d),
      new THREE.MeshBasicMaterial({ color: '#2563EB', transparent: true, opacity: 0.18, side: THREE.DoubleSide })
    );
    plane.rotation.x = -Math.PI / 2;
    plane.position.set(cx, WALL_H + 0.03, cz);
    zg.add(plane);

    const pts = [
      new THREE.Vector3(minX, WALL_H + 0.04, minZ), new THREE.Vector3(maxX, WALL_H + 0.04, minZ),
      new THREE.Vector3(maxX, WALL_H + 0.04, maxZ), new THREE.Vector3(minX, WALL_H + 0.04, maxZ),
      new THREE.Vector3(minX, WALL_H + 0.04, minZ),
    ];
    const outline = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: '#2563EB', linewidth: 2 })
    );
    zg.add(outline);
  }, [zoneRect, roofDims, wallHeightM]);

  // ── Interaction ──
  useEffect(() => {
    const renderer = rendererRef.current, camera = cameraRef.current, scene = sceneRef.current, controls = controlsRef.current;
    if (!renderer || !camera || !scene || !controls || !roofDims) return;
    const dom = renderer.domElement;
    const WALL_H = wallHeightM;

    let boxStart: { x: number; y: number } | null = null;
    let dragKind: 'panel' | 'obstacle' | null = null;
    let dragLast: { x: number; z: number } | null = null;
    let zoneDragStart: { x: number; z: number } | null = null;

    const getMouse = (e: MouseEvent) => {
      const rect = dom.getBoundingClientRect();
      mouse.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      return { sx: e.clientX - rect.left, sy: e.clientY - rect.top, rect };
    };

    const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -WALL_H);
    const dragTarget = new THREE.Vector3();
    const roofIntersect = (): { x: number; z: number } | null => {
      raycaster.current.setFromCamera(mouse.current, camera);
      const hit = raycaster.current.ray.intersectPlane(dragPlane, dragTarget);
      if (!hit) return null;
      return { x: dragTarget.x, z: dragTarget.z };
    };
    const panelUnderMouse = (): string | null => {
      raycaster.current.setFromCamera(mouse.current, camera);
      const pg = panelMeshGroup.current;
      if (!pg) return null;
      const hits = raycaster.current.intersectObjects(pg.children, true);
      if (hits.length === 0) return null;
      let o: THREE.Object3D | null = hits[0].object;
      while (o && !o.userData.panelId) o = o.parent;
      return o?.userData.panelId || null;
    };
    const obstacleUnderMouse = (): string | null => {
      raycaster.current.setFromCamera(mouse.current, camera);
      const og = obstacleMeshGroup.current;
      if (!og) return null;
      const hits = raycaster.current.intersectObjects(og.children, true);
      if (hits.length === 0) return null;
      let o: THREE.Object3D | null = hits[0].object;
      while (o && !o.userData.obstacleId) o = o.parent;
      return o?.userData.obstacleId || null;
    };

    const onDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      const m = modeRef.current;
      getMouse(e);
      if (m === 'orbit') return;

      if (m === 'zone') {
        controls.enabled = false;
        const start = roofIntersect();
        if (start) {
          zoneDragStart = start;
          setZoneRect({ x1: start.x, z1: start.z, x2: start.x, z2: start.z });
        }
        return;
      }

      if (m === 'drag') {
        const hitPanelId = panelUnderMouse();
        if (hitPanelId) {
          if (!selectedIdsRef.current.includes(hitPanelId)) setSelectedIds([hitPanelId]);
          setSelectedObstacleId(null);
          dragKind = 'panel'; controls.enabled = false; dragLast = roofIntersect();
          return;
        }
        const hitObsId = obstacleUnderMouse();
        if (hitObsId) {
          setSelectedObstacleId(hitObsId);
          setSelectedIds([]);
          dragKind = 'obstacle'; controls.enabled = false; dragLast = roofIntersect();
          return;
        }
        return;
      }
      if (m === 'select') {
        // A direct click on an obstacle selects just that obstacle instead
        // of starting a box-select (box-select remains panel-only).
        const hitObsId = obstacleUnderMouse();
        if (hitObsId) {
          setSelectedObstacleId(hitObsId);
          setSelectedIds([]);
          return;
        }
        setSelectedObstacleId(null);
        controls.enabled = false;
        const { sx, sy } = getMouse(e);
        boxStart = { x: sx, y: sy };
        setBoxSel({ x1: sx, y1: sy, x2: sx, y2: sy });
      }
    };
    const onMove = (e: MouseEvent) => {
      const m = modeRef.current;
      getMouse(e);
      if (m === 'drag' && dragKind && dragLast) {
        const cur = roofIntersect();
        if (cur) {
          const dx = cur.x - dragLast.x, dz = cur.z - dragLast.z;
          if (dragKind === 'panel') {
            const sel = selectedIdsRef.current;
            setPanels(prev => prev.map(p => sel.includes(p.id) ? { ...p, x: p.x + dx, z: p.z + dz } : p));
            rotateSnapshotRef.current = null; // positions moved — any cached rotation snapshot is now stale
          } else if (dragKind === 'obstacle') {
            const id = selectedObstacleIdRef.current;
            if (id) setObstacles(prev => prev.map(o => o.id === id ? { ...o, x: o.x + dx, z: o.z + dz } : o));
          }
          dragLast = cur;
        }
      }
      if (m === 'select' && boxStart) {
        const { sx, sy } = getMouse(e);
        setBoxSel({ x1: boxStart.x, y1: boxStart.y, x2: sx, y2: sy });
      }
      if (m === 'zone' && zoneDragStart) {
        const cur = roofIntersect();
        if (cur) setZoneRect({ x1: zoneDragStart.x, z1: zoneDragStart.z, x2: cur.x, z2: cur.z });
      }
    };
    const onUp = (e: MouseEvent) => {
      const m = modeRef.current;
      if (m === 'drag') { if (dragKind === 'panel') pruneOutOfBoundsPanels(); dragKind = null; dragLast = null; controls.enabled = true; }
      if (m === 'zone') { zoneDragStart = null; controls.enabled = true; }
      if (m === 'select' && boxStart) {
        const { rect } = getMouse(e);
        const x1 = Math.min(boxStart.x, e.clientX - rect.left);
        const x2 = Math.max(boxStart.x, e.clientX - rect.left);
        const y1 = Math.min(boxStart.y, e.clientY - rect.top);
        const y2 = Math.max(boxStart.y, e.clientY - rect.top);
        const sel: string[] = [];
        panelsRef.current.forEach(p => {
          const v = new THREE.Vector3(p.x, WALL_H + 0.5, p.z);
          v.project(camera);
          const px = (v.x * 0.5 + 0.5) * rect.width;
          const py = (-v.y * 0.5 + 0.5) * rect.height;
          if (px >= x1 && px <= x2 && py >= y1 && py <= y2) sel.push(p.id);
        });
        setSelectedIds(sel);
        boxStart = null; setBoxSel(null); controls.enabled = true;
      }
    };

    dom.addEventListener('mousedown', onDown);
    dom.addEventListener('mousemove', onMove);
    dom.addEventListener('mouseup', onUp);
    return () => {
      dom.removeEventListener('mousedown', onDown);
      dom.removeEventListener('mousemove', onMove);
      dom.removeEventListener('mouseup', onUp);
    };
  }, [roofDims, wallHeightM, pruneOutOfBoundsPanels]);

  useEffect(() => {
    if (controlsRef.current) controlsRef.current.enabled = (mode === 'orbit');
  }, [mode]);

  const kwp = (panels.length * PANEL_POWER) / 1000;
  // Panels are already generated in row-major order (row by row, left to
  // right) by Auto-Fill/Zone-Fill/Manual Grid, so array index order already
  // tracks physical adjacency reasonably well — good enough to group into
  // strings without needing a separate spatial clustering pass.
  const numStrings = Math.ceil(panels.length / Math.max(stringSize, 1));
  const stringBreakdown = Array.from({ length: numStrings }, (_, i) => {
    const count = Math.min(stringSize, panels.length - i * stringSize);
    return { string: i + 1, count, kwp: (count * PANEL_POWER) / 1000, color: STRING_COLORS[i % STRING_COLORS.length] };
  });
  const selCount = selectedIds.length;
  const selPanel = selCount === 1 ? panels.find(p => p.id === selectedIds[0]) : null;
  // For a multi-select, show the array's shared azimuth (first selected) so the slider drives rigid rotation
  const selAz = selCount > 0 ? (panels.find(p => selectedIds.includes(p.id))?.azimuth ?? globalAzimuth) : globalAzimuth;
  const selTilt = selPanel ? selPanel.tilt : (selCount > 0 ? (panels.find(p => selectedIds.includes(p.id))?.tilt ?? globalTilt) : globalTilt);
  const selectedObstacle = selectedObstacleId ? obstacles.find(o => o.id === selectedObstacleId) ?? null : null;
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // Live, numeric verification instead of eyeballing shadows in a screenshot —
  // the decorative cone marker doesn't actually indicate true north, so this
  // is the only reliable way to confirm which way panels really face.
  const liveDoy = Math.floor((month - 1) * 30.4) + 15;
  const liveSun = sunPosition(lat, hour, liveDoy);
  const panelFacingAz = panels[0]?.azimuth ?? globalAzimuth;

  if (!roofDims) {
    return (
      <div style={{ position: 'absolute', inset: 0, zIndex: 10, background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 32, opacity: 0.3 }}>⬡</div>
        <p style={{ color: TX.muted, fontSize: 13 }}>Draw a roof in 2D mode first, then open 3D</p>
        <button onClick={onClose} style={{ padding: '6px 16px', borderRadius: 6, border: 'none', background: TX.blue, color: '#fff', fontSize: 12, cursor: 'pointer' }}>← Back to 2D</button>
      </div>
    );
  }

  const btn = (bg: string, color = '#fff'): React.CSSProperties => ({ width: '100%', padding: '9px 0', borderRadius: 8, border: 'none', background: bg, color, fontSize: 12, fontWeight: 600, cursor: 'pointer' });

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 10, background: '#F1F5F9', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', background: '#FFFFFF', borderBottom: '1px solid #E2E8F0', flexShrink: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#1E293B' }}>{readOnly ? (project.clientName && project.clientName !== 'New Client' ? project.clientName : 'Solar Design') : '3D Solar Designer'}</span>
        <span style={{ fontSize: 11, color: '#64748B', background: '#F1F5F9', border: '1px solid #E2E8F0', borderRadius: 4, padding: '2px 8px' }}>{panels.length} panels</span>
        <span style={{ fontSize: 11, color: '#2563EB', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 4, padding: '2px 8px' }}>{kwp.toFixed(2)} kWp</span>
        {!readOnly && <span style={{ fontSize: 11, color: '#64748B', background: '#F1F5F9', border: '1px solid #E2E8F0', borderRadius: 4, padding: '2px 8px' }}>Roof {roofDims.widthM.toFixed(1)} × {roofDims.heightM.toFixed(1)} m</span>}
        {panels.length > 0 && (
          <span style={{ fontSize: 11, color: '#1E3A5F', background: '#EEF2FF', border: '1px solid #C7D2FE', borderRadius: 4, padding: '2px 8px' }} title="Which way the panels physically face, computed from the design — not a guess from shadows">
            🧭 Panels face {Math.round(panelFacingAz)}° ({dirFromAz(panelFacingAz)})
          </span>
        )}
        <span style={{ fontSize: 11, color: '#D97706', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 4, padding: '2px 8px' }} title="Live sun position for the current hour/month sliders below">
          ☀ Sun {Math.round(liveSun.azimuth)}° ({dirFromAz(liveSun.azimuth)}) · {Math.round(liveSun.elevation)}° up
        </span>
        {!readOnly && obstacles.length > 0 && (
          <span style={{ fontSize: 11, color: '#C2410C', background: '#FFF7ED', border: '1px solid #FDBA74', borderRadius: 4, padding: '2px 8px' }}>⛔ {obstacles.length} obstacle{obstacles.length > 1 ? 's' : ''} avoided</span>
        )}
        {!readOnly && selCount > 0 && <span style={{ fontSize: 11, color: '#1E3A5F', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 4, padding: '2px 8px' }}>{selCount} selected</span>}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          {readOnly ? (
            <>
              <button onClick={() => setShowEnv(s => !s)} style={{ padding: '5px 12px', borderRadius: 5, border: '1px solid #E2E8F0', background: showEnv ? '#2563EB' : '#F8FAFC', color: showEnv ? '#fff' : '#64748B', fontSize: 11, cursor: 'pointer' }}>{showEnv ? '🌳 Env ON' : '🌳 Env OFF'}</button>
              <span style={{ fontSize: 10, color: '#94A3B8' }}>Drag to orbit · scroll to zoom</span>
            </>
          ) : (
            <>
              <button
                onClick={() => setAdvancedMode(a => !a)}
                title={advancedMode ? 'Switch to the simplified view' : 'Show manual grid, per-panel editing, sun path & more'}
                style={{ padding: '5px 12px', borderRadius: 5, border: '1px solid #E2E8F0', background: advancedMode ? '#1E293B' : '#F8FAFC', color: advancedMode ? '#fff' : '#475569', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
              >
                {advancedMode ? '⚙ Advanced' : '⚡ Simple'}
              </button>
              <button onClick={() => setShowEnv(s => !s)} style={{ padding: '5px 12px', borderRadius: 5, border: '1px solid #E2E8F0', background: showEnv ? '#2563EB' : '#F8FAFC', color: showEnv ? '#fff' : '#64748B', fontSize: 11, cursor: 'pointer' }}>{showEnv ? '🌳 Env ON' : '🌳 Env OFF'}</button>
              <div style={{ display: 'flex', gap: 3, background: '#F1F5F9', padding: 3, borderRadius: 8, border: '1px solid #E2E8F0' }}>
                {([['orbit', '🔄 Orbit'], ['zone', '📐 Zone'], ['select', '⬚ Select'], ['drag', '✋ Move']] as const).map(([m, label]) => (
                  <button key={m} onClick={() => setMode(m)} style={{ padding: '5px 12px', borderRadius: 6, border: 'none', background: mode === m ? TX.navy : 'transparent', color: mode === m ? '#fff' : '#64748B', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>{label}</button>
                ))}
              </div>
              <button onClick={onClose} style={{ padding: '5px 14px', borderRadius: 5, border: 'none', background: '#2563EB', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>← Back to 2D</button>
            </>
          )}
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <div ref={mountRef} style={{ flex: 1, position: 'relative', cursor: mode === 'drag' ? 'move' : (mode === 'select' || mode === 'zone') ? 'crosshair' : 'grab' }}>
          {boxSel && (
            <div style={{ position: 'absolute', border: '1.5px solid #2563EB', background: 'rgba(37,99,235,.1)', left: Math.min(boxSel.x1, boxSel.x2), top: Math.min(boxSel.y1, boxSel.y2), width: Math.abs(boxSel.x2 - boxSel.x1), height: Math.abs(boxSel.y2 - boxSel.y1), pointerEvents: 'none', borderRadius: 2 }} />
          )}
        </div>

        <div style={{ width: 280, background: '#FFFFFF', borderLeft: '1px solid #E2E8F0', padding: 16, overflowY: 'auto', flexShrink: 0 }}>
          {readOnly ? (
            <>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#1E3A5F', marginBottom: 4 }}>
                {project.clientName && project.clientName !== 'New Client' ? project.clientName : 'Proposed Solar System'}
              </div>
              {project.address && project.address !== 'Enter address...' && (
                <div style={{ fontSize: 11, color: '#64748B', marginBottom: 14 }}>{project.address}</div>
              )}
              <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 8, padding: 14, marginBottom: 16 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#1E3A5F', marginBottom: 6 }}>{kwp.toFixed(2)} kWp</div>
                <div style={{ fontSize: 11, color: '#475569', lineHeight: 1.6 }}>
                  {panels.length} panels<br/>
                  Facing {dirFromAz(panelFacingAz)}<br/>
                  Estimated ~{(kwp * 1332 / 1000).toFixed(1)} MWh/year
                </div>
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 12 }}>☀ See the Sun Move</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <button onClick={() => setAnimating(a => !a)} style={{ flex: 1, padding: '8px 0', borderRadius: 7, border: 'none', background: animating ? '#DC2626' : '#16A34A', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>{animating ? '⏸ Pause' : '▶ Play Day'}</button>
                <span style={{ fontSize: 13, color: '#1E3A5F', fontWeight: 700, fontFamily: 'monospace' }}>{Math.floor(hour)}:{String(Math.round((hour % 1) * 60)).padStart(2, '0')}</span>
              </div>
              <input type="range" min={6} max={19} step={0.25} value={hour} onChange={e => { setHour(Number(e.target.value)); setAnimating(false); }} style={{ width: '100%', accentColor: '#0EA5E9', marginBottom: 4 }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#94A3B8', marginBottom: 10 }}><span>6AM</span><span>Noon</span><span>7PM</span></div>
              <Slider label="Month" value={month} min={1} max={12} color="#0EA5E9" suffix={` ${monthNames[month - 1]}`} onChange={setMonth} />
              <div style={{ marginTop: 16, fontSize: 9.5, color: '#94A3B8', textAlign: 'center', lineHeight: 1.5 }}>
                Drag to orbit around the building · scroll to zoom · this is a live 3D model of your actual rooftop
              </div>
            </>
          ) : (
          <>
          {/* ── Always visible: the one thing every vendor needs ── */}
          <div style={{ fontSize: 11, fontWeight: 700, color: '#1E3A5F', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>⚡ Design My Roof</div>
          <div style={{ marginBottom: 8 }}>
            <label style={{ fontSize: 10, color: '#64748B', display: 'block', marginBottom: 4 }}>Target System Size (kW) — or set it high to fill the whole roof</label>
            <input type="number" min={1} max={5000} value={targetKw}
              onChange={e => setTargetKw(Math.max(1, Number(e.target.value)))}
              style={{ width: '100%', padding: '8px', background: '#F8FAFC', border: '1px solid #CBD5E1', borderRadius: 5, color: '#1E293B', fontSize: 14, fontWeight: 700, textAlign: 'center', boxSizing: 'border-box' }} />
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, padding: '8px 10px', background: forceTrueSouth ? '#EFF6FF' : '#F8FAFC', border: `1px solid ${forceTrueSouth ? '#BFDBFE' : '#E2E8F0'}`, borderRadius: 6, cursor: 'pointer' }}>
            <input type="checkbox" checked={forceTrueSouth} onChange={e => setForceTrueSouth(e.target.checked)} style={{ accentColor: '#2563EB' }} />
            <span style={{ fontSize: 11, color: '#1E3A5F', fontWeight: 600 }}>☀ Force true south</span>
          </label>
          <div style={{ fontSize: 9.5, color: '#94A3B8', marginBottom: 10, lineHeight: 1.4 }}>
            Off (default): rows align to the roof's longest edge for the tightest fit — usually south-facing, but not always, depending on the building's shape. On: rows always run due south, even if that means slightly less efficient use of odd corners. Re-run Design My Roof / Perfect Align after toggling.
          </div>

          <button onClick={() => autoFillToTarget()} style={{ ...btn('#1E3A5F'), marginBottom: 6, fontSize: 14, padding: '13px 0' }}>⚡ Design My Roof</button>
          <div style={{ fontSize: 10, color: '#94A3B8', marginBottom: panels.length > 0 ? 10 : 16, lineHeight: 1.4 }}>
            Panels face the optimal direction automatically and route around anything marked below — you don't need to set anything else.
          </div>

          {panels.length > 0 && (
            <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 8, padding: 12, marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#1E3A5F', marginBottom: 4 }}>✓ {panels.length} panels · {kwp.toFixed(2)} kWp</div>
              <div style={{ fontSize: 11, color: '#475569', lineHeight: 1.5, marginBottom: 10 }}>
                Estimated ~{(kwp * 1332 / 1000).toFixed(1)} MWh/year — roughly {Math.round(kwp * 1332 / 1200)} average Indian homes' worth of power.
              </div>
              <button onClick={alignAllToBuilding} style={{ ...btn('#1E3A5F'), fontSize: 11.5, marginBottom: 6 }}>🧭 Perfect Align (fix crossing/overhang)</button>
              <div style={{ fontSize: 9.5, color: '#64748B', marginBottom: 10, lineHeight: 1.4 }}>
                Rebuilds the same panel count freshly aligned to the roof edge — use this instead of manually rotating if things look crossed or hang past the edge.
              </div>
              <button onClick={exportClientView} style={{ ...btn('#2563EB'), fontSize: 11.5, marginBottom: 6 }}>📸 Export Client View</button>
              <div style={{ fontSize: 9.5, color: '#64748B', marginBottom: 10, lineHeight: 1.4 }}>
                Orbit to a good angle first, then export — saves a PNG with the client's name, address & system size captioned on it, ready for WhatsApp or the quote PDF.
              </div>
              <button onClick={generateQuote} style={{ ...btn('#16A34A'), fontSize: 11.5 }}>📄 Generate Quote</button>
              <div style={{ fontSize: 9.5, color: '#64748B', marginTop: 6, lineHeight: 1.4 }}>
                Opens the quote generator pre-filled with this system's size, panel count & estimated generation.
              </div>
            </div>
          )}

          {/* ── Always visible: fill just one area of the roof (Solar Ladder-style) ── */}
          <div style={{ fontSize: 11, fontWeight: 700, color: '#2563EB', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>📐 Fill a Specific Area</div>
          <div style={{ fontSize: 10, color: '#94A3B8', marginBottom: 8, lineHeight: 1.4 }}>
            Switch to <strong>📐 Zone</strong> above, then drag a box over just the section of roof you want — around a chimney, on one wing of an L-shaped building, whatever you like.
          </div>
          {zoneRect ? (
            <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 8, padding: 12, marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#1E3A5F', marginBottom: 8 }}>
                ● Area selected: {Math.abs(zoneRect.x2 - zoneRect.x1).toFixed(1)} × {Math.abs(zoneRect.z2 - zoneRect.z1).toFixed(1)} m
              </div>
              <label style={{ fontSize: 10, color: '#64748B', display: 'block', marginBottom: 4 }}>Panels for this area (kW)</label>
              <input type="number" min={0.5} max={500} step={0.5} value={zoneTargetKw}
                onChange={e => setZoneTargetKw(Math.max(0.5, Number(e.target.value)))}
                style={{ width: '100%', padding: '7px', background: '#F8FAFC', border: '1px solid #CBD5E1', borderRadius: 5, color: '#1E293B', fontSize: 13, fontWeight: 700, textAlign: 'center', boxSizing: 'border-box', marginBottom: 8 }} />
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={fillZone} style={{ ...btn('#2563EB'), fontSize: 12 }}>⚡ Fill This Area</button>
                <button onClick={clearZone} style={{ ...btn('#F8FAFC', '#64748B'), border: '1px solid #E2E8F0', flexShrink: 0, width: 'auto', padding: '9px 14px' }}>✕</button>
              </div>
            </div>
          ) : (
            <div style={{ background: '#F1F5F9', border: '1px solid #E2E8F0', borderRadius: 8, padding: 10, marginBottom: 16, fontSize: 10.5, color: '#64748B', textAlign: 'center', lineHeight: 1.5 }}>
              No area selected yet — drag on the roof in 📐 Zone mode to pick one.
            </div>
          )}

          {/* ── Always visible: obstacle marking, needed for accuracy by everyone ── */}
          <div style={{ fontSize: 11, fontWeight: 700, color: '#EA580C', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>⛔ Mark Roof Obstacles</div>
          <div style={{ fontSize: 10, color: '#94A3B8', marginBottom: 8, lineHeight: 1.4 }}>Tap what's actually on the roof — water tanks, AC units, staircases — so panels avoid them.</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 10 }}>
            {(['AC Unit', 'Water Tank', 'Skylight', 'Staircase', 'Vent'] as const).map(label => (
              <button key={label} onClick={() => addObstacleAtCenter(label)}
                style={{ padding: '7px 4px', borderRadius: 6, border: '1px solid #FDBA74', background: '#FFF7ED', color: '#9A3412', fontSize: 10.5, fontWeight: 600, cursor: 'pointer' }}>
                + {label}
              </button>
            ))}
          </div>
          {selectedObstacle ? (
            <div style={{ background: '#FFF7ED', border: '1px solid #FDBA74', borderRadius: 8, padding: 12, marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#C2410C', marginBottom: 10 }}>● {selectedObstacle.label} selected</div>
              <Slider label="Width" value={Number(selectedObstacle.w.toFixed(2))} min={0.3} max={5} color="#EA580C" suffix=" m" onChange={v => updateObstacle(selectedObstacle.id, { w: v })} />
              <Slider label="Depth" value={Number(selectedObstacle.d.toFixed(2))} min={0.3} max={5} color="#EA580C" suffix=" m" onChange={v => updateObstacle(selectedObstacle.id, { d: v })} />
              <Slider label="Rotation" value={Math.round(selectedObstacle.rotDeg)} min={0} max={360} color="#2563EB" suffix="°" onChange={v => updateObstacle(selectedObstacle.id, { rotDeg: v })} />
              <div style={{ fontSize: 10, color: '#9A3412', marginBottom: 8, lineHeight: 1.4 }}>Use <strong>✋ Move</strong> to drag it into position, then hit <strong>⚡ Design My Roof</strong> again.</div>
              <button onClick={() => deleteObstacle(selectedObstacle.id)} style={btn('#DC2626')}>🗑 Delete Obstacle</button>
            </div>
          ) : (
            <div style={{ background: '#F1F5F9', border: '1px solid #E2E8F0', borderRadius: 8, padding: 10, marginBottom: 16, fontSize: 10.5, color: '#64748B', textAlign: 'center', lineHeight: 1.5 }}>
              Tap a type above to place it, then <strong>✋ Move</strong> to position it or click it directly to select, resize & rotate.
            </div>
          )}

          {/* ── Advanced-only: manual grids, per-panel editing, sun path, height ── */}
          {advancedMode && (
            <>
              <div style={{ borderTop: '1px dashed #CBD5E1', margin: '4px 0 16px' }} />

              <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 12 }}>Manual Grid</div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 10, color: '#64748B', display: 'block', marginBottom: 4 }}>Rows</label>
                  <input type="number" min={1} max={50} value={rows} onChange={e => setRows(Math.max(1, Number(e.target.value)))} style={{ width: '100%', padding: '6px 8px', background: '#F8FAFC', border: '1px solid #CBD5E1', borderRadius: 5, color: '#1E293B', fontSize: 13, textAlign: 'center', boxSizing: 'border-box' }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 8, color: '#94A3B8' }}>×</div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 10, color: '#64748B', display: 'block', marginBottom: 4 }}>Cols</label>
                  <input type="number" min={1} max={50} value={cols} onChange={e => setCols(Math.max(1, Number(e.target.value)))} style={{ width: '100%', padding: '6px 8px', background: '#F8FAFC', border: '1px solid #CBD5E1', borderRadius: 5, color: '#1E293B', fontSize: 13, textAlign: 'center', boxSizing: 'border-box' }} />
                </div>
              </div>
              <div style={{ fontSize: 10, color: '#64748B', marginBottom: 8 }}>= {rows * cols} panels · {((rows * cols * PANEL_POWER) / 1000).toFixed(2)} kWp · aligned to roof</div>
              <button onClick={generateGrid} style={{ ...btn('#2563EB'), marginBottom: 6 }}>⊞ Add {rows}×{cols} Grid</button>
              <button onClick={clearPanels} style={{ ...btn('#F8FAFC', '#64748B'), border: '1px solid #E2E8F0', marginBottom: 16 }}>✕ Clear All</button>

              <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>Building Height</div>
              <Slider label="Height" value={wallHeightM} min={2} max={30} color="#0EA5E9" suffix="m" onChange={setWallHeightM} />
              <div style={{ height: 8 }} />

              <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>Row Spacing</div>
              <Slider label="Gap Between Rows" value={Number(rowGapM.toFixed(1))} min={0.3} max={3} color="#0EA5E9" suffix=" m" onChange={setRowGapM} />
              <div style={{ fontSize: 10, color: '#94A3B8', marginBottom: 10, lineHeight: 1.4 }}>
                Bigger gap = less chance one row's shadow falls on the row behind it, especially in winter when the sun sits lower. Smaller gap = more panels fit, but more shading risk. Re-run <strong>Design My Roof</strong> or <strong>Perfect Align</strong> after changing this.
              </div>
              <div style={{ height: 8 }} />

              <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>🔌 Electrical Strings</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 8 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 10, color: '#64748B', display: 'block', marginBottom: 4 }}>Panels per string</label>
                  <input type="number" min={1} max={30} value={stringSize}
                    onChange={e => setStringSize(Math.max(1, Number(e.target.value)))}
                    style={{ width: '100%', padding: '6px 8px', background: '#F8FAFC', border: '1px solid #CBD5E1', borderRadius: 5, color: '#1E293B', fontSize: 13, textAlign: 'center', boxSizing: 'border-box' }} />
                </div>
                <button onClick={() => setShowStrings(s => !s)} style={{ padding: '7px 12px', borderRadius: 6, border: `1px solid ${showStrings ? '#2563EB' : '#E2E8F0'}`, background: showStrings ? '#EFF6FF' : '#F8FAFC', color: showStrings ? '#1E3A5F' : '#64748B', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                  {showStrings ? '🎨 Colors On' : '⚪ Show Colors'}
                </button>
              </div>
              {panels.length > 0 ? (
                <div style={{ maxHeight: 160, overflowY: 'auto', marginBottom: 10 }}>
                  {stringBreakdown.map(s => (
                    <div key={s.string} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', borderRadius: 5, marginBottom: 3, background: '#F8FAFC' }}>
                      <div style={{ width: 10, height: 10, borderRadius: 3, background: s.color, flexShrink: 0 }} />
                      <span style={{ fontSize: 11, color: '#334155', fontWeight: 600 }}>String {s.string}</span>
                      <span style={{ fontSize: 10, color: '#94A3B8', marginLeft: 'auto' }}>{s.count} panels · {s.kwp.toFixed(2)} kWp</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: 10, color: '#94A3B8', marginBottom: 10 }}>No panels yet — design the roof first.</div>
              )}
              <div style={{ fontSize: 9.5, color: '#94A3B8', marginBottom: 10, lineHeight: 1.4 }}>
                Groups panels by real physical position — separate roof wings are clustered independently and never mixed into the same string, with panels ordered row-by-row, left to right within each cluster.
              </div>

              <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>☀ Shading Analysis</div>
              <button onClick={runShadingAnalysis} disabled={runningShading || panels.length === 0} style={{ ...btn(runningShading ? '#94A3B8' : '#1E3A5F'), marginBottom: 8, cursor: runningShading ? 'not-allowed' : 'pointer' }}>
                {runningShading ? '⟳ Checking every panel…' : '☀ Run Shading Analysis'}
              </button>
              <div style={{ fontSize: 9.5, color: '#94A3B8', marginBottom: 10, lineHeight: 1.4 }}>
                Checks each panel against neighboring panels, marked obstacles & the parapet across 20 sampled times of year — a real geometric check, not a guess. Re-run after moving panels or changing tilt/height.
              </div>

              {shadingSummary && (
                <div style={{ background: shadingSummary.shadedCount > 0 ? '#FFFBEB' : '#F0FDF4', border: `1px solid ${shadingSummary.shadedCount > 0 ? '#FDE68A' : '#86EFAC'}`, borderRadius: 8, padding: 12, marginBottom: 10 }}>
                  {shadingSummary.shadedCount > 0 ? (
                    <>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#92400E', marginBottom: 4 }}>⚠ {shadingSummary.shadedCount} of {shadingSummary.totalPanels} panels affected</div>
                      <div style={{ fontSize: 11, color: '#78350F', lineHeight: 1.5 }}>
                        Estimated annual loss: ~{shadingSummary.estLossKwh.toFixed(0)} kWh/year ({(shadingSummary.avgLossAcrossShaded * 100).toFixed(0)}% average loss on affected panels)
                      </div>
                    </>
                  ) : (
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#15803D' }}>✓ No meaningful shading detected on this layout</div>
                  )}
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, cursor: 'pointer' }}>
                    <input type="checkbox" checked={highlightShading} onChange={e => setHighlightShading(e.target.checked)} />
                    <span style={{ fontSize: 10.5, color: '#64748B' }}>Highlight shaded panels (red = heavy, amber = mild)</span>
                  </label>
                </div>
              )}

              <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>Selection</div>
              <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                <button onClick={selectAll} style={{ ...btn('#F1F5F9', '#475569'), border: '1px solid #E2E8F0', padding: '7px 0', fontSize: 11 }}>Select All</button>
                <button onClick={() => setSelectedIds([])} style={{ ...btn('#F1F5F9', '#475569'), border: '1px solid #E2E8F0', padding: '7px 0', fontSize: 11 }}>Deselect</button>
              </div>
              {selCount > 0 && (
                <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 8, padding: 12, marginBottom: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#1E3A5F', marginBottom: 10 }}>● {selCount} panel{selCount > 1 ? 's' : ''} selected</div>
                  <Slider label="Tilt" value={selTilt} min={0} max={45} color="#0EA5E9" suffix="°" onChange={v => updateSelected('tilt', v)} />
                  <Slider label="Rotate Array" value={Math.round(selAz)} min={0} max={360} color="#2563EB" suffix={`° ${dirFromAz(selAz)}`} onChange={v => updateSelected('azimuth', v)} onDragStart={captureRotateSnapshot} onDragEnd={pruneOutOfBoundsPanels} />
                  <div style={{ fontSize: 10, color: '#64748B', marginBottom: 8, lineHeight: 1.4 }}>Rotate spins the whole array to match the building angle — rows stay intact.</div>
                  <button onClick={deleteSelected} style={btn('#DC2626')}>🗑 Delete Selected</button>
                </div>
              )}
              {selCount === 0 && (
                <div style={{ background: '#F1F5F9', border: '1px solid #E2E8F0', borderRadius: 8, padding: 12, marginBottom: 14, fontSize: 11, color: '#64748B', textAlign: 'center', lineHeight: 1.5 }}>
                  Use <strong>⬚ Select</strong> to box the array, then <strong>Rotate Array</strong> to align it, or <strong>✋ Move</strong> to reposition.
                </div>
              )}

              <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10 }}>Default Tilt / Azimuth</div>
              <Slider label="Tilt" value={globalTilt} min={0} max={45} color="#0EA5E9" suffix="°" onChange={setGlobalTilt} />
              <Slider label="Azimuth" value={globalAzimuth} min={0} max={360} color="#2563EB" suffix={`° ${dirFromAz(globalAzimuth)}`} onChange={setGlobalAzimuth} />
              <button onClick={applyGlobalToAll} style={{ ...btn('#2563EB'), marginBottom: 6 }}>Apply to All Panels</button>
              <button onClick={() => { setGlobalTilt(15); setGlobalAzimuth(optimalAzimuth); }} style={btn('#1E3A5F')}>☀ Optimal ({optimalAzimuth === 180 ? 'S' : 'N'}, 15°)</button>

              <div style={{ marginTop: 20, borderTop: '1px solid #E2E8F0', paddingTop: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 12 }}>☀ Sun & Shadows</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <button onClick={() => setAnimating(a => !a)} style={{ flex: 1, padding: '8px 0', borderRadius: 7, border: 'none', background: animating ? '#DC2626' : '#16A34A', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>{animating ? '⏸ Pause' : '▶ Play Day'}</button>
                  <span style={{ fontSize: 13, color: '#1E3A5F', fontWeight: 700, fontFamily: 'monospace' }}>{Math.floor(hour)}:{String(Math.round((hour % 1) * 60)).padStart(2, '0')}</span>
                </div>
                <input type="range" min={6} max={19} step={0.25} value={hour} onChange={e => { setHour(Number(e.target.value)); setAnimating(false); }} style={{ width: '100%', accentColor: '#0EA5E9', marginBottom: 4 }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#94A3B8', marginBottom: 10 }}><span>6AM</span><span>Noon</span><span>7PM</span></div>
                <Slider label="Month" value={month} min={1} max={12} color="#0EA5E9" suffix={` ${monthNames[month - 1]}`} onChange={setMonth} />
              </div>
            </>
          )}
          </>
          )}
        </div>
      </div>
    </div>
  );
}

function Slider({ label, value, min, max, color, suffix, onChange, onDragStart, onDragEnd }: { label: string; value: number; min: number; max: number; color: string; suffix: string; onChange: (v: number) => void; onDragStart?: () => void; onDragEnd?: () => void }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 11, color: '#64748B' }}>{label}</span>
        <span style={{ fontSize: 11, color, fontWeight: 700 }}>{value}{suffix}</span>
      </div>
      <input
        type="range" min={min} max={max} value={value}
        onChange={e => onChange(Number(e.target.value))}
        onPointerDown={onDragStart}
        onPointerUp={onDragEnd}
        style={{ width: '100%', accentColor: color }}
      />
    </div>
  );
}
