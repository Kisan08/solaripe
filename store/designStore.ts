import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import {
  ToolType, RoofPolygon, Obstacle, SolarPanel, Walkway,
  Point, ProjectInfo, Equipment, HistoryEntry, MapConfig
} from '../types';
import { saveDesign, loadDesign } from '../lib/designs';

const MAX_HISTORY = 50;

// ─────────────────────────────────────────────────────────────
// REAL-WORLD SCALE
// Google Maps ground resolution depends on zoom level + latitude.
// This is the single source of truth for px ↔ meter conversion.
// ─────────────────────────────────────────────────────────────
export function metersPerPixel(lat: number, zoom: number): number {
  return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom);
}

export function pixelsPerMeter(lat: number, zoom: number): number {
  return 1 / metersPerPixel(lat, zoom);
}

interface DesignStore {
  activeTool: ToolType;
  setActiveTool: (t: ToolType) => void;

  showGrid: boolean;
  snapEnabled: boolean;
  toggleGrid: () => void;
  toggleSnap: () => void;

  scale: number;
  offset: Point;
  setScale: (s: number) => void;
  setOffset: (o: Point) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  fitToScreen: () => void;

  roofs: RoofPolygon[];
  obstacles: Obstacle[];
  panels: SolarPanel[];
  walkways: Walkway[];

  selectedIds: string[];
  setSelectedIds: (ids: string[]) => void;
  toggleSelected: (id: string) => void;
  clearSelection: () => void;

  drawingPoints: Point[];
  setDrawingPoints: (pts: Point[]) => void;
  addDrawingPoint: (pt: Point) => void;
  clearDrawing: () => void;

  addRoof: (roof: RoofPolygon) => void;
  updateRoof: (id: string, patch: Partial<RoofPolygon>) => void;
  removeRoof: (id: string) => void;

  addObstacle: (obs: Obstacle) => void;
  updateObstacle: (id: string, patch: Partial<Obstacle>) => void;
  removeObstacle: (id: string) => void;

  addPanel: (panel: SolarPanel) => void;
  addPanels: (panels: SolarPanel[]) => void;
  updatePanel: (id: string, patch: Partial<SolarPanel>) => void;
  removePanel: (id: string) => void;
  removePanels: (ids: string[]) => void;

  addWalkway: (w: Walkway) => void;

  autoFillRoof: (roofId: string, equipment: Equipment) => void;

  history: HistoryEntry[];
  historyIndex: number;
  pushHistory: () => void;
  undo: () => void;
  redo: () => void;

  project: ProjectInfo;
  updateProject: (patch: Partial<ProjectInfo>) => void;
  equipment: Equipment;
  updateEquipment: (patch: Partial<Equipment>) => void;

  mapConfig: MapConfig;
  updateMapConfig: (patch: Partial<MapConfig>) => void;

  // Building height (meters) for the 3D extrusion — was previously local-only
  // state inside SolarDesign3D, so it never got saved. Now lives in the store
  // so it persists through saveToSupabase/loadFromSupabase like everything else.
  wallHeightM: number;
  setWallHeightM: (h: number) => void;

  // Convenience: current px/m derived from live mapConfig
  getPixelsPerMeter: () => number;

  cursorPos: Point;
  setCursorPos: (p: Point) => void;

  saveStatus: 'saved' | 'unsaved' | 'saving';
  setSaveStatus: (s: 'saved' | 'unsaved' | 'saving') => void;

  projectId: string | null;
  setProjectId: (id: string) => void;
  saveToSupabase: () => Promise<void>;
  loadFromSupabase: (projectId: string) => Promise<void>;
}

function computeStats(roofs: RoofPolygon[], panels: SolarPanel[], equipment: Equipment) {
  const totalRoofArea = roofs.reduce((a, r) => a + (r.area || 0), 0);
  const panelArea = panels.length * (equipment.panelWidth / 1000) * (equipment.panelHeight / 1000);
  const roofUtilization = totalRoofArea > 0 ? Math.min(100, (panelArea / totalRoofArea) * 100) : 0;
  const dcCapacity = (panels.length * equipment.panelPower) / 1000;
  const annualGeneration = dcCapacity * 1332;
  const co2 = annualGeneration * 0.71;
  return { dcCapacity, roofUtilization, annualGeneration, co2 };
}

