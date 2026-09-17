'use client';

import { requestDesignShare } from '@/lib/requestDesignShare';
import React, { useEffect, useRef, useMemo, useState, useCallback, useId } from 'react';
import { useRouter } from 'next/navigation';
import * as THREE from 'three';
import { solarPositionAtIST } from './solarPosition';
import { obstacleModel } from './obstacleModels';
import { moduleFits, moduleFootprint } from './designAccuracy';
import { footprintsOverlap, defaultObstacleHeight } from './roofGeometry';
import { sampleShading, type ShadingObstacle, type ShadingSurface } from './sampleShading';
import { concreteTexture, moduleTexture, disposeSceneObjects } from './sceneMaterials';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { useDesignStore, metersPerPixel } from '../../store/designStore';
import { Orbit, MousePointer2, Hand, Scan, ZoomIn, ZoomOut, Maximize, Box, Layers, Sun, Cable, Home, PanelTop, Download, ArrowLeft, SlidersHorizontal, Play, Pause, Save, X, Map as MapIcon, Move } from 'lucide-react';
import './design-workspace.css';
import type { SolarPanel } from '../../types';
import { normalizeEquipmentDimensions, recoverUndersizedModule } from '../../utils/moduleDimensions';

// Context coverage expands with the roof; keep imagery and meter scale tied to the same zoom.
const MAX_CONTEXT_ZOOM = 18;

interface RoofPoint { x: number; y: number; }
// x/z are METERS, centered on roof. azimuth = the panel's facing (also the array's rotation).
interface Panel3D { id: string; x: number; z: number; tilt: number; azimuth: number; widthM?: number; depthM?: number; stored?: SolarPanel }
// Obstacle footprint in centered METERS, same frame as panels/roof.
interface Obstacle3D { id: string; x: number; z: number; w: number; d: number; rotDeg: number; label: string; heightM?: number; }
interface SolarDesign3DProps {
  roofPoints: RoofPoint[]; onClose: () => void; lat?: number; readOnly?: boolean;
  // The roof polygon's own real-world lat/lng, distinct from the design
  // store's mapConfig.center (which tracks the map's live pan position, not
  // where the roof was actually traced) — see the derivation/rationale in
  // DesignPageContent.tsx. Used to anchor the satellite ground image so it
  // lines up with the traced roof instead of wherever the map last panned
  // to. Falls back to mapConfig.center when unavailable (e.g. no roof yet).
  roofCenterLatLng?: { lat: number; lng: number } | null;
}

const DEFAULT_MOUNT_H = 2.4; // illustrative front-edge clearance, adjustable per roof
const COL_GAP = 0.02;      // 2 cm between panels IN a row (frames nearly touching)
const DEFAULT_ROW_GAP = 1.0; // 1m default anti-shading gap between rows (was 0.6m — too tight, causes inter-row shading at low sun angles)
const TX = { text: 'var(--design-text)', muted: 'var(--design-muted)', border: 'var(--design-border)', navy: 'var(--design-navy)', blue: 'var(--design-primary)' };



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

// Split one proximity-cluster into genuine physical ROWS: rotate into the
// cluster's row-aligned frame (its shared azimuth), detect real row-to-row
// gaps, and sort each row left-to-right. Shared by the electrical ordering
// (flattened) and the 3D mount-rack builder (kept as row groups, so a whole
// row of panels can share one continuous rail/leg structure).
function splitClusterIntoRows<T extends OrderablePanel>(cluster: T[]): T[][] {
  if (cluster.length <= 1) return [cluster];
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

  return rows.map(row => row.slice().sort((a, b) => a.x - b.x).map(r => r.panel)); // left-to-right along the row
}

function orderClusterRowMajor<T extends OrderablePanel>(cluster: T[]): T[] {
  return splitClusterIntoRows(cluster).flat();
}

function computePhysicalPanelOrder<T extends OrderablePanel>(panels: T[]): T[] {
  if (panels.length === 0) return [];
  const clusters = clusterPanelsByProximity(panels, 4); // 4m safely bridges same/adjacent rows, not separate wings
  return clusters.flatMap(orderClusterRowMajor);
}

// Physical mounting rows: same clustering, but kept as row groups (not
// flattened) so the rack-building code can give one row of panels a single
// shared rail/leg/brace structure instead of a per-panel leg forest.
function computePhysicalRows<T extends OrderablePanel>(panels: T[]): T[][] {
  if (panels.length === 0) return [];
  const clusters = clusterPanelsByProximity(panels, 4);
  return clusters.flatMap(splitClusterIntoRows);
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

export function SolarDesign3D({ roofPoints, onClose, lat = 19.24, readOnly = false, roofCenterLatLng = null }: SolarDesign3DProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | THREE.OrthographicCamera | null>(null);
  const [topView, setTopView] = useState(false);
  const controlsRef = useRef<OrbitControls | null>(null);
  const sunRef = useRef<THREE.DirectionalLight | null>(null);
  const sunSphereRef = useRef<THREE.Mesh | null>(null);
  const panelMeshGroup = useRef<THREE.Group | null>(null);
  const obstacleMeshGroup = useRef<THREE.Group | null>(null);
  const satelliteMeshGroup = useRef<THREE.Group | null>(null);

  const frameRef = useRef<number>(0);
  const needsRender = useRef(true);
  useEffect(() => { needsRender.current = true; });
  const raycaster = useRef(new THREE.Raycaster());
  const mouse = useRef(new THREE.Vector2());

  const savedEquipment = useDesignStore(s => s.equipment);
  const equipment = useMemo(() => normalizeEquipmentDimensions(savedEquipment), [savedEquipment]);
  const PANEL_W_M = equipment.panelWidth / 1000;
  const PANEL_H_M = equipment.panelHeight / 1000;
  const PANEL_POWER = equipment.panelPower;
  const equipmentValid = [PANEL_W_M, PANEL_H_M, PANEL_POWER].every(v => Number.isFinite(v) && v > 0) && PANEL_W_M >= 0.1 && PANEL_H_M >= 0.1;
  const currentRoof = useDesignStore(s => s.roofs[0]);
  const [designNotice, setDesignNotice] = useState('');
  const shadingController = useRef<AbortController | null>(null);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [unlitCount, setUnlitCount] = useState(0);
  const [analysisPeriod, setAnalysisPeriod] = useState<'instant' | 'day'>('day');
  const [analysisDate, setAnalysisDate] = useState(() => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()));
  const dimensions = useCallback((p: Panel3D) => {
    const landscape = p.stored?.orientation === 'landscape';
    return recoverUndersizedModule(p.widthM ?? PANEL_W_M, p.depthM ?? PANEL_H_M,
      landscape ? PANEL_H_M : PANEL_W_M, landscape ? PANEL_W_M : PANEL_H_M);
  }, [PANEL_W_M, PANEL_H_M]);
  const project = useDesignStore(s => s.project);
  const roofId = useDesignStore(s => s.roofs[0]?.id ?? '');
  const roofAreaM2 = useDesignStore(s => s.roofs[0]?.area ?? 0);
  const router = useRouter();
  const mapConfig = useDesignStore(s => s.mapConfig);
  const projectId = useDesignStore(s => s.projectId);
  const stageScale = useDesignStore(s => s.scale);
  const traceMpp = useDesignStore(s => s.roofs[0]?.traceMpp);

  // Real-world scale: prefer trace-time scale, fall back to live zoom × stage scale.
  const mpp = useMemo(
    () => traceMpp ?? (metersPerPixel(mapConfig.center?.lat ?? lat, mapConfig.zoom ?? 20) * (stageScale || 1)),
    [traceMpp, mapConfig.center?.lat, mapConfig.zoom, lat, stageScale]
  );

  const roofSettings = useDesignStore(s => s.roofs[0]?.design3D);
  const MOUNT_H = roofSettings?.mountingHeightM ?? DEFAULT_MOUNT_H;
  const parapetHeightM = roofSettings?.parapetHeightM ?? 1;
  const setbackM = roofSettings?.setbackM ?? 0.5;
  const siteLng = roofCenterLatLng?.lng ?? mapConfig.center?.lng;
  const sunPosition = useCallback((hour: number) =>
    solarPositionAtIST(roofCenterLatLng?.lat ?? mapConfig.center?.lat ?? lat, siteLng, analysisDate, hour),
    [roofCenterLatLng?.lat, mapConfig.center?.lat, lat, siteLng, analysisDate]);
  const setMountHeight = (value: number) => {
    if (!readOnly && roofId) useDesignStore.getState().updateRoof(roofId, {
      design3D: { ...roofSettings, mountingHeightM: value },
    });
  };
  const [showSatellite, setShowSatellite] = useState(true);
  const contextSpan = Math.max(360, ...['x', 'y'].map(axis => {
    const values = roofPoints.map(p => p[axis as 'x' | 'y']);
    return values.length ? (Math.max(...values) - Math.min(...values)) * mpp * 3 : 0;
  }));
  const siteLat = roofCenterLatLng?.lat ?? mapConfig.center?.lat ?? lat;
  const satelliteZoom = Math.max(10, Math.min(MAX_CONTEXT_ZOOM,
    Math.floor(Math.log2(640 * metersPerPixel(siteLat, 0) / contextSpan))));

  // Real satellite ground imagery (app/api/satellite-image), cached per
  // project in Supabase so it's only ever fetched once per project unless
  // the user explicitly refreshes. null means "not available" — falls back
  // to the existing paver/grass ground, never blocks rendering.
  const [satelliteImageUrl, setSatelliteImageUrl] = useState<string | null>(null);
  const [satelliteRefreshNonce, setSatelliteRefreshNonce] = useState(0);
  useEffect(() => {
    // Prefer the roof polygon's own geo-anchor over mapConfig.center — the
    // latter tracks the map's live pan position, not where the roof was
    // actually traced (see the derivation in DesignPageContent.tsx). Using
    // mapConfig.center directly was the cause of the satellite image and
    // building rendering in different places.
    const center = roofCenterLatLng ?? mapConfig.center;
    if (!projectId || !center) { setSatelliteImageUrl(null); return; }
    let cancelled = false;
    setSatelliteImageUrl(null);
    const qs = new URLSearchParams({
      projectId, lat: String(center.lat), lng: String(center.lng), zoom: String(satelliteZoom),
      shareToken: new URLSearchParams(window.location.search).get('shareToken') || '',
      ...(satelliteRefreshNonce > 0 ? { refresh: 'true' } : {}),
    });
    fetch(`/api/satellite-image?${qs}`)
      .then(res => res.json())
      .then(data => {
        if (cancelled) return;
        setSatelliteImageUrl(!data.fallback && data.dataUrl ? data.dataUrl : null);
      })
      .catch(() => { if (!cancelled) setSatelliteImageUrl(null); });
    return () => { cancelled = true; };
  }, [projectId, roofCenterLatLng?.lat, roofCenterLatLng?.lng, mapConfig.center?.lat, mapConfig.center?.lng, satelliteRefreshNonce, satelliteZoom]);

  const [toolPanel, setToolPanel] = useState('panels');
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const saveStatus = useDesignStore(s => s.saveStatus);
  const [saveError, setSaveError] = useState('');
  useEffect(() => { setInspectorOpen(window.innerWidth > 900); }, []);
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
    return st.panels.filter(sp => sp.roofId === st.roofs[0]?.id).map(sp => ({
      id: sp.id, x: (sp.x - cx) * m, z: (sp.y - cy) * m, tilt: sp.tilt, azimuth: sp.rotation,
      widthM: sp.orientation === 'landscape' ? (sp.moduleHeightM ?? sp.height * m) : (sp.moduleWidthM ?? sp.width * m),
      depthM: sp.orientation === 'landscape' ? (sp.moduleWidthM ?? sp.width * m) : (sp.moduleHeightM ?? sp.height * m), stored: sp,
    }));
  });

  const totalPower = panels.reduce((sum, p) => sum + (p.stored?.power ?? PANEL_POWER), 0);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [hour, setHour] = useState(12);

  const [animating, setAnimating] = useState(false);
  const [mode, setMode] = useState<'orbit' | 'pan' | 'select' | 'drag' | 'zone'>('orbit');
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
    const out = roofPoints.map(p => ({ x: (p.x - cx) * mpp, z: (p.y - cy) * mpp }));
    return out;
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
      w: o.width * m, d: o.height * m, rotDeg: o.rotation, label: o.label, heightM: o.heightM,
    }));
  });
  const [selectedObstacleId, setSelectedObstacleId] = useState<string | null>(null);
  useEffect(() => { if (selectedObstacleId) { setToolPanel('obstacles'); setInspectorOpen(true); } }, [selectedObstacleId]);
  const obstaclesRef = useRef<Obstacle3D[]>([]);
  obstaclesRef.current = obstacles;
  const selectedObstacleIdRef = useRef<string | null>(null);
  selectedObstacleIdRef.current = selectedObstacleId;

  const geometryFor = useCallback((p: Panel3D) => ({ x: p.x, z: p.z, tilt: p.tilt, azimuth: p.azimuth, ...dimensions(p) }), [dimensions]);
  const freezePanel = useCallback((p: Panel3D): Panel3D => ({
    ...p, ...dimensions(p), stored: p.stored ?? {
      id: p.id, type: 'panel', x: 0, y: 0, width: PANEL_W_M / mpp, height: PANEL_H_M / mpp,
      moduleWidthM: PANEL_W_M, moduleHeightM: PANEL_H_M, rotation: p.azimuth, tilt: p.tilt,
      orientation: 'portrait', manufacturer: equipment.panelModel.split(' ')[0], model: equipment.panelModel,
      power: PANEL_POWER, stringNumber: 1, roofId,
    },
  }), [dimensions, PANEL_W_M, PANEL_H_M, PANEL_POWER, mpp, equipment.panelModel, roofId]);
  const fits = useCallback((p: Panel3D) => moduleFits(geometryFor(p), roofPolyMeters, obstacles, setbackM), [geometryFor, roofPolyMeters, obstacles, setbackM]);
  const invalidPanelIds = useMemo(() => {
    const bad = new Set(panels.filter(p => !fits(p)).map(p => p.id));
    const footprints = panels.map(p => moduleFootprint(geometryFor(p)));
    for (let i = 0; i < panels.length; i++) for (let j = i + 1; j < panels.length; j++) {
      if (footprintsOverlap(footprints[i], footprints[j])) { bad.add(panels[i].id); bad.add(panels[j].id); }
    }
    return bad;
  }, [panels, fits, geometryFor]);
  const lastValidPanels = useRef(panels);
  useEffect(() => { if (invalidPanelIds.size === 0) lastValidPanels.current = panels; }, [panels, invalidPanelIds]);
  const addValidPanels = useCallback((existing: Panel3D[], candidates: Panel3D[]) => {
    const result = [...existing];
    for (const candidate of candidates) {
      if (fits(candidate) && !result.some(p => footprintsOverlap(moduleFootprint(geometryFor(p)), moduleFootprint(geometryFor(candidate))))) result.push(freezePanel(candidate));
    }
    return result;
  }, [fits, geometryFor, freezePanel]);
  const dataIssues = [
    !equipmentValid ? 'Module dimensions or power are missing.' : '',
    !equipment.specificationsConfirmed ? 'Module specifications are not confirmed.' : '',
    !roofSettings?.measurementsConfirmed ? 'Site dimensions and heights are not confirmed.' : '',
    !currentRoof?.traceMpp ? 'Trace scale is missing; calibrate the roof before analysis.' : '',
    currentRoof?.slope !== 0 || (roofSettings?.terraces?.length ?? 0) > 0 ? 'Sloped or stepped roofs are not supported by this analysis.' : '',
    obstacles.some(o => !(o.heightM && o.heightM > 0)) ? 'Enter the height of every obstacle.' : '',
    obstacles.some(o => !moduleFits({ x: o.x, z: o.z, widthM: o.w, depthM: o.d, tilt: 0, azimuth: 180 - o.rotDeg }, roofPolyMeters, [], 0)) ? 'An obstacle extends outside the active roof.' : '',
    invalidPanelIds.size ? `${invalidPanelIds.size} panels violate roof clearance, obstacles or overlap checks.` : '',
    panels.some(p => !Number.isFinite(p.stored?.power ?? PANEL_POWER) || (p.stored?.power ?? PANEL_POWER) <= 0) ? 'A placed module has invalid power data.' : '',
  ].filter(Boolean);
  const analysisBlocked = dataIssues.length > 0;
  const modelSignature = JSON.stringify({ panels, obstacles, wallHeightM, MOUNT_H, parapetHeightM, roofPolyMeters, analysisDate, hour, analysisPeriod, equipment, roofSettings });
  useEffect(() => {
    shadingController.current?.abort();
    setShadingResults(null); setRunningShading(false); setUnlitCount(0);
    return () => shadingController.current?.abort();
  }, [modelSignature]);
  const measurementSignature = JSON.stringify({ obstacles, wallHeightM, MOUNT_H, parapetHeightM, roofPolyMeters, slope: currentRoof?.slope });
  const previousMeasurements = useRef(measurementSignature);
  useEffect(() => {
    if (previousMeasurements.current !== measurementSignature && !readOnly && roofId && roofSettings?.measurementsConfirmed) {
      useDesignStore.getState().updateRoof(roofId, { design3D: { ...roofSettings, measurementsConfirmed: false } });
    }
    previousMeasurements.current = measurementSignature;
  }, [measurementSignature, readOnly, roofId, roofSettings]);

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
    if (!roofDims || readOnly) return;
    const ppm = 1 / mpp;
    const { cx, cy } = roofDims;
    const mapped: SolarPanel[] = panels.map((p) => {
      const physicalIdx = physicalOrderMap.get(p.id) ?? 0;
      return {
        ...p.stored, id: p.id, type: 'panel',
        x: cx + p.x * ppm, y: cy + p.z * ppm,
        width: (p.stored?.orientation === 'landscape' ? dimensions(p).depthM : dimensions(p).widthM) * ppm,
        height: (p.stored?.orientation === 'landscape' ? dimensions(p).widthM : dimensions(p).depthM) * ppm,
        moduleWidthM: p.stored?.orientation === 'landscape' ? dimensions(p).depthM : dimensions(p).widthM,
        moduleHeightM: p.stored?.orientation === 'landscape' ? dimensions(p).widthM : dimensions(p).depthM,
        rotation: p.azimuth, orientation: p.stored?.orientation ?? 'portrait',
        manufacturer: p.stored?.manufacturer ?? equipment.panelModel.split(' ')[0],
        model: p.stored?.model ?? equipment.panelModel, power: p.stored?.power ?? PANEL_POWER,
        tilt: p.tilt, stringNumber: Math.floor(physicalIdx / stringSize) + 1, roofId,
      };
    });
    useDesignStore.setState(st => ({ panels: [...st.panels.filter(p => p.roofId !== roofId), ...mapped], saveStatus: 'unsaved' }));
  }, [panels, equipment, roofId, roofDims, mpp, stringSize, physicalOrderMap, dimensions, readOnly]);

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
      rotation: o.rotDeg, label: o.label, heightM: o.heightM,
    }));
    useDesignStore.setState({ obstacles: mappedObs, saveStatus: 'unsaved' });
  }, [obstacles, roofDims, mpp, readOnly]);

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
  }, [rowGapM, lat, PANEL_W_M, PANEL_H_M]);

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

    setPanels(prev => addValidPanels(prev, valid));
    setSelectedIds(valid.map(p => p.id));
  }, [rows, cols, globalTilt, roofDims, roofPolyMeters, buildLattice, obstacles, forceTrueSouth, addValidPanels, PANEL_W_M, PANEL_H_M]);

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

    const setback = setbackM;
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

        if (!moduleFits({ ...centerReal, widthM: PANEL_W_M, depthM: PANEL_H_M, tilt: globalTilt, azimuth }, roofPolyMeters, obstacles, setbackM)) continue;
        placed.push({ id: `af-${r}-${c}-${Date.now()}`, x: centerReal.x, z: centerReal.z, tilt: globalTilt, azimuth });
      }
    }
    return placed;
  }, [roofDims, roofPolyMeters, globalTilt, obstacles, rowGapM, lat, forceTrueSouth, setbackM, PANEL_W_M, PANEL_H_M, PANEL_POWER]);

  const autoFillToTarget = useCallback((overrideKw?: number) => {
    if (!equipmentValid || !equipment.specificationsConfirmed) { setDesignNotice('Confirm module specifications before generating panels.'); return; }
    const effTargetKw = overrideKw ?? targetKw;
    const panelsNeeded = Math.ceil((effTargetKw * 1000) / PANEL_POWER);
    const placed = computeWholeRoofFill(effTargetKw);
    if (placed.length < panelsNeeded) {
      alert(`Roof fits ${placed.length} panels (${((placed.length * PANEL_POWER) / 1000).toFixed(1)} kW max, obstacles avoided). Target was ${panelsNeeded} panels for ${effTargetKw} kW.`);
    }
    setPanels(placed.map(freezePanel));
    setSelectedIds([]);
  }, [computeWholeRoofFill, targetKw, equipmentValid, equipment.specificationsConfirmed, PANEL_POWER, freezePanel]);

  // Safety net: after a manual Rotate or Move, remove any panel whose center
  // ended up outside the roof edge (this is what causes the "overhang" look —
  // manual rotation doesn't re-check the boundary the way Auto-Fill does).
  const pruneOutOfBoundsPanels = useCallback(() => {
    const current = panelsRef.current;
    const bad = current.some(p => !fits(p)) || current.some((p, i) => current.slice(i + 1).some(q => footprintsOverlap(moduleFootprint(geometryFor(p)), moduleFootprint(geometryFor(q)))));
    if (bad) { setPanels(lastValidPanels.current); setDesignNotice('Move rejected: panels must stay clear of roof edges, obstacles and other panels.'); }
  }, [fits, geometryFor]);
  const prunePanelsRef = useRef(pruneOutOfBoundsPanels);
  prunePanelsRef.current = pruneOutOfBoundsPanels;

  // ONE-CLICK FIX for the "manually rotating makes it look weird" problem:
  // regenerate the whole layout at the SAME panel count, freshly aligned and
  // bounded, in a SINGLE setPanels call — no clear-then-refill race that
  // could leave a stray old panel behind.
  const alignAllToBuilding = useCallback(() => {
    if (panels.length === 0) return;
    if (panels.some(p => dimensions(p).widthM !== PANEL_W_M || dimensions(p).depthM !== PANEL_H_M || (p.stored?.power ?? PANEL_POWER) !== PANEL_POWER)) {
      setDesignNotice('Align requires the selected module to match the placed modules. Existing specifications have been preserved.'); return;
    }
    const currentKw = Math.max(0.5, totalPower / 1000);
    const placed = computeWholeRoofFill(currentKw);
    setPanels(placed.map(freezePanel));
    setSelectedIds([]);
  }, [panels, totalPower, computeWholeRoofFill, freezePanel, dimensions, PANEL_W_M, PANEL_H_M, PANEL_POWER]);

  // ─────────────────────────────────────────────────────────────
  // CLIENT VIEW EXPORT — captures whatever angle the vendor has orbited to
  // (rather than guessing an "optimal" angle, which is subjective), composites
  // a caption bar with client name / address / system size onto it, and
  // triggers a PNG download the vendor can drop straight into the quote PDF
  // or send over WhatsApp.
  // ─────────────────────────────────────────────────────────────
  const exportClientView = useCallback(() => {
    if (invalidPanelIds.size) { setDesignNotice('Resolve invalid panel placements before exporting.'); return; }
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

    const localKwp = totalPower / 1000;
    const statLine = `${localKwp.toFixed(2)} kWp  ·  ${panels.length} panels  ·  Preliminary layout`;
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
  }, [project.clientName, project.address, panels.length, totalPower, invalidPanelIds]);

  // Same integration as the 2D Statistics panel's "Generate Quote" button —
  // duplicated here since finishing the design in 3D is often the natural
  // moment to jump straight to the quote, without going back to 2D first.
  const generateQuote = useCallback(async () => {
    if (panels.length === 0) return;
    if (!projectId) { setDesignNotice('Save this design to a project before creating its quote.'); return; }
    let shareToken = '';
    try {
      await useDesignStore.getState().saveToSupabase();
      if (useDesignStore.getState().saveStatus !== 'saved') throw new Error('Save failed');
    } catch (error) { setDesignNotice(error instanceof Error ? error.message : 'Could not save or share the design.'); return; }
    try { shareToken = await requestDesignShare(projectId); }
    catch { window.alert('The design is saved. Your quote will open without a design link because secure sharing is unavailable.'); }
    const localKwp = totalPower / 1000;
    const params = new URLSearchParams({
      name: project.clientName && project.clientName !== 'New Client' ? project.clientName : '',
      address: project.address && project.address !== 'Enter address...' ? project.address : '',
      system_size: localKwp.toFixed(2),
      panel_count: String(panels.length),
      roof_area: roofAreaM2.toFixed(1),
      projectId,
      shareToken,

    });
    // Hard navigation, not router.push — see page.tsx's generateQuote for why
    window.location.href = `/quote?${params.toString()}`;
  }, [totalPower, panels.length, project.clientName, project.address, roofAreaM2, router, projectId]);

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
  const runShadingAnalysis = useCallback(async () => {
    if (analysisBlocked) { setDesignNotice(dataIssues.join(' ')); return; }
    const scene = sceneRef.current, pg = panelMeshGroup.current, og = obstacleMeshGroup.current;
    if (!scene || !pg || !panels.length) return;
    shadingController.current?.abort();
    const controller = new AbortController(); shadingController.current = controller;
    setRunningShading(true); setAnalysisProgress(0); setDesignNotice('');
    scene.updateMatrixWorld(true);
    const surfaces: ShadingSurface[] = [];
    const blockers: ShadingObstacle[] = [];
    pg.children.forEach(root => {
      if (!root.userData.panelId) return;
      const p = panels.find(p => p.id === root.userData.panelId);
      const mesh = root.getObjectByName('pv-face') as THREE.Mesh | undefined;
      if (p && mesh) surfaces.push({ id: p.id, mesh, width: dimensions(p).widthM, depth: dimensions(p).depthM });
      root.traverse(obj => { if (obj instanceof THREE.Mesh) blockers.push({ mesh: obj, owner: root.userData.panelId }); });
    });
    og?.traverse(obj => { if (obj instanceof THREE.Mesh && !obj.userData.visualDetail) blockers.push({ mesh: obj }); });
    scene.traverse(obj => { if (obj instanceof THREE.Mesh && obj.userData.isBuildingMass) blockers.push({ mesh: obj }); });
    const hours = analysisPeriod === 'instant' ? [hour] : Array.from({ length: 48 }, (_, i) => i / 2);
    const directions = hours.map(h => sunPosition(h)).filter(s => s.elevation > 0).map(s => {
      const az = THREE.MathUtils.degToRad(s.azimuth), el = THREE.MathUtils.degToRad(s.elevation);
      return new THREE.Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), -Math.cos(el) * Math.cos(az));
    });
    if (!directions.length) { setDesignNotice('Sun is below the horizon for this selection.'); setRunningShading(false); return; }
    try {
      const result = await sampleShading(surfaces, blockers, directions, controller.signal, setAnalysisProgress);
      if (!controller.signal.aborted) { setShadingResults(result.results); setUnlitCount(result.unlit.length); }
    } catch (error) {
      if (!controller.signal.aborted) setDesignNotice('Analysis failed. Please retry after checking the model.');
    } finally { if (!controller.signal.aborted) setRunningShading(false); }
  }, [analysisBlocked, modelSignature, panels, dimensions, sunPosition, analysisPeriod, hour]);


  // Derived summary from the last analysis run
  const shadingSummary = (() => {
    if (!shadingResults) return null;
    const entries = Object.entries(shadingResults);
    const shadedPanels = entries.filter(([, frac]) => frac > 0.1); // >10% of sampled daytime hours
    const avgLossAcrossShaded = shadedPanels.length > 0
      ? shadedPanels.reduce((a, [, f]) => a + f, 0) / shadedPanels.length
      : 0;
    return { totalPanels: entries.length, shadedCount: shadedPanels.length, avgLossAcrossShaded };
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
    setPanels(prev => addValidPanels(prev, placed));
  }, [roofDims, roofPolyMeters, zoneRect, zoneTargetKw, globalTilt, obstacles, rowGapM, lat, forceTrueSouth, addValidPanels, PANEL_W_M, PANEL_H_M, PANEL_POWER]);

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
    scene.background = new THREE.Color('#e5e9ea');
    sceneRef.current = scene;

    const WALL_H = wallHeightM;
    const roofSpanM = Math.max(roofDims.widthM, roofDims.heightM, 8);
    const halfHeight = roofSpanM * .7 / Math.min(1,W/H);
    const camera = topView
      ? new THREE.OrthographicCamera(-halfHeight*W/H,halfHeight*W/H,halfHeight,-halfHeight,.1,5000)
      : new THREE.PerspectiveCamera(45, W / H, 0.5, 5000);
    const camDist = Math.max(18, roofSpanM * 1.6);
    camera.position.set(topView ? 0 : camDist * 0.5, topView ? WALL_H+camDist : camDist * 0.6, topView ? 0 : camDist * 0.9);
    if (topView) camera.up.set(0,0,-1);
    camera.lookAt(0, WALL_H, 0);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    const environment = pmrem.fromScene(room, 0.04);
    scene.environment = environment.texture;
    scene.environmentIntensity = 0.35;
    room.dispose(); pmrem.dispose();
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // Fade in rather than hard-cutting from the 2D canvas — 2D and 3D are
    // two entirely different renderers (Konva vs WebGL), so there's no
    // camera position to animate between them; a brief opacity fade is
    // what actually smooths that switch for the user.
    renderer.domElement.style.opacity = '0';
    renderer.domElement.style.transition = 'opacity 350ms ease-out';
    mount.appendChild(renderer.domElement);
    requestAnimationFrame(() => { renderer.domElement.style.opacity = '1'; });
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enablePan = true;
    controls.screenSpacePanning = true;
    controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;
    controls.addEventListener('change', () => { needsRender.current = true; });
    controls.dampingFactor = 0.05;
    controls.minDistance = 5;
    controls.maxDistance = Math.max(150, camDist * 3);
    controls.maxPolarAngle = topView ? Math.PI : Math.PI / 2.05;
    controls.target.set(0, WALL_H, 0);
    controls.update();
    controlsRef.current = controls;

    // Soft sky/ground hemisphere light instead of flat ambient — cooler tint
    // from above (sky), warmer from below (bounced off the ground), matching
    // how a real outdoor scene actually gets lit, not a single flat fill.
    // Ground color is warm gray-tan (matching the paver/satellite ground
    // that's actually beneath the building now) — it used to be olive-green
    // left over from when the fallback ground was solid grass, which was
    // tinting every shadow-facing wall a muddy olive regardless of what
    // ground texture was actually in use.
    scene.add(new THREE.HemisphereLight(0xffffff, 0xbac0bd, 1.2));
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
    sun.shadow.bias = -0.00015;
    sun.shadow.normalBias = 0.02;
    sun.shadow.camera.updateProjectionMatrix();
    sun.target.position.set(0, WALL_H, 0);
    scene.add(sun.target);
    scene.add(sun);
    sunRef.current = sun;

    const sunSphere = new THREE.Mesh(new THREE.SphereGeometry(2.5, 16, 16), new THREE.MeshBasicMaterial({ color: 0xffdd44 }));
    sunSphere.visible = false;
    scene.add(sunSphere);
    sunSphereRef.current = sunSphere;

    const fill = new THREE.DirectionalLight(0xaaccff, 0.3);
    fill.position.set(-30, 20, -30);
    scene.add(fill);

    const normPoints = roofPolyMeters;

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(20000, 20000),
      new THREE.MeshStandardMaterial({ color: '#d6ddda', roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.15;
    ground.name = 'context-ground';
    ground.receiveShadow = true; scene.add(ground);
    const roofMaterial = new THREE.MeshStandardMaterial({ map: roofSettings?.roofMaterial === 'coating' ? null : concreteTexture(), color: roofSettings?.roofMaterial === 'coating' ? '#a3afb0' : '#ffffff', roughness: 0.88 });
    const wallMaterial = new THREE.MeshStandardMaterial({ map: concreteTexture(3), color: '#adb0ab', roughness: 0.95 });
    const shape = new THREE.Shape();
    normPoints.forEach((p, i) => { i === 0 ? shape.moveTo(p.x, p.z) : shape.lineTo(p.x, p.z); });
    shape.closePath();
    const bg = new THREE.ExtrudeGeometry(shape, { depth: WALL_H, bevelEnabled: false });
    bg.rotateX(Math.PI / 2); bg.translate(0, WALL_H, 0);
    const building = new THREE.Mesh(bg, [roofMaterial, wallMaterial]);
    building.castShadow = true; building.receiveShadow = true;
    scene.add(building);
    // The extrusion cap is the roof: a second coplanar face causes striped depth artifacts.
    building.name = 'roof'; building.userData.isBuildingMass = true;
    const PH = parapetHeightM;
    const pm = new THREE.MeshStandardMaterial({ color: '#aeb3ae', roughness: 0.95, metalness: 0 });
    // Thin coping cap along the parapet top — a slightly lighter, overhanging
    // slab (real parapets almost always have one) so the roofline reads as a
    // finished edge with some depth instead of a plain extruded box.
    const copingMat = new THREE.MeshStandardMaterial({ color: '#c2c6bf', roughness: 0.85, metalness: 0 });
    const copingOverhang = 0.05, copingH = Math.min(0.06, PH);
    for (let i = 0; i < normPoints.length; i++) {
      if (PH <= 0) continue;
      const a = normPoints[i], b = normPoints[(i + 1) % normPoints.length];
      const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz);
      const rotY = -Math.atan2(dz, dx);
      const bodyH = Math.max(0.001, PH - copingH);
      const par = new THREE.Mesh(new THREE.BoxGeometry(len, bodyH, 0.3), pm);
      par.position.set((a.x + b.x) / 2, WALL_H + bodyH / 2, (a.z + b.z) / 2);
      par.rotation.y = rotY; par.castShadow = true;
      par.userData.isBuildingMass = true; // shading analysis raycasts against this
      scene.add(par);

      const coping = new THREE.Mesh(new THREE.BoxGeometry(len + copingOverhang * 2, copingH, 0.3 + copingOverhang * 2), copingMat);
      coping.position.set((a.x + b.x) / 2, WALL_H + PH - copingH / 2, (a.z + b.z) / 2);
      coping.rotation.y = rotY; coping.castShadow = true; coping.receiveShadow = true; coping.userData.isBuildingMass = true;
      scene.add(coping);
    }
    const pg = new THREE.Group(); pg.name = 'panels'; scene.add(pg);
    panelMeshGroup.current = pg;

    const og = new THREE.Group(); og.name = 'obstacles'; scene.add(og);
    obstacleMeshGroup.current = og;
    const sg = new THREE.Group(); sg.name = 'satellite'; scene.add(sg);
    satelliteMeshGroup.current = sg;
    const zg = new THREE.Group(); zg.name = 'zone'; scene.add(zg);
    zoneMeshGroup.current = zg;

    let isDisposed = false;
    const animate = () => {
      if (isDisposed) return;
      frameRef.current = requestAnimationFrame(animate);
      const moved = controls.update();
      // Guard against rendering into a 0×0 or already-detached canvas — this
      // is what causes "drawImage... width or height of 0" when navigating
      // away right as an in-flight frame was mid-execution during teardown.
      if (renderer.domElement.width === 0 || renderer.domElement.height === 0) return;
      if (!document.hidden && (moved || needsRender.current)) {
        renderer.render(scene, camera);
        needsRender.current = false;
      }
    };
    animate();

    const onResize = () => {
      if (!mount) return;
      const w = mount.clientWidth, h = mount.clientHeight;
      if (w === 0 || h === 0) return; // still not laid out — nothing to size to yet
      if (camera instanceof THREE.PerspectiveCamera) camera.aspect = w / h;
      else { camera.left=-camera.top*w/h; camera.right=camera.top*w/h; }
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      needsRender.current = true;
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
      controls.dispose();
      disposeSceneObjects(scene);
      environment.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, [roofPoints, roofDims, roofPolyMeters, wallHeightM, parapetHeightM, topView]);

  useEffect(() => {
    const roof = sceneRef.current?.getObjectByName('roof') as THREE.Mesh | undefined;
    if (!roof || !Array.isArray(roof.material)) return;
    const material = roof.material[0] as THREE.MeshStandardMaterial;
    material.map?.dispose();
    material.map = roofSettings?.roofMaterial === 'coating' ? null : concreteTexture();
    material.color.set(roofSettings?.roofMaterial === 'coating' ? '#a3afb0' : '#ffffff');
    material.needsUpdate = true; needsRender.current = true;
  }, [roofSettings?.roofMaterial, roofDims, wallHeightM, parapetHeightM, topView]);

  useEffect(() => {
    const sun = sunRef.current, sphere = sunSphereRef.current, scene = sceneRef.current;
    if (!sun || !sphere || !scene || !roofDims) return;
    const { azimuth, elevation } = sunPosition(hour);
    const azR = azimuth * Math.PI / 180, elR = elevation * Math.PI / 180;
    // Sun distance/height must scale with building height too — otherwise a
    // fixed-height sun appears to "sink" as the roof grows taller toward it.
    const d = Math.max(120, Math.max(roofDims.widthM, roofDims.heightM) * 4, wallHeightM * 10);
    const x = d * Math.cos(elR) * Math.sin(azR);
    const y = wallHeightM + d * Math.sin(elR); // measured from ROOF level, not ground
    const z = -d * Math.cos(elR) * Math.cos(azR);
    sun.position.set(x, y, z);
    sun.intensity = elevation > 0 ? 1.5 : 0;
    sun.castShadow = elevation > 0;
    sphere.position.set(x, Math.max(wallHeightM + 2, y), z);
    sphere.visible = elevation > 0;
    scene.background = new THREE.Color('#e5e9ea');
  }, [hour, sunPosition, roofDims, wallHeightM, parapetHeightM, topView]);

  useEffect(() => {
    if (!animating) return;
    const iv = setInterval(() => setHour(h => { const n = h + 0.25; return n > 19 ? 6 : n; }), 100);
    return () => clearInterval(iv);
  }, [animating]);

  // Rebuild panel meshes from each module's saved physical dimensions.
  useEffect(() => {
    const pg = panelMeshGroup.current;
    if (!pg || !roofDims) return;
    disposeSceneObjects(pg);
    pg.clear();
    const WALL_H = wallHeightM;
    const pw = PANEL_W_M, ph = PANEL_H_M;

    // Dark aluminum frame — a real physically-based material (not flat
    // Lambert) so it actually catches specular highlights like anodized
    // metal, matching professional solar-render references.
    const frameMat = new THREE.MeshStandardMaterial({ color: '#232527', roughness: 0.4, metalness: 0.6 });
    // Galvanized-steel racking hardware — lighter and more reflective than
    // the frame, matching the dull-silver look of real ballasted rails/legs.
    const legMat = new THREE.MeshStandardMaterial({ color: '#8b9096', roughness: 0.5, metalness: 0.7 });
    const ballastMat = new THREE.MeshStandardMaterial({ color: '#b7bcb9', roughness: 0.85, metalness: 0.05 });

    // Procedurally-drawn PV cell texture — deep blue-black cells separated
    // by thin silver busbar/grid lines, built once per rebuild (not per
    // panel) and reused across every panel's face material via `repeat`.
    // No external asset dependency, matches the reference images' module
    // face without needing a hosted texture file.
    const pvTexture = moduleTexture();

    panels.forEach((panel, panelIdx) => {
      const { widthM: pw, depthM: ph } = dimensions(panel);
      if (!(pw >= 0.1 && ph >= 0.1 && Number.isFinite(pw) && Number.isFinite(ph))) return;
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
      pGroup.rotation.x = tiltRad;
      pGroup.position.y = MOUNT_H + Math.sin(tiltRad) * ph / 2;

      const frame = new THREE.Mesh(new THREE.BoxGeometry(pw, 0.035, ph),
        isSel ? new THREE.MeshStandardMaterial({ color: '#22C55E', roughness: 0.4, metalness: 0.6 }) : frameMat);
      pGroup.add(frame);
      // Tint over the PV texture for selection/shading/string states —
      // white leaves the texture's natural deep blue-black + silver grid
      // untouched, matching the reference images' glass-like module face.
      const tintColor = isSel ? '#22C55E' : (isShaded ? shadeColor : (showStrings ? stringColor : '#ffffff'));
      const surf = new THREE.Mesh(new THREE.BoxGeometry(pw - 0.025, 0.004, ph - 0.025), new THREE.MeshPhysicalMaterial({
        map: pvTexture, color: tintColor, roughness: 0.35, metalness: 0.05,
        clearcoat: 0.6, clearcoatRoughness: 0.15,
      }));
      surf.name = 'pv-face';
      surf.position.y = 0.0195; surf.castShadow = true; surf.userData.panelId = panel.id;
      pGroup.add(surf);
      assembly.add(pGroup);
      pg.add(assembly);
    });

    // Builds one shared rack — front/back rail, a leg+diagonal-brace pair
    // at each panel boundary plus both ends, and ballast feet — into
    // `rackGroup` (already positioned/rotated at the run's anchor). `lxs`
    // are panel-center x offsets in the rack's own local frame, `rowLz` is
    // their shared depth offset. A run of a single panel degenerates to a
    // rail exactly one module wide on 2 legs — same visual language as a
    // full row, just narrower, so short/interrupted runs never look like a
    // different (denser, individually-legged) structure next to full rows.
    const buildRack = (rackGroup: THREE.Group, lxs: number[], rowLz: number, tiltRad: number, pw = PANEL_W_M, ph = PANEL_H_M) => {
      if (!(pw >= 0.1 && ph >= 0.1 && Number.isFinite(pw) && Number.isFinite(ph))) return;
      const inset = ph * 0.18;
      const centerH = MOUNT_H + Math.sin(tiltRad) * ph / 2;
      const frontH = centerH - Math.sin(tiltRad) * (ph / 2 - inset) - 0.045;
      const backH = centerH + Math.sin(tiltRad) * (ph / 2 - inset) - 0.045;
      const rowMinLx = Math.min(...lxs) - pw / 2, rowMaxLx = Math.max(...lxs) + pw / 2;
      const rowWidth = rowMaxLx - rowMinLx, rowCenterLx = (rowMinLx + rowMaxLx) / 2;
      const frontZ = rowLz + (ph / 2 - inset) * Math.cos(tiltRad);
      const backZ = rowLz - (ph / 2 - inset) * Math.cos(tiltRad);
      const frontRail = new THREE.Mesh(new THREE.BoxGeometry(rowWidth, 0.05, 0.08), legMat);
      frontRail.position.set(rowCenterLx, frontH, frontZ); frontRail.castShadow = true;
      rackGroup.add(frontRail);
      const backRail = new THREE.Mesh(new THREE.BoxGeometry(rowWidth, 0.05, 0.08), legMat);
      backRail.position.set(rowCenterLx, backH, backZ); backRail.castShadow = true;
      rackGroup.add(backRail);

      // Legs at each panel boundary (shared between neighbors) plus both
      // run ends — far fewer supports than one set per panel.
      const sortedLx = [...lxs].sort((a, b) => a - b);
      const legXs = [rowMinLx];
      for (let i = 1; i < sortedLx.length - 1; i += 2) legXs.push((sortedLx[i] + sortedLx[i + 1]) / 2);
      legXs.push(rowMaxLx);

      legXs.forEach(lx => {
        const frontLeg = new THREE.Mesh(new THREE.BoxGeometry(0.08, frontH, 0.08), legMat);
        frontLeg.position.set(lx, frontH / 2, frontZ); frontLeg.castShadow = true; rackGroup.add(frontLeg);
        const backLeg = new THREE.Mesh(new THREE.BoxGeometry(0.08, backH, 0.08), legMat);
        backLeg.position.set(lx, backH / 2, backZ); backLeg.castShadow = true; rackGroup.add(backLeg);

        // Diagonal rafter, parallel to the panel plane — the truss brace
        // visible in real ballasted racks running from the front rail up
        // to the back rail.
        const braceLen = Math.hypot(backH - frontH, backZ - frontZ);
        const brace = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, braceLen), legMat);
        brace.position.set(lx, (frontH + backH) / 2, (frontZ + backZ) / 2);
        brace.rotation.x = tiltRad; brace.castShadow = true;
        rackGroup.add(brace);
        if (MOUNT_H > 1) {
          const a = new THREE.Vector3(lx, frontH * 0.55, frontZ);
          const b = new THREE.Vector3(lx, backH - 0.1, backZ);
          const delta = b.clone().sub(a);
          const diagonal = new THREE.Mesh(new THREE.BoxGeometry(0.055, delta.length(), 0.055), legMat);
          diagonal.position.copy(a).add(b).multiplyScalar(0.5);
          diagonal.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
          diagonal.castShadow = true; rackGroup.add(diagonal);
        }

        // Ballast blocks — weighted concrete feet, matching real roof-mount
        // racking hardware that doesn't penetrate the roof.
        const frontBallast = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.09, 0.28), ballastMat);
        frontBallast.position.set(lx, 0.045, frontZ); frontBallast.castShadow = true; frontBallast.receiveShadow = true;
        rackGroup.add(frontBallast);
        const backBallast = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.09, 0.28), ballastMat);
        backBallast.position.set(lx, 0.045, backZ); backBallast.castShadow = true; backBallast.receiveShadow = true;
        rackGroup.add(backBallast);
      });
    };

    // ── Shared mounting rack per physical ROW (not per panel) ──
    // Real ballasted roof-mount racking runs one continuous rail under a
    // whole row of modules, on a handful of triangular leg/brace supports —
    // not four legs per panel. Building it per-row (instead of per-panel)
    // is what turns the "forest of poles" look into a clean rack.
    const rows = computePhysicalRows(panels);
    rows.forEach(row => {
      if (row.length === 0) return;
      const anchor = row[0];
      const tiltRad = anchor.tilt * Math.PI / 180;

      // A lone panel, or a row whose members don't even share tilt/azimuth
      // (e.g. manually adjusted individually) has no reliable shared row
      // direction — give every panel its own single-module-wide rack via
      // the SAME builder above, so it still reads as the same rack style
      // rather than a different, denser stand.
      const sameTiltAzimuth = row.length > 1 && row.every(p =>
        dimensions(p).widthM === dimensions(anchor).widthM && dimensions(p).depthM === dimensions(anchor).depthM && Math.abs(p.tilt - anchor.tilt) < 0.5 && Math.abs(((p.azimuth - anchor.azimuth + 540) % 360) - 180) < 0.5);
      if (!sameTiltAzimuth) {
        row.forEach(p => {
          const g = new THREE.Group();
          g.position.set(p.x, wallHeightM, p.z);
          g.rotation.y = (180 - p.azimuth) * Math.PI / 180;
          buildRack(g, [0], 0, p.tilt * Math.PI / 180, dimensions(p).widthM, dimensions(p).depthM);
          pg.add(g);
        });
        return;
      }

      // The row's actual yaw, derived from the REAL world positions of its
      // panels (first→last), not from the azimuth field. buildLattice tiles
      // rows along the roof's own edge angle, which is not guaranteed to be
      // exactly the compass azimuth's (180-azimuth) rotation once the roof
      // itself is drawn at an angle — trusting the azimuth field for this
      // sent the rack's local frame off at the wrong angle, detaching the
      // whole rail/leg structure from the roof for anything but an
      // axis-aligned, due-south layout.
      const aziRad = (180 - anchor.azimuth) * Math.PI / 180;

      // Undo each panel's world position back into the row's own local
      // (unrotated, anchor-relative) frame — the exact inverse of how
      // `assembly` above is placed (position = world pivot, rotation.y =
      // aziRad) — so rail/leg geometry built here lines up under every
      // panel regardless of the row's compass heading.
      // NOTE: rotatePt(x,z,angle) and Three.js's actual rotation.y(angle)
      // spin in OPPOSITE senses (verify: rotatePt(x,z,a) === threeRotateY(x,z,-a)),
      // so inverting a Three.js rotation.y=aziRad transform means calling
      // rotatePt with +aziRad, not -aziRad.
      const local = row.map(p => ({ panel: p, ...rotatePt(p.x - anchor.x, p.z - anchor.z, aziRad) }));
      local.sort((a, b) => a.x - b.x);
      const colPitch = PANEL_W_M + COL_GAP;

      // Proximity clustering (computePhysicalRows) only checks that panels
      // are within `linkDistance` of SOME neighbor, chained transitively —
      // across an obstacle gap, or a stepped roof, that can stitch two
      // unrelated runs into one "row". Splitting into contiguous, collinear
      // segments here means each real physical run still gets its own
      // clean shared rack, instead of one bad gap forcing the ENTIRE row
      // (including otherwise-fine sections) to fall back to individual
      // stands — which is what made neighboring rows look inconsistent.
      const segments: (typeof local)[] = [];
      let seg: typeof local = [local[0]];
      for (let i = 1; i < local.length; i++) {
        const gapOk = (local[i].x - local[i - 1].x) < colPitch * 1.8;
        const segZ = seg.reduce((s, l) => s + l.z, 0) / seg.length;
        const collinearOk = Math.abs(local[i].z - segZ) < 0.25;
        if (gapOk && collinearOk) seg.push(local[i]);
        else { segments.push(seg); seg = [local[i]]; }
      }
      segments.push(seg);

      segments.forEach(segLocal => {
        const rackGroup = new THREE.Group();
        rackGroup.position.set(anchor.x, wallHeightM, anchor.z);
        rackGroup.rotation.y = aziRad;
        const rowLz = segLocal.reduce((s, l) => s + l.z, 0) / segLocal.length;
        buildRack(rackGroup, segLocal.map(l => l.x), rowLz, tiltRad, dimensions(anchor).widthM, dimensions(anchor).depthM);
        pg.add(rackGroup);
      });
    });
  }, [panels, roofDims, selectedIds, wallHeightM, stringSize, showStrings, shadingResults, highlightShading, physicalOrderMap, MOUNT_H, dimensions, parapetHeightM, topView]);

  // Rebuild obstacle meshes (skylights, AC units, water tanks, staircase
  // heads) — raised blocks sitting on the roof at their real footprint.
  useEffect(() => {
    const og = obstacleMeshGroup.current;
    if (!og || !roofDims) return;
    disposeSceneObjects(og);
    og.clear();
    const WALL_H = wallHeightM;

    obstacles.forEach(o => {
      const h=o.heightM ?? defaultObstacleHeight(o.label);
      if (![o.w,o.d,h].every(v=>Number.isFinite(v)&&v>0)) return;
      const group=obstacleModel(o.label,o.w,o.d,h,o.id===selectedObstacleId);
      group.position.set(o.x,WALL_H,o.z);
      group.rotation.y=o.rotDeg*Math.PI/180;
      group.traverse(obj=>{obj.userData.obstacleId=o.id;});
      og.add(group);
    });
  }, [obstacles, roofDims, wallHeightM, selectedObstacleId, parapetHeightM, topView]);

  // Real satellite ground imagery — a flat plane sized to the same
  // real-world ground coverage the fetched Static Maps image represents
  // (640 logical px × metersPerPixel at the requested zoom), centered at
  // the scene origin same as the building. Both the map trace and this
  // fresh fetch are north-up and centered on the same lat/lng, so this
  // lines up with the building footprint without needing extra rotation —
  // "roughly aligns," not pixel-perfect registration. Sits above the
  // paver/grass ground (which stays as the surrounding context past the
  // image's edge, and as the total fallback if no image loaded).
  useEffect(() => {
    const sg = satelliteMeshGroup.current;
    if (!sg) return;
    sg.visible = showSatellite;
    const ground = sceneRef.current?.getObjectByName('context-ground');
    if (ground) ground.visible = true;
    while (sg.children.length) {
      const child = sg.children[0]; sg.remove(child); disposeSceneObjects(child);
    }
    const geoCenter = roofCenterLatLng ?? mapConfig.center;
    if (!satelliteImageUrl || !geoCenter) return;
    let cancelled = false;
    const imageSizeM = 640 * metersPerPixel(geoCenter.lat, satelliteZoom);
    new THREE.TextureLoader().load(satelliteImageUrl, tex => {
      if (cancelled) { tex.dispose(); return; }
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = rendererRef.current?.capabilities.getMaxAnisotropy() ?? 1;
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(imageSizeM, imageSizeM),
        new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, fog: false }));
      mesh.rotation.x = -Math.PI / 2; mesh.position.y = -0.08;
      mesh.name = 'satellite-context'; sg.add(mesh);
      needsRender.current = true;
      if (ground) ground.visible = !showSatellite;
      const shadows = new THREE.Mesh(new THREE.PlaneGeometry(imageSizeM, imageSizeM),
        new THREE.ShadowMaterial({ opacity: 0.25, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }));
      shadows.rotation.x = -Math.PI / 2; shadows.position.y = -0.04;
      shadows.receiveShadow = true; sg.add(shadows);
    });
    return () => { cancelled = true; };
  }, [satelliteImageUrl, satelliteZoom, showSatellite, roofDims, wallHeightM, parapetHeightM, roofSettings?.roofMaterial, roofCenterLatLng, mapConfig.center, topView]);


  // Render the zone rectangle (live while dragging, persists until Fill/Clear)
  useEffect(() => {
    const zg = zoneMeshGroup.current;
    if (!zg || !roofDims) return;
    disposeSceneObjects(zg);
    zg.clear();
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
  }, [zoneRect, roofDims, wallHeightM, parapetHeightM, topView]);

  // ── Interaction ──
  useEffect(() => {
    const renderer = rendererRef.current, camera = cameraRef.current, scene = sceneRef.current, controls = controlsRef.current;
    if (!renderer || !camera || !scene || !controls || !roofDims) return;
    const dom = renderer.domElement;
    const WALL_H = wallHeightM;

    let boxStart: { x: number; y: number } | null = null;
    let dragKind: 'panel' | 'obstacle' | null = null;
    let dragLast: { x: number; z: number } | null = null;
    let draggedObstacle: {id:string; mesh:THREE.Object3D; x:number; z:number} | null = null;
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

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const m = modeRef.current;
      getMouse(e);
      if (readOnly || m === 'orbit' || m === 'pan') return;
      if (e.pointerType === 'touch' && !e.isPrimary) return;
      dom.setPointerCapture(e.pointerId);

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
          const mesh=obstacleMeshGroup.current?.children.find(o=>o.userData.obstacleId===hitObsId);
          if (mesh) draggedObstacle={id:hitObsId,mesh,x:mesh.position.x,z:mesh.position.z};
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
    const onMove = (e: PointerEvent) => {
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
            if (draggedObstacle) {
              const mesh=obstacleMeshGroup.current?.children.find(o=>o.userData.obstacleId===draggedObstacle!.id);
              draggedObstacle.x+=dx; draggedObstacle.z+=dz;
              if (mesh) { mesh.position.x=draggedObstacle.x; mesh.position.z=draggedObstacle.z; }
              needsRender.current=true;
            }
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
    const onUp = (e: PointerEvent) => {
      if (dom.hasPointerCapture(e.pointerId)) dom.releasePointerCapture(e.pointerId);
      const m = modeRef.current;
      if (m === 'drag') {
        if (dragKind === 'panel') prunePanelsRef.current();
        if (draggedObstacle) {
          const final=draggedObstacle;
          setObstacles(prev=>prev.map(o=>o.id===final.id?{...o,x:final.x,z:final.z}:o));
        }
        draggedObstacle=null; dragKind = null; dragLast = null; controls.enabled = true;
      }
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

    const onCancel = () => {
      if (draggedObstacle) {
        const original=obstaclesRef.current.find(o=>o.id===draggedObstacle!.id);
        const mesh=obstacleMeshGroup.current?.children.find(o=>o.userData.obstacleId===draggedObstacle!.id);
        if (original && mesh) {mesh.position.x=original.x;mesh.position.z=original.z;needsRender.current=true;}
        draggedObstacle=null;
      }
      dragKind = null; dragLast = null; boxStart = null; zoneDragStart = null;
      setBoxSel(null); controls.enabled = true; prunePanelsRef.current();
    };
    dom.addEventListener('pointerdown', onDown);
    dom.addEventListener('pointermove', onMove);
    dom.addEventListener('pointerup', onUp);
    dom.addEventListener('pointercancel', onCancel);
    return () => {
      dom.removeEventListener('pointerdown', onDown);
      dom.removeEventListener('pointermove', onMove);
      dom.removeEventListener('pointerup', onUp);
      dom.removeEventListener('pointercancel', onCancel);
    };
  }, [roofDims, wallHeightM, readOnly, parapetHeightM, topView]);

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    controls.enabled = true;
    controls.enableRotate = !topView && (mode === 'orbit' || readOnly);
    controls.mouseButtons.LEFT = mode === 'pan' || (topView && mode === 'orbit') ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
    controls.touches.ONE = mode === 'pan' || (topView && mode === 'orbit') ? THREE.TOUCH.PAN : THREE.TOUCH.ROTATE;
    controls.enablePan = true;
  }, [mode, readOnly, roofDims, wallHeightM, parapetHeightM, topView]);

  const kwp = totalPower / 1000;
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
  const liveSun = sunPosition(hour);
  const panelFacingAz = panels[0]?.azimuth ?? globalAzimuth;

  if (!roofDims) {
    return (
      <div style={{ position: 'absolute', inset: 0, zIndex: 10, background: 'var(--design-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 32, opacity: 0.3 }}>⬡</div>
        <p style={{ color: TX.muted, fontSize: 13 }}>Draw a roof in 2D mode first, then open 3D</p>
        <button onClick={onClose} style={{ padding: '6px 16px', borderRadius: 6, border: 'none', background: TX.blue, color: '#fff', fontSize: 12, cursor: 'pointer' }}>← Back to 2D</button>
      </div>
    );
  }


  const btn = (bg: string, color = '#fff'): React.CSSProperties => ({ width: '100%', padding: '9px 0', borderRadius: 5, border: 'none', background: bg, color, fontSize: 12, fontWeight: 600, cursor: 'pointer' });
  const zoomCamera = (factor: number) => {
    const camera = cameraRef.current, controls = controlsRef.current;
    if (!camera || !controls) return;
    if (camera instanceof THREE.OrthographicCamera) {
      camera.zoom=Math.max(.1,Math.min(30,camera.zoom/factor));
      camera.updateProjectionMatrix(); needsRender.current=true; return;
    }
    const offset = camera.position.clone().sub(controls.target);
    offset.setLength(Math.min(controls.maxDistance, Math.max(controls.minDistance, offset.length() * factor)));
    camera.position.copy(controls.target).add(offset); controls.update();
  };
  const frameCamera = (top = false) => {
    if (top !== topView) { setTopView(top); return; }
    const camera = cameraRef.current, controls = controlsRef.current;
    if (!camera || !controls) return;
    const span = Math.max(roofDims.widthM, roofDims.heightM, wallHeightM);
    const distance = camera instanceof THREE.PerspectiveCamera
      ? span * 0.75 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / Math.min(1, camera.aspect)
      : span * 2;
    camera.zoom=1; camera.updateProjectionMatrix();
    controls.target.set(0, wallHeightM, 0);
    camera.position.copy(controls.target).add(new THREE.Vector3(top ? 0 : .5, top ? 1 : .6, top ? 0 : .9).normalize().multiplyScalar(distance));
    controls.update();
  };
  const iconButton = (label: string, icon: React.ReactNode, action: () => void, active?: boolean) => <button type="button" title={label} aria-label={label} aria-pressed={active} onClick={action}>{icon}</button>;
  const sections = [
    { id: 'panels', name: 'Panels', icon: <PanelTop size={18}/> },
    { id: 'obstacles', name: 'Obstacles', icon: <Box size={18}/> },
    { id: 'building', name: 'Building', icon: <Home size={18}/> },
    { id: 'electrical', name: 'Electrical', icon: <Cable size={18}/> },
    { id: 'analysis', name: 'Analysis', icon: <Sun size={18}/> },
  ];
  return (
    <div className="design-studio">
      <header className="design-studio-header">
        {!readOnly && iconButton('Back to 2D', <ArrowLeft size={18}/>, onClose)}
        <div className="design-studio-title"><strong>{project.clientName && project.clientName !== 'New Client' ? project.clientName : 'Solar Designer'}</strong><span>{panels.length} panels · {kwp.toFixed(2)} kWp</span></div>
        <div className="design-studio-actions">
          {!readOnly && <button aria-label="Save design" title="Save design" disabled={saveStatus === 'saving'} onClick={async () => {
            setSaveError('');
            try {
              await useDesignStore.getState().saveToSupabase();
              if (useDesignStore.getState().saveStatus !== 'saved') setSaveError('Could not save. Please try again.');
            } catch { setSaveError('Could not save. Please try again.'); }
          }}><Save size={17}/></button>}
          {iconButton('Export client view', <Download size={17}/>, exportClientView)}
          {iconButton('Properties', <SlidersHorizontal size={17}/>, () => setInspectorOpen(v => !v), inspectorOpen)}
        </div>
      </header>
      <div className="design-studio-body">
        {!readOnly && <nav className="design-studio-rail" aria-label="3D design tools">
          {sections.map(section => <button key={section.id} title={section.name} aria-label={section.name} aria-pressed={toolPanel === section.id} onClick={() => { setToolPanel(section.id); setInspectorOpen(true); }} >{section.icon}<span>{section.name}</span></button>)}
        </nav>}
        <div className="design-studio-viewport">
          <div ref={mountRef} className="design-studio-canvas" style={{cursor: mode === 'drag' ? 'move' : (mode === 'orbit' || mode === 'pan') ? 'grab' : 'crosshair'}}>
            {boxSel && <div style={{ position: 'absolute', border: '1.5px solid var(--design-primary)', background: 'rgba(37,99,235,.1)', left: Math.min(boxSel.x1, boxSel.x2), top: Math.min(boxSel.y1, boxSel.y2), width: Math.abs(boxSel.x2-boxSel.x1), height: Math.abs(boxSel.y2-boxSel.y1), pointerEvents: 'none' }}/>}
          </div>
          {!readOnly && <div className="design-studio-modes" role="toolbar" aria-label="Interaction mode">
            {iconButton('Orbit', <Orbit size={18}/>, () => setMode('orbit'), mode === 'orbit')}
            {iconButton('Pan camera', <Hand size={18}/>, () => setMode('pan'), mode === 'pan')}
            {iconButton('Select panels or obstacle', <MousePointer2 size={18}/>, () => setMode('select'), mode === 'select')}
            {iconButton('Move selection', <Move size={18}/>, () => setMode('drag'), mode === 'drag')}
            {iconButton('Select fill area', <Scan size={18}/>, () => { setMode('zone'); setToolPanel('panels'); setInspectorOpen(true); }, mode === 'zone')}
          </div>}
          <div className="design-studio-camera" role="toolbar" aria-label="Camera">
            {readOnly && iconButton('Pan camera', <Move size={18}/>, () => setMode(v => v === 'pan' ? 'orbit' : 'pan'), mode === 'pan')}
            {iconButton('Zoom in', <ZoomIn size={18}/>, () => zoomCamera(.8))}
            {iconButton('Zoom out', <ZoomOut size={18}/>, () => zoomCamera(1.25))}
            {iconButton('Fit roof', <Maximize size={18}/>, () => frameCamera())}
            {iconButton('Satellite context', <MapIcon size={18}/>, () => setShowSatellite(v => !v), showSatellite)}
            {iconButton('Top view', <Layers size={18}/>, () => frameCamera(true))}
            {iconButton('Perspective view', <Box size={18}/>, () => frameCamera())}
          </div>
        </div>
        <aside className="design-studio-inspector" data-open={inspectorOpen} aria-label="Design properties">
          <header><strong>{readOnly ? 'System overview' : sections.find(s => s.id === toolPanel)?.name}</strong>{iconButton('Close properties', <X size={16}/>, () => setInspectorOpen(false))}</header>
          <div className="design-studio-properties">
          {readOnly ? <><h3>{kwp.toFixed(2)} kWp</h3><p>{panels.length} panels</p><p>{project.address}</p><p>Facing {dirFromAz(panelFacingAz)}</p></> : <>
          {toolPanel === 'panels' && <>
            <details><summary>Module specification</summary>
              <p>{equipment.panelModel || 'No module selected'}</p>
              <NumberField label="Module width (mm)" value={equipment.panelWidth} min={100} max={10000} onChange={v => useDesignStore.getState().updateEquipment({ panelWidth: v })}/>
              <NumberField label="Module length (mm)" value={equipment.panelHeight} min={100} max={10000} onChange={v => useDesignStore.getState().updateEquipment({ panelHeight: v })}/>
              <NumberField label="Module power (W)" value={equipment.panelPower} min={1} max={5000} onChange={v => useDesignStore.getState().updateEquipment({ panelPower: v })}/>
              <label><input type="checkbox" checked={!!equipment.specificationsConfirmed} onChange={e => useDesignStore.getState().updateEquipment({ specificationsConfirmed: e.target.checked })}/> Specifications checked against manufacturer data</label>
              <p>Changes apply to new modules. Existing modules retain their saved specifications.</p>
            </details>          {/* ── Always visible: the one thing every vendor needs ── */}
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--design-navy)', letterSpacing: 0, textTransform: 'uppercase', marginBottom: 8 }}>Design My Roof</div>
          <div style={{ marginBottom: 8 }}>
            <label style={{ fontSize: 10, color: 'var(--design-muted)', display: 'block', marginBottom: 4 }}>Target capacity (kW)</label>
            <input type="number" min={1} max={5000} value={targetKw}
              onChange={e => setTargetKw(Math.max(1, Number(e.target.value)))}
              style={{ width: '100%', padding: '8px', background: 'var(--design-input-bg)', border: '1px solid var(--design-border)', borderRadius: 5, color: 'var(--design-text)', fontSize: 14, fontWeight: 700, textAlign: 'center', boxSizing: 'border-box' }} />
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, padding: '8px 10px', background: forceTrueSouth ? 'var(--design-info-bg)' : 'var(--design-input-bg)', border: `1px solid ${forceTrueSouth ? 'var(--design-info-border)' : 'var(--design-border)'}`, borderRadius: 6, cursor: 'pointer' }}>
            <input type="checkbox" checked={forceTrueSouth} onChange={e => setForceTrueSouth(e.target.checked)} style={{ accentColor: 'var(--design-primary)' }} />
            <span style={{ fontSize: 11, color: 'var(--design-navy)', fontWeight: 600 }}>Force true south</span>
          </label>


          <button onClick={() => autoFillToTarget()} style={{ ...btn('var(--design-navy)'), marginBottom: 6, fontSize: 14, padding: '13px 0' }}>Design My Roof</button>


          {panels.length > 0 && (
            <div style={{ background: 'var(--design-info-bg)', border: '1px solid var(--design-info-border)', borderRadius: 8, padding: 12, marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--design-navy)', marginBottom: 4 }}>{panels.length} panels · {kwp.toFixed(2)} kWp</div>
              <div style={{ fontSize: 11, color: 'var(--design-text-secondary)', lineHeight: 1.5, marginBottom: 10 }}>
                DC nameplate capacity. Energy yield has not been calculated.
              </div>
              <button disabled={!equipmentValid || !equipment.specificationsConfirmed} onClick={alignAllToBuilding} style={{ ...btn('var(--design-navy)'), fontSize: 11.5, marginBottom: 6 }}>Align to roof</button>

              <button onClick={exportClientView} style={{ ...btn('var(--design-primary)'), fontSize: 11.5, marginBottom: 6 }}>Export Client View</button>

              <button onClick={generateQuote} style={{ ...btn('var(--design-primary)'), fontSize: 11.5 }}>Generate Quote</button>

            </div>
          )}

          {/* ── Always visible: fill just one area of the roof (Solar Ladder-style) ── */}
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--design-primary)', letterSpacing: 0, textTransform: 'uppercase', marginBottom: 8 }}>Fill a Specific Area</div>

          {zoneRect ? (
            <div style={{ background: 'var(--design-info-bg)', border: '1px solid var(--design-info-border)', borderRadius: 8, padding: 12, marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--design-navy)', marginBottom: 8 }}>
                Area selected: {Math.abs(zoneRect.x2 - zoneRect.x1).toFixed(1)} × {Math.abs(zoneRect.z2 - zoneRect.z1).toFixed(1)} m
              </div>
              <label style={{ fontSize: 10, color: 'var(--design-muted)', display: 'block', marginBottom: 4 }}>Panels for this area (kW)</label>
              <input type="number" min={0.5} max={500} step={0.5} value={zoneTargetKw}
                onChange={e => setZoneTargetKw(Math.max(0.5, Number(e.target.value)))}
                style={{ width: '100%', padding: '7px', background: 'var(--design-input-bg)', border: '1px solid var(--design-border)', borderRadius: 5, color: 'var(--design-text)', fontSize: 13, fontWeight: 700, textAlign: 'center', boxSizing: 'border-box', marginBottom: 8 }} />
              <div style={{ display: 'flex', gap: 6 }}>
                <button disabled={!equipmentValid || !equipment.specificationsConfirmed} onClick={fillZone} style={{ ...btn('var(--design-primary)'), fontSize: 12 }}>Fill This Area</button>
                <button onClick={clearZone} title="Clear area" aria-label="Clear area" style={{ ...btn('var(--design-input-bg)', 'var(--design-muted)'), border: '1px solid var(--design-border)', flexShrink: 0, width: 'auto', padding: '9px 14px' }}><X size={14}/></button>
              </div>
            </div>
          ) : (
            <div style={{ background: 'var(--design-panel-elevated)', border: '1px solid var(--design-border)', borderRadius: 8, padding: 10, marginBottom: 16, fontSize: 10.5, color: 'var(--design-muted)', textAlign: 'center', lineHeight: 1.5 }}>
              No area selected.
            </div>
          )}

<details><summary>Manual grid</summary>              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--design-text-secondary)', letterSpacing: 0, textTransform: 'uppercase', marginBottom: 12 }}>Manual Grid</div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 10, color: 'var(--design-muted)', display: 'block', marginBottom: 4 }}>Rows</label>
                  <input type="number" min={1} max={50} value={rows} onChange={e => setRows(Math.max(1, Number(e.target.value)))} style={{ width: '100%', padding: '6px 8px', background: 'var(--design-input-bg)', border: '1px solid var(--design-border)', borderRadius: 5, color: 'var(--design-text)', fontSize: 13, textAlign: 'center', boxSizing: 'border-box' }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 8, color: 'var(--design-muted-2)' }}>×</div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 10, color: 'var(--design-muted)', display: 'block', marginBottom: 4 }}>Cols</label>
                  <input type="number" min={1} max={50} value={cols} onChange={e => setCols(Math.max(1, Number(e.target.value)))} style={{ width: '100%', padding: '6px 8px', background: 'var(--design-input-bg)', border: '1px solid var(--design-border)', borderRadius: 5, color: 'var(--design-text)', fontSize: 13, textAlign: 'center', boxSizing: 'border-box' }} />
                </div>
              </div>
              <div style={{ fontSize: 10, color: 'var(--design-muted)', marginBottom: 8 }}>= {rows * cols} panels · {((rows * cols * PANEL_POWER) / 1000).toFixed(2)} kWp · aligned to roof</div>
              <button disabled={!equipmentValid || !equipment.specificationsConfirmed} onClick={generateGrid} style={{ ...btn('var(--design-primary)'), marginBottom: 6 }}>Add {rows}×{cols} Grid</button>
              <button onClick={clearPanels} style={{ ...btn('var(--design-input-bg)', 'var(--design-muted)'), border: '1px solid var(--design-border)', marginBottom: 16 }}>Clear All</button>

</details><details open={selCount > 0}><summary>Panel settings</summary><Slider label="Mounting height" value={MOUNT_H} min={0.3} max={4} color="var(--design-primary)" suffix=" m" onChange={setMountHeight}/>              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--design-text-secondary)', letterSpacing: 0, textTransform: 'uppercase', marginBottom: 8 }}>Selection</div>
              <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                <button onClick={selectAll} style={{ ...btn('var(--design-panel-elevated)', 'var(--design-text-secondary)'), border: '1px solid var(--design-border)', padding: '7px 0', fontSize: 11 }}>Select All</button>
                <button onClick={() => setSelectedIds([])} style={{ ...btn('var(--design-panel-elevated)', 'var(--design-text-secondary)'), border: '1px solid var(--design-border)', padding: '7px 0', fontSize: 11 }}>Deselect</button>
              </div>
              {selCount > 0 && (
                <div style={{ background: 'var(--design-info-bg)', border: '1px solid var(--design-info-border)', borderRadius: 8, padding: 12, marginBottom: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--design-navy)', marginBottom: 10 }}>{selCount} panel{selCount > 1 ? 's' : ''} selected</div>
                  <Slider label="Tilt" value={selTilt} min={0} max={45} color="#0EA5E9" suffix="°" onChange={v => updateSelected('tilt', v)} />
                  <Slider label="Rotate Array" value={Math.round(selAz)} min={0} max={360} color="var(--design-primary)" suffix={`° ${dirFromAz(selAz)}`} onChange={v => updateSelected('azimuth', v)} onDragStart={captureRotateSnapshot} onDragEnd={pruneOutOfBoundsPanels} />

                  <button onClick={deleteSelected} style={btn('var(--design-danger-solid)')}>Delete Selected</button>
                </div>
              )}
              {selCount === 0 && (
                <div style={{ background: 'var(--design-panel-elevated)', border: '1px solid var(--design-border)', borderRadius: 8, padding: 12, marginBottom: 14, fontSize: 11, color: 'var(--design-muted)', textAlign: 'center', lineHeight: 1.5 }}>
                  No panels selected.
                </div>
              )}

              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--design-text-secondary)', letterSpacing: 0, textTransform: 'uppercase', marginBottom: 10 }}>Default Tilt / Azimuth</div>
              <Slider label="Tilt" value={globalTilt} min={0} max={45} color="#0EA5E9" suffix="°" onChange={setGlobalTilt} />
              <Slider label="Azimuth" value={globalAzimuth} min={0} max={360} color="var(--design-primary)" suffix={`° ${dirFromAz(globalAzimuth)}`} onChange={setGlobalAzimuth} />
              <button onClick={applyGlobalToAll} style={{ ...btn('var(--design-primary)'), marginBottom: 6 }}>Apply to All Panels</button>
              <button onClick={() => { setGlobalTilt(15); setGlobalAzimuth(optimalAzimuth); }} style={btn('var(--design-navy)')}>Optimal ({optimalAzimuth === 180 ? 'S' : 'N'}, 15°)</button>

              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--design-text-secondary)', letterSpacing: 0, textTransform: 'uppercase', marginBottom: 8 }}>Row Spacing</div>
              <Slider label="Gap Between Rows" value={Number(rowGapM.toFixed(1))} min={0.3} max={3} color="#0EA5E9" suffix=" m" onChange={setRowGapM} />

              <div style={{ height: 8 }} />

</details></>}
          {toolPanel === 'obstacles' && <>          {/* ── Always visible: obstacle marking, needed for accuracy by everyone ── */}
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--design-obstacle-text)', letterSpacing: 0, textTransform: 'uppercase', marginBottom: 8 }}>Mark Roof Obstacles</div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 10 }}>
            {(['AC Unit', 'Water Tank', 'Skylight', 'Staircase', 'Vent'] as const).map(label => (
              <button key={label} onClick={() => addObstacleAtCenter(label)}
                style={{ padding: '7px 4px', borderRadius: 6, border: '1px solid var(--design-obstacle-border)', background: 'var(--design-obstacle-bg)', color: 'var(--design-obstacle-text)', fontSize: 10.5, fontWeight: 600, cursor: 'pointer' }}>
                + {label}
              </button>
            ))}
          </div>
          {selectedObstacle ? (
            <div style={{ background: 'var(--design-obstacle-bg)', border: '1px solid var(--design-obstacle-border)', borderRadius: 8, padding: 12, marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--design-obstacle-text)', marginBottom: 10 }}>{selectedObstacle.label} selected</div>
              <NumberField label="Obstacle height (m)" value={selectedObstacle.heightM ?? defaultObstacleHeight(selectedObstacle.label)} min={0.1} max={30} onChange={v => updateObstacle(selectedObstacle.id, { heightM: v })}/>
              <Slider label="Width" value={Number(selectedObstacle.w.toFixed(2))} min={0.3} max={5} color="var(--design-obstacle-text)" suffix=" m" onChange={v => updateObstacle(selectedObstacle.id, { w: v })} />
              <Slider label="Depth" value={Number(selectedObstacle.d.toFixed(2))} min={0.3} max={5} color="var(--design-obstacle-text)" suffix=" m" onChange={v => updateObstacle(selectedObstacle.id, { d: v })} />
              <Slider label="Rotation" value={Math.round(selectedObstacle.rotDeg)} min={0} max={360} color="var(--design-primary)" suffix="°" onChange={v => updateObstacle(selectedObstacle.id, { rotDeg: v })} />

              <button onClick={() => deleteObstacle(selectedObstacle.id)} style={btn('var(--design-danger-solid)')}>Delete Obstacle</button>
            </div>
          ) : (
            <div style={{ background: 'var(--design-panel-elevated)', border: '1px solid var(--design-border)', borderRadius: 8, padding: 10, marginBottom: 16, fontSize: 10.5, color: 'var(--design-muted)', textAlign: 'center', lineHeight: 1.5 }}>
              No obstacle selected.
            </div>
          )}

            <div className="design-obstacle-list">{obstacles.map(o => <button key={o.id} aria-pressed={selectedObstacleId === o.id} onClick={() => { setSelectedObstacleId(o.id); setMode('drag'); }}><Box size={14}/>{o.label}<span>{o.w.toFixed(1)} × {o.d.toFixed(1)} m</span></button>)}</div>
          </>}
          {toolPanel === 'building' && <>
            <fieldset className="design-accuracy-fields"><legend>Site inputs</legend>
              <label>Roof surface<select aria-label="Roof surface" value={currentRoof?.slope === 0 ? 'flat' : 'unsupported'} onChange={() => useDesignStore.getState().updateRoof(roofId, { slope: 0 })}><option value="flat">Flat terrace</option><option value="unsupported" disabled>Sloped roof: analysis unsupported</option></select></label>
              <NumberField label="Parapet height (m)" value={parapetHeightM} min={0} max={5} onChange={v => useDesignStore.getState().updateRoof(roofId, { design3D: { ...roofSettings, parapetHeightM: v } })}/>
              <NumberField label="Roof setback (m)" value={setbackM} min={0} max={10} onChange={v => useDesignStore.getState().updateRoof(roofId, { design3D: { ...roofSettings, setbackM: v } })}/>
              <label>Roof finish<select aria-label="Roof finish" value={roofSettings?.roofMaterial ?? 'concrete'} onChange={e => useDesignStore.getState().updateRoof(roofId, { design3D: { ...roofSettings, roofMaterial: e.target.value as 'concrete' | 'coating' } })}><option value="concrete">Concrete</option><option value="coating">Waterproof coating</option></select></label>
              <label><input type="checkbox" checked={!!roofSettings?.measurementsConfirmed} onChange={e => useDesignStore.getState().updateRoof(roofId, { design3D: { ...roofSettings, measurementsConfirmed: e.target.checked } })}/> Site dimensions and heights checked</label>
              <p>Satellite tracing is not a site survey. Support members are illustrative.</p>
            </fieldset>              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--design-text-secondary)', letterSpacing: 0, textTransform: 'uppercase', marginBottom: 8 }}>Building Height</div>
              <Slider label="Height" value={wallHeightM} min={2} max={30} color="#0EA5E9" suffix="m" onChange={setWallHeightM} />
              <div style={{ height: 8 }} />

<Slider label="Mounting height" value={MOUNT_H} min={0.3} max={4} color="var(--design-primary)" suffix=" m" onChange={setMountHeight}/><p>Roof {roofDims.widthM.toFixed(1)} × {roofDims.heightM.toFixed(1)} m</p></>}
          {toolPanel === 'electrical' && <>              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--design-text-secondary)', letterSpacing: 0, textTransform: 'uppercase', marginBottom: 8 }}>Electrical Strings</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 8 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 10, color: 'var(--design-muted)', display: 'block', marginBottom: 4 }}>Panels per string</label>
                  <input type="number" min={1} max={30} value={stringSize}
                    onChange={e => setStringSize(Math.max(1, Number(e.target.value)))}
                    style={{ width: '100%', padding: '6px 8px', background: 'var(--design-input-bg)', border: '1px solid var(--design-border)', borderRadius: 5, color: 'var(--design-text)', fontSize: 13, textAlign: 'center', boxSizing: 'border-box' }} />
                </div>
                <button onClick={() => setShowStrings(s => !s)} style={{ padding: '7px 12px', borderRadius: 6, border: `1px solid ${showStrings ? 'var(--design-primary)' : 'var(--design-border)'}`, background: showStrings ? 'var(--design-info-bg)' : 'var(--design-input-bg)', color: showStrings ? 'var(--design-navy)' : 'var(--design-muted)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                  {showStrings ? 'Colors On' : 'Show Colors'}
                </button>
              </div>
              {panels.length > 0 ? (
                <div style={{ maxHeight: 160, overflowY: 'auto', marginBottom: 10 }}>
                  {stringBreakdown.map(s => (
                    <div key={s.string} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', borderRadius: 5, marginBottom: 3, background: 'var(--design-input-bg)' }}>
                      <div style={{ width: 10, height: 10, borderRadius: 3, background: s.color, flexShrink: 0 }} />
                      <span style={{ fontSize: 11, color: 'var(--design-text)', fontWeight: 600 }}>String {s.string}</span>
                      <span style={{ fontSize: 10, color: 'var(--design-muted-2)', marginLeft: 'auto' }}>{s.count} panels · {s.kwp.toFixed(2)} kWp</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: 10, color: 'var(--design-muted-2)', marginBottom: 10 }}>No panels yet — design the roof first.</div>
              )}


</>}
          {toolPanel === 'analysis' && <>
            <fieldset className="design-accuracy-fields"><legend>Analysis inputs</legend>
              {dataIssues.map(issue => <p key={issue} role="note">{issue}</p>)}
              <label>Period<select aria-label="Analysis period" value={analysisPeriod} onChange={e => setAnalysisPeriod(e.target.value as 'instant' | 'day')}><option value="instant">Selected time</option><option value="day">Selected day (30-minute samples)</option></select></label>
              <p>Active roof only. 9 surface samples per module. Equal-weight geometric shading, not energy loss. Obstacles use their entered obstruction envelopes; decorative steps, railings and equipment details are illustrative. Unmodelled neighbours, trees and mounting hardware are excluded.</p>
              {unlitCount > 0 && <p>{unlitCount} modules have no front-side direct sun in this period.</p>}
              {runningShading && <button onClick={() => { shadingController.current?.abort(); setRunningShading(false); }}>Cancel analysis</button>}
            </fieldset>              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--design-text-secondary)', letterSpacing: 0, textTransform: 'uppercase', marginBottom: 8 }}>Shading Analysis</div>
              <button onClick={runShadingAnalysis} disabled={runningShading || panels.length === 0 || analysisBlocked} style={{ ...btn(runningShading ? 'var(--design-muted-2)' : 'var(--design-navy)'), marginBottom: 8, cursor: runningShading ? 'not-allowed' : 'pointer' }}>
                {runningShading ? `Checking ${analysisProgress}%` : 'Run Shading Analysis'}
              </button>


              {shadingSummary && (
                <div style={{ background: shadingSummary.shadedCount > 0 ? 'var(--design-warning-bg)' : 'var(--design-success-bg)', border: `1px solid ${shadingSummary.shadedCount > 0 ? 'var(--design-warning-border)' : 'var(--design-success-border)'}`, borderRadius: 8, padding: 12, marginBottom: 10 }}>
                  {shadingSummary.shadedCount > 0 ? (
                    <>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--design-warning-text)', marginBottom: 4 }}>⚠ {shadingSummary.shadedCount} of {shadingSummary.totalPanels} panels affected</div>
                      <div style={{ fontSize: 11, color: 'var(--design-warning-text)', lineHeight: 1.5 }}>
                        Sampled shading: {(shadingSummary.avgLossAcrossShaded * 100).toFixed(0)}% on affected panels
                      </div>
                    </>
                  ) : (
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--design-success-text)' }}>No meaningful shading detected on this layout</div>
                  )}
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, cursor: 'pointer' }}>
                    <input type="checkbox" checked={highlightShading} onChange={e => setHighlightShading(e.target.checked)} />
                    <span style={{ fontSize: 10.5, color: 'var(--design-muted)' }}>Highlight shaded panels (red = heavy, amber = mild)</span>
                  </label>
                </div>
              )}

<p>Sun azimuth {Math.round(liveSun.azimuth)}° · Elevation {Math.round(liveSun.elevation)}°</p></>}
          </>}
          </div>
        </aside>
      </div>
      {(designNotice || invalidPanelIds.size > 0) && <div className="design-validation-message" role="alert"><span>{designNotice || `${invalidPanelIds.size} invalid panel placements. Export and analysis are blocked.`}</span><button aria-label="Dismiss message" onClick={() => setDesignNotice('')}><X size={14}/></button></div>}
      <footer className="design-studio-sun">
        {iconButton(animating ? 'Pause sun' : 'Play sun', animating ? <Pause size={16}/> : <Play size={16}/>, () => setAnimating(v => !v))}
        <label htmlFor="design-sun-hour">{Math.floor(hour)}:{String(Math.round(hour % 1 * 60)).padStart(2, '0')}</label>
        <input id="design-sun-hour" aria-label="Sun time" type="range" min={0} max={23.75} step={.25} value={hour} onChange={e => {setHour(Number(e.target.value));setAnimating(false);}}/>
        <input aria-label="Analysis date" type="date" value={analysisDate} onChange={e => { if (e.target.value) setAnalysisDate(e.target.value); }}/><span className="design-timezone">IST (UTC+05:30)</span>
        <span role="status">{saveError || (readOnly ? 'Client view' : saveStatus === 'saved' ? 'Saved' : saveStatus === 'saving' ? 'Saving...' : 'Unsaved changes')}</span>
      </footer>
    </div>
  );
}

function Slider({ label, value, min, max, color, suffix, onChange, onDragStart, onDragEnd }: { label: string; value: number; min: number; max: number; color: string; suffix: string; onChange: (v: number) => void; onDragStart?: () => void; onDragEnd?: () => void }) {
  const id = useId();
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <label htmlFor={id} style={{ fontSize: 11, color: 'var(--design-muted)' }}>{label}</label>
        <span style={{ fontSize: 11, color, fontWeight: 700 }}>{value}{suffix}</span>
      </div>
      <input
        id={id} type="range" min={min} max={max} step={Number.isInteger(min) ? 1 : 0.1} value={value}
        onChange={e => onChange(Number(e.target.value))}
        onPointerDown={onDragStart}
        onPointerUp={onDragEnd}
        style={{ width: '100%', accentColor: color }}
      />
    </div>
  );
}
function NumberField({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (n: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const number = Number(draft);
    if (draft.trim() && Number.isFinite(number) && number >= min && number <= max) onChange(number);
    else setDraft(String(value));
  };
  return <label className="design-number-field">{label}<input type="number" min={min} max={max} step="any" value={draft} onChange={e => setDraft(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}/></label>;
}