export const useDesignStore = create<DesignStore>()(
  immer((set, get) => ({
    activeTool: 'select',
    setActiveTool: (t) => set({ activeTool: t }),

    showGrid: false,
    snapEnabled: true,
    toggleGrid: () => set((s) => { s.showGrid = !s.showGrid; }),
    toggleSnap: () => set((s) => { s.snapEnabled = !s.snapEnabled; }),

    scale: 1,
    offset: { x: 0, y: 0 },
    setScale: (scale) => set({ scale }),
    setOffset: (offset) => set({ offset }),
    zoomIn: () => set((s) => { s.scale = Math.min(s.scale * 1.2, 10); }),
    zoomOut: () => set((s) => { s.scale = Math.max(s.scale / 1.2, 0.1); }),
    fitToScreen: () => set({ scale: 1, offset: { x: 0, y: 0 } }),

    roofs: [],
    obstacles: [],
    panels: [],
    walkways: [],

    selectedIds: [],
    setSelectedIds: (ids) => set({ selectedIds: ids }),
    toggleSelected: (id) => set((s) => {
      const idx = s.selectedIds.indexOf(id);
      if (idx >= 0) s.selectedIds.splice(idx, 1);
      else s.selectedIds.push(id);
    }),
    clearSelection: () => set({ selectedIds: [] }),

    drawingPoints: [],
    setDrawingPoints: (pts) => set({ drawingPoints: pts }),
    addDrawingPoint: (pt) => set((s) => { s.drawingPoints.push(pt); }),
    clearDrawing: () => set({ drawingPoints: [] }),

    addRoof: (roof) => {
      get().pushHistory();
      set((s) => { s.roofs.push(roof); s.saveStatus = 'unsaved'; });
    },
    updateRoof: (id, patch) => set((s) => {
      const r = s.roofs.find(r => r.id === id);
      if (r) Object.assign(r, patch);
      s.saveStatus = 'unsaved';
    }),
    removeRoof: (id) => {
      get().pushHistory();
      set((s) => {
        s.roofs = s.roofs.filter(r => r.id !== id);
        s.panels = s.panels.filter(p => p.roofId !== id);
        s.saveStatus = 'unsaved';
      });
    },

    addObstacle: (obs) => {
      get().pushHistory();
      set((s) => { s.obstacles.push(obs); s.saveStatus = 'unsaved'; });
    },
    updateObstacle: (id, patch) => set((s) => {
      const o = s.obstacles.find(o => o.id === id);
      if (o) Object.assign(o, patch);
      s.saveStatus = 'unsaved';
    }),
    removeObstacle: (id) => {
      get().pushHistory();
      set((s) => { s.obstacles = s.obstacles.filter(o => o.id !== id); s.saveStatus = 'unsaved'; });
    },

    addPanel: (panel) => set((s) => { s.panels.push(panel); s.saveStatus = 'unsaved'; }),
    addPanels: (panels) => {
      get().pushHistory();
      set((s) => { panels.forEach(p => s.panels.push(p)); s.saveStatus = 'unsaved'; });
    },
    updatePanel: (id, patch) => set((s) => {
      const p = s.panels.find(p => p.id === id);
      if (p) Object.assign(p, patch);
      s.saveStatus = 'unsaved';
    }),
    removePanel: (id) => {
      get().pushHistory();
      set((s) => { s.panels = s.panels.filter(p => p.id !== id); s.saveStatus = 'unsaved'; });
    },
    removePanels: (ids) => {
      get().pushHistory();
      const idSet = new Set(ids);
      set((s) => { s.panels = s.panels.filter(p => !idSet.has(p.id)); s.saveStatus = 'unsaved'; });
    },

    addWalkway: (w) => set((s) => { s.walkways.push(w); }),

    autoFillRoof: (roofId, equipment) => {
      const { roofs, mapConfig } = get();
      const roof = roofs.find(r => r.id === roofId);
      if (!roof || roof.points.length < 3) return;

      // Real-world panel footprint converted to canvas pixels at the
      // CURRENT map zoom — no more fixed 15×30px panels.
      const ppm = pixelsPerMeter(mapConfig.center.lat, mapConfig.zoom);
      const panelWpx = (equipment.panelWidth / 1000) * ppm;   // 1.134 m
      const panelHpx = (equipment.panelHeight / 1000) * ppm;  // 2.278 m
      const gapXpx = 0.15 * ppm; // 15 cm walkway gap between columns
      const gapYpx = 0.25 * ppm; // 25 cm row spacing

      const xs = roof.points.map(p => p.x);
      const ys = roof.points.map(p => p.y);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);

      const pw = panelWpx + gapXpx;
      const ph = panelHpx + gapYpx;
      const cols = Math.floor((maxX - minX) / pw);
      const rows = Math.floor((maxY - minY) / ph);

      const newPanels: SolarPanel[] = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const cx = minX + c * pw + panelWpx / 2;
          const cy = minY + r * ph + panelHpx / 2;
          if (pointInPolygon({ x: cx, y: cy }, roof.points)) {
            newPanels.push({
              id: `panel-${Date.now()}-${r}-${c}`,
              type: 'panel',
              x: cx,
              y: cy,
              width: panelWpx,
              height: panelHpx,
              rotation: 0,
              orientation: 'portrait',
              manufacturer: equipment.panelModel.split(' ')[0] || 'Waaree',
              model: equipment.panelModel,
              power: equipment.panelPower,
              tilt: 15,
              stringNumber: Math.floor((r * cols + c) / 12) + 1,
              roofId,
            });
          }
        }
      }

      get().pushHistory();
      set((s) => {
        newPanels.forEach(p => s.panels.push(p));
        s.saveStatus = 'unsaved';
      });
    },

    history: [],
    historyIndex: -1,
    pushHistory: () => set((s) => {
      const entry: HistoryEntry = {
        roofs: JSON.parse(JSON.stringify(s.roofs)),
        obstacles: JSON.parse(JSON.stringify(s.obstacles)),
        panels: JSON.parse(JSON.stringify(s.panels)),
        walkways: JSON.parse(JSON.stringify(s.walkways)),
      };
      s.history = s.history.slice(0, s.historyIndex + 1);
      s.history.push(entry);
      if (s.history.length > MAX_HISTORY) s.history.shift();
      s.historyIndex = s.history.length - 1;
    }),
    undo: () => set((s) => {
      if (s.historyIndex <= 0) return;
      s.historyIndex--;
      const entry = s.history[s.historyIndex];
      s.roofs = entry.roofs;
      s.obstacles = entry.obstacles;
      s.panels = entry.panels;
      s.walkways = entry.walkways;
    }),
    redo: () => set((s) => {
      if (s.historyIndex >= s.history.length - 1) return;
      s.historyIndex++;
      const entry = s.history[s.historyIndex];
      s.roofs = entry.roofs;
      s.obstacles = entry.obstacles;
      s.panels = entry.panels;
      s.walkways = entry.walkways;
    }),

    project: {
      clientName: 'New Client',
      address: 'Enter address...',
      roofArea: 0,
      usableArea: 0,
      totalPanels: 0,
      dcCapacity: 0,
      acCapacity: 0,
    },
    updateProject: (patch) => set((s) => { Object.assign(s.project, patch); }),

    equipment: {
      panelModel: 'Waaree WS-580 TOPCon',
      panelPower: 580,
      panelWidth: 1134,
      panelHeight: 2278,
      inverter: 'Waaree String 10kW',
      mountingType: 'Ballast / Flush',
    },
    updateEquipment: (patch) => set((s) => { Object.assign(s.equipment, patch); }),

    mapConfig: {
      center: { lat: 19.2403, lng: 73.1305 },
      zoom: 20,
      mapTypeId: 'satellite',
    },
    updateMapConfig: (patch) => set((s) => { Object.assign(s.mapConfig, patch); }),

    wallHeightM: 4,
    setWallHeightM: (h) => set((s) => { s.wallHeightM = h; s.saveStatus = 'unsaved'; }),

    getPixelsPerMeter: () => {
      const mc = get().mapConfig;
      return pixelsPerMeter(mc.center.lat, mc.zoom);
    },

    cursorPos: { x: 0, y: 0 },
    setCursorPos: (p) => set({ cursorPos: p }),

    saveStatus: 'saved',
    setSaveStatus: (s) => set({ saveStatus: s }),

    projectId: null,
    setProjectId: (id) => set({ projectId: id }),

    saveToSupabase: async () => {
      const { projectId, roofs, obstacles, panels, walkways, project, equipment, mapConfig, wallHeightM } = get();
      if (!projectId) {
        console.warn('No projectId set — cannot save design');
        return;
      }
      set({ saveStatus: 'saving' });
      const { error } = await saveDesign({
        projectId, roofs, obstacles, panels, walkways,
        projectInfo: project, equipment, mapConfig,
        wallHeightM, // NEW — was previously local-only state, never saved
      });
      set({ saveStatus: error ? 'unsaved' : 'saved' });
    },

    loadFromSupabase: async (projectId) => {
      console.log('Loading design for projectId:', projectId);
      const { design, error } = await loadDesign(projectId);
      console.log('Load result — design:', design, 'error:', error);
      if (error) {
        console.error('Failed to load design:', error);
        return;
      }
      if (design) {
        console.log('Setting state from design:', design.roofs?.length, 'roofs,', design.panels?.length, 'panels');
        set({
          projectId,
          roofs: design.roofs,
          obstacles: design.obstacles,
          panels: design.panels,
          walkways: design.walkways,
          project: { ...get().project, ...design.project_info },
          equipment: { ...get().equipment, ...design.equipment },
          mapConfig: { ...get().mapConfig, ...design.map_config },
          wallHeightM: design.wall_height_m ?? 4, // NEW — fall back to default for designs saved before this field existed
          saveStatus: 'saved',
        });
      } else {
        console.log('No design found for this projectId — starting blank');
        set({ projectId, saveStatus: 'saved' });
      }
    },
  }))
);

function pointInPolygon(point: Point, polygon: Point[]): boolean {
  let inside = false;
  const n = polygon.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    const intersect = ((yi > point.y) !== (yj > point.y)) &&
      (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}