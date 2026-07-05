'use client';
import React, { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import { Stage, Layer, Line, Rect, Circle, Text, Group, Transformer } from 'react-konva';
import Konva from 'konva';
import { useDesignStore } from '../../store/designStore';
import { Point, RoofPolygon, Obstacle, SolarPanel } from '../../types';
import {
  generateId, polygonArea, pxToM2, snapPoint,
  pointInPolygon, polygonCentroid, sceneMetersPerPixel,
} from '../../utils/geometry';

const GRID_SIZE = 20;

// Math.max(NaN, 0.5) returns NaN, not 0.5 — so a plain Math.max clamp does
// NOTHING to protect against a corrupted/invalid/undefined stored value.
// This is what let a degenerate obstacle slip through the earlier "fix" and
// still crash Konva's opacity-compositing with a 0-size canvas. Use this
// everywhere a Rect's width/height comes from stored or computed data.
function safeSize(v: number, min = 0.5): number {
  return typeof v === 'number' && isFinite(v) && v > 0 ? Math.max(v, min) : min;
}
// Real Waaree 580W footprint (meters) — converted to scene px at trace-time scale
const PANEL_W_M = 1.134;
const PANEL_H_M = 2.278;

// Realistic default footprints (meters) used when the obstacle tool is used
// as a quick click (no meaningful drag) — a rooftop AC unit, water tank,
// skylight, staircase head, or vent all have typical real-world sizes.
const DEFAULT_OBSTACLE_SIZE_M: Record<string, { w: number; d: number }> = {
  'AC Unit': { w: 1.0, d: 0.7 },
  'Water Tank': { w: 1.5, d: 1.5 },
  'Skylight': { w: 1.2, d: 1.8 },
  'Staircase': { w: 2.2, d: 2.2 },
  'Vent': { w: 0.5, d: 0.5 },
};
const DRAG_THRESHOLD_M = 0.3; // below this, treat the gesture as a click, not a drag

// ─── Grid ───────────────────────────────────────────────────────────────────
const GridLayer = React.memo(({ width, height, scale, offset }: {
  width: number; height: number; scale: number; offset: Point;
}) => {
  const lines: React.ReactElement[] = [];
  const step = GRID_SIZE;
  const startX = Math.floor(-offset.x / scale / step) * step;
  const startY = Math.floor(-offset.y / scale / step) * step;
  const cols = Math.ceil(width / scale / step) + 2;
  const rows = Math.ceil(height / scale / step) + 2;

  for (let i = 0; i <= cols; i++) {
    const x = startX + i * step;
    lines.push(<Line key={`vg${i}`} points={[x, startY, x, startY + rows * step]}
      stroke="#1E293B" strokeWidth={0.5 / scale} />);
  }
  for (let j = 0; j <= rows; j++) {
    const y = startY + j * step;
    lines.push(<Line key={`hg${j}`} points={[startX, y, startX + cols * step, y]}
      stroke="#1E293B" strokeWidth={0.5 / scale} />);
  }
  return <>{lines}</>;
});
GridLayer.displayName = 'GridLayer';

// ─── Roof polygon ────────────────────────────────────────────────────────────
const RoofShape = React.memo(({ roof, isSelected, onClick, onVertexDrag }: {
  roof: RoofPolygon;
  isSelected: boolean;
  onClick: (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => void;
  onVertexDrag: (vertexIdx: number, pt: Point) => void;
}) => {
  const flat = roof.points.flatMap(p => [p.x, p.y]);
  const centroid = useMemo(() => polygonCentroid(roof.points), [roof.points]);
  // Show the STORED area (computed with the scale captured at trace time)
  const areaM2 = roof.area || 0;

  return (
    <Group>
      <Line
        points={flat}
        closed
        fill={roof.color + Math.round(roof.opacity * 255).toString(16).padStart(2, '0')}
        stroke={isSelected ? '#3B82F6' : '#93C5FD'}
        strokeWidth={isSelected ? 2 : 1}
        onClick={onClick}
        onTap={onClick}
        hitStrokeWidth={8}
      />
      {/* Area label */}
      <Text
        x={centroid.x - 24} y={centroid.y - 8}
        text={`${areaM2.toFixed(1)} m²`}
        fontSize={10}
        fill="#93C5FD"
        listening={false}
      />
      {/* Vertices — always shown so the outline is always editable */}
      {roof.points.map((pt, i) => (
        <Circle
          key={i}
          x={pt.x} y={pt.y}
          radius={isSelected ? 7 : 5}
          fill={isSelected ? '#2563EB' : '#3B82F6'}
          stroke="#fff"
          strokeWidth={2}
          draggable
          hitStrokeWidth={12}
          onDragMove={e => onVertexDrag(i, { x: e.target.x(), y: e.target.y() })}
          onMouseEnter={() => { document.body.style.cursor = 'grab'; }}
          onMouseLeave={() => { document.body.style.cursor = 'default'; }}
          onMouseDown={e => { e.cancelBubble = true; }}
        />
      ))}
    </Group>
  );
});
RoofShape.displayName = 'RoofShape';

// ─── Obstacle ────────────────────────────────────────────────────────────────
const ObstacleShape = React.memo(({ obs, isSelected, onSelect, onDrag }: {
  obs: Obstacle; isSelected: boolean;
  onSelect: (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => void;
  onDrag: (x: number, y: number) => void;
}) => {
  // Compute the safe size ONCE and reuse it for position AND size — using
  // safeSize only on the width/height props (as before) while x/y still
  // divided the RAW obs.width/height meant a NaN obs.width still produced a
  // NaN position, even with a perfectly valid clamped size. A NaN position
  // still gives Konva a degenerate bounding box internally.
  const w = safeSize(obs.width);
  const h = safeSize(obs.height);
  return (
    <Group
      x={obs.x} y={obs.y}
      rotation={obs.rotation}
      draggable
      onClick={onSelect}
      onTap={onSelect}
      onDragEnd={e => onDrag(e.target.x(), e.target.y())}
      onMouseEnter={() => { document.body.style.cursor = 'move'; }}
      onMouseLeave={() => { document.body.style.cursor = 'default'; }}
    >
      <Rect
        x={-w / 2} y={-h / 2}
        width={w} height={h}
        fill="#F97316" opacity={0.35}
        stroke={isSelected ? '#F97316' : '#EA580C'}
        strokeWidth={isSelected ? 2 : 1}
      />
      <Text
        x={-w / 2 + 3} y={-h / 2 + 3}
        text={obs.label}
        fontSize={9}
        fill="#FED7AA"
        listening={false}
      />
    </Group>
  );
});
ObstacleShape.displayName = 'ObstacleShape';

// ─── Solar Panel ─────────────────────────────────────────────────────────────
const PanelShape = React.memo(({ panel, isSelected, onSelect, onDrag }: {
  panel: SolarPanel; isSelected: boolean;
  onSelect: (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => void;
  onDrag: (x: number, y: number) => void;
}) => {
  const w = panel.orientation === 'landscape' ? panel.height : panel.width;
  const h = panel.orientation === 'landscape' ? panel.width : panel.height;

  return (
    <Group
      x={panel.x} y={panel.y}
      rotation={panel.rotation}
      draggable={isSelected}
      onClick={onSelect}
      onTap={onSelect}
      onDragEnd={e => onDrag(e.target.x(), e.target.y())}
      onMouseEnter={() => { document.body.style.cursor = 'pointer'; }}
      onMouseLeave={() => { document.body.style.cursor = 'default'; }}
    >
      <Rect
        x={-w / 2} y={-h / 2}
        width={w} height={h}
        fill={isSelected ? '#1D4ED8' : '#1E3A5F'}
        stroke={isSelected ? '#60A5FA' : '#3B82F6'}
        strokeWidth={isSelected ? 1.5 : 0.5}
      />
      {/* Cell lines */}
      {[0.33, 0.67].map(frac => (
        <React.Fragment key={frac}>
          <Line points={[-w / 2 + frac * w, -h / 2, -w / 2 + frac * w, h / 2]}
            stroke="#2563EB" strokeWidth={0.5} listening={false} opacity={0.6} />
          <Line points={[-w / 2, -h / 2 + frac * h, w / 2, -h / 2 + frac * h]}
            stroke="#2563EB" strokeWidth={0.5} listening={false} opacity={0.6} />
        </React.Fragment>
      ))}
    </Group>
  );
});
PanelShape.displayName = 'PanelShape';

// ─── Drawing preview ─────────────────────────────────────────────────────────
function DrawingPreview({ points, mousePos, tool }: {
  points: Point[]; mousePos: Point | null; tool: string;
}) {
  if (points.length === 0) return null;
  const preview = mousePos ? [...points, mousePos] : points;
  const flat = preview.flatMap(p => [p.x, p.y]);

  return (
    <Group>
      <Line
        points={flat}
        closed={false}
        stroke="#3B82F6"
        strokeWidth={1.5}
        dash={[6, 3]}
        listening={false}
      />
      {points.map((pt, i) => (
        <Circle key={i} x={pt.x} y={pt.y} radius={4}
          fill="#3B82F6" stroke="#fff" strokeWidth={1} listening={false} />
      ))}
    </Group>
  );
}

// ─── Main Canvas ─────────────────────────────────────────────────────────────
interface DesignCanvasProps {
  width: number;
  height: number;
  mapElement?: React.ReactNode;
}

export function DesignCanvas({ width, height, mapElement }: DesignCanvasProps) {
  const {
    activeTool, scale, offset, setScale, setOffset,
    roofs, obstacles, panels, walkways,
    addRoof, updateRoof, removeRoof, addObstacle, addPanel,
    updateObstacle, updatePanel,
    selectedIds, setSelectedIds, toggleSelected, clearSelection,
    removePanel, removeObstacle,
    drawingPoints, addDrawingPoint, clearDrawing, setDrawingPoints,
    showGrid, snapEnabled, setCursorPos, equipment,
  } = useDesignStore();

  const stageRef = useRef<Konva.Stage>(null);
  const [mousePos, setMousePos] = useState<Point | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const lastPanPos = useRef<Point | null>(null);
  const [rectStart, setRectStart] = useState<Point | null>(null);
  const [obstacleStart, setObstacleStart] = useState<Point | null>(null);
  const [obstacleLabel, setObstacleLabel] = useState('AC Unit');

  // Convert stage coordinates (including pan/zoom) to scene coordinates
  const toScene = useCallback((clientX: number, clientY: number): Point => {
    const stage = stageRef.current;
    if (!stage) return { x: clientX, y: clientY };
    const pos = stage.getPointerPosition();
    if (!pos) return { x: clientX, y: clientY };
    return {
      x: (pos.x - offset.x) / scale,
      y: (pos.y - offset.y) / scale,
    };
  }, [scale, offset]);

  const getSnapped = useCallback((pt: Point): Point =>
    snapPoint(pt, GRID_SIZE, snapEnabled), [snapEnabled]);

  // Mouse wheel zoom
  const handleWheel = useCallback((e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;
    const oldScale = scale;
    const pointer = stage.getPointerPosition()!;
    const scaleBy = 1.08;
    const newScale = e.evt.deltaY < 0
      ? Math.min(oldScale * scaleBy, 10)
      : Math.max(oldScale / scaleBy, 0.1);

    const mousePointTo = {
      x: (pointer.x - offset.x) / oldScale,
      y: (pointer.y - offset.y) / oldScale,
    };
    setScale(newScale);
    setOffset({
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    });
  }, [scale, offset, setScale, setOffset]);

  // Mouse move
  const handleMouseMove = useCallback((e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    const stage = stageRef.current;
    if (!stage) return;
    const pos = stage.getPointerPosition()!;

    if (isPanning && lastPanPos.current) {
      setOffset({
        x: offset.x + pos.x - lastPanPos.current.x,
        y: offset.y + pos.y - lastPanPos.current.y,
      });
      lastPanPos.current = pos;
      return;
    }

    const scene = { x: (pos.x - offset.x) / scale, y: (pos.y - offset.y) / scale };
    const snapped = getSnapped(scene);
    setMousePos(snapped);
    setCursorPos(snapped);
  }, [isPanning, offset, scale, getSnapped, setOffset, setCursorPos]);

  const handleMouseDown = useCallback((e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    const me = e.evt as MouseEvent;
    if (me.button === 1 || (me.button === 0 && isPanning)) {
      setIsPanning(true);
      const pos = stageRef.current?.getPointerPosition();
      if (pos) lastPanPos.current = pos;
      return;
    }

    const pos = stageRef.current?.getPointerPosition()!;
    const scene = { x: (pos.x - offset.x) / scale, y: (pos.y - offset.y) / scale };
    const pt = getSnapped(scene);

    if (activeTool === 'polygon') {
      addDrawingPoint(pt);
    } else if (activeTool === 'rectangle') {
      setRectStart(pt);
    } else if (activeTool === 'obstacle') {
      // Drag to draw the obstacle's real footprint (skylight, AC unit,
      // water tank, staircase head, etc.) instead of a fixed 2×2m square.
      setObstacleStart(pt);
    } else if (activeTool === 'panel') {
      // Real Waaree footprint converted to scene px at the CURRENT scale
      const ppm = 1 / sceneMetersPerPixel();
      const panel: SolarPanel = {
        id: generateId(),
        type: 'panel',
        x: pt.x, y: pt.y,
        width: PANEL_W_M * ppm, height: PANEL_H_M * ppm,
        rotation: 0,
        orientation: 'portrait',
        manufacturer: 'Waaree',
        model: equipment.panelModel,
        power: equipment.panelPower,
        tilt: 15,
        stringNumber: 1,
        roofId: '',
      };
      addPanel(panel);
    } else if (activeTool === 'select') {
      // Clicking empty space clears selection
      const target = e.target;
      if (target === stageRef.current || target.getClassName() === 'Layer') {
        clearSelection();
      }
    }
  }, [activeTool, offset, scale, getSnapped, addDrawingPoint, addObstacle, addPanel,
    clearSelection, setSelectedIds, equipment]);

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
    lastPanPos.current = null;

    if (activeTool === 'rectangle' && rectStart && mousePos) {
      const minX = Math.min(rectStart.x, mousePos.x);
      const minY = Math.min(rectStart.y, mousePos.y);
      const maxX = Math.max(rectStart.x, mousePos.x);
      const maxY = Math.max(rectStart.y, mousePos.y);
      const points: Point[] = [
        { x: minX, y: minY }, { x: maxX, y: minY },
        { x: maxX, y: maxY }, { x: minX, y: maxY },
      ];
      // Capture the real-world scale AT TRACE TIME — stays valid even if the
      // user zooms the map or canvas afterwards.
      const traceMpp = sceneMetersPerPixel();
      const area = pxToM2(polygonArea(points), traceMpp);
      const roof: RoofPolygon = {
        id: generateId(), type: 'roof', points,
        slope: 10, azimuth: 180,
        color: '#38BDF8', opacity: 0.25, area,
        traceMpp,
      };
      addRoof(roof);
      setSelectedIds([roof.id]);
      setRectStart(null);
    }

    if (activeTool === 'obstacle' && obstacleStart && mousePos) {
      const ppm = 1 / sceneMetersPerPixel();
      const draggedWm = Math.abs(mousePos.x - obstacleStart.x) / ppm;
      const draggedHm = Math.abs(mousePos.y - obstacleStart.y) / ppm;

      let w: number, h: number, cx: number, cy: number;
      if (draggedWm < DRAG_THRESHOLD_M && draggedHm < DRAG_THRESHOLD_M) {
        // Treated as a click — use a realistic real-world default size for
        // this obstacle type, centered on the click point.
        const def = DEFAULT_OBSTACLE_SIZE_M[obstacleLabel] || { w: 1, d: 1 };
        w = def.w * ppm; h = def.d * ppm;
        cx = obstacleStart.x; cy = obstacleStart.y;
      } else {
        // Deliberate drag — use the exact traced footprint.
        const minX = Math.min(obstacleStart.x, mousePos.x);
        const minY = Math.min(obstacleStart.y, mousePos.y);
        const maxX = Math.max(obstacleStart.x, mousePos.x);
        const maxY = Math.max(obstacleStart.y, mousePos.y);
        w = maxX - minX; h = maxY - minY;
        cx = minX + w / 2; cy = minY + h / 2;
      }

      const obs: Obstacle = {
        id: generateId(),
        type: 'obstacle',
        x: cx, y: cy,
        width: w, height: h,
        rotation: 0,
        label: obstacleLabel,
      };
      addObstacle(obs);
      setSelectedIds([obs.id]);
      setObstacleStart(null);
    }
  }, [activeTool, rectStart, mousePos, addRoof, setSelectedIds, obstacleStart, obstacleLabel, addObstacle]);

  // Double-click to close polygon
  const handleDblClick = useCallback(() => {
    if (activeTool === 'polygon' && drawingPoints.length >= 3) {
      // Capture the real-world scale AT TRACE TIME
      const traceMpp = sceneMetersPerPixel();
      const area = pxToM2(polygonArea(drawingPoints), traceMpp);
      const roof: RoofPolygon = {
        id: generateId(), type: 'roof',
        points: drawingPoints,
        slope: 10, azimuth: 180,
        color: '#38BDF8', opacity: 0.25, area,
        traceMpp,
      };
      addRoof(roof);
      setSelectedIds([roof.id]);
      clearDrawing();
    }
  }, [activeTool, drawingPoints, addRoof, setSelectedIds, clearDrawing]);

  // Cursor
  useEffect(() => {
    const cursors: Record<string, string> = {
      polygon: 'crosshair',
      rectangle: 'crosshair',
      obstacle: 'copy',
      panel: 'copy',
      delete: 'not-allowed',
      measure: 'cell',
      move: 'move',
      select: 'default',
      rotate: 'ew-resize',
    };
    document.body.style.cursor = cursors[activeTool] || 'default';
    return () => { document.body.style.cursor = 'default'; };
  }, [activeTool]);

  // Space key pan
  useEffect(() => {
    const down = (e: KeyboardEvent) => { if (e.code === 'Space') { e.preventDefault(); setIsPanning(true); } };
    const up = (e: KeyboardEvent) => { if (e.code === 'Space') setIsPanning(false); };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, []);

  // Backspace = remove last in-progress point; Escape = cancel drawing
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (activeTool !== 'polygon') return;
      if (drawingPoints.length === 0) return;

      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        setDrawingPoints(drawingPoints.slice(0, -1));
      } else if (e.key === 'Escape') {
        e.preventDefault();
        clearDrawing();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeTool, drawingPoints, setDrawingPoints, clearDrawing]);

  // Delete/Backspace with a roof or obstacle SELECTED (not mid-drawing) removes it —
  // no need to switch to the Delete tool and click precisely.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (activeTool === 'polygon' && drawingPoints.length > 0) return; // handled above
      if (selectedIds.length === 0) return;
      if (e.key !== 'Backspace' && e.key !== 'Delete') return;
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA'].includes(target.tagName)) return; // don't hijack text fields
      e.preventDefault();
      selectedIds.forEach(id => {
        if (roofs.some(r => r.id === id)) removeRoof(id);
        else if (obstacles.some(o => o.id === id)) removeObstacle(id);
      });
      clearSelection();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeTool, drawingPoints, selectedIds, roofs, obstacles, removeRoof, removeObstacle, clearSelection]);
  const rectPreview = activeTool === 'rectangle' && rectStart && mousePos
    ? { x: Math.min(rectStart.x, mousePos.x), y: Math.min(rectStart.y, mousePos.y), w: Math.abs(mousePos.x - rectStart.x), h: Math.abs(mousePos.y - rectStart.y) }
    : null;
  const obstaclePreview = activeTool === 'obstacle' && obstacleStart && mousePos
    ? { x: Math.min(obstacleStart.x, mousePos.x), y: Math.min(obstacleStart.y, mousePos.y), w: Math.abs(mousePos.x - obstacleStart.x), h: Math.abs(mousePos.y - obstacleStart.y) }
    : null;

  return (
    <div className="relative w-full h-full overflow-hidden" style={{ background: 'transparent' }}>
      <Stage
        ref={stageRef}
        width={width}
        height={height}
        scaleX={scale}
        scaleY={scale}
        x={offset.x}
        y={offset.y}
        className="absolute inset-0 z-10"
        onWheel={handleWheel}
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onDblClick={handleDblClick}
        style={{ cursor: isPanning ? 'grabbing' : undefined }}
      >
        {/* Grid */}
        {showGrid && (
          <Layer>
            <GridLayer width={width} height={height} scale={scale} offset={offset} />
          </Layer>
        )}

        {/* Main design layer */}
        <Layer>
          {/* Roofs */}
          {roofs.map(roof => (
            <RoofShape
              key={roof.id}
              roof={roof}
              isSelected={selectedIds.includes(roof.id)}
              onClick={e => {
                e.cancelBubble = true;
                if (activeTool === 'delete') { removeRoof(roof.id); clearSelection(); return; }
                if ((e.evt as MouseEvent).shiftKey) toggleSelected(roof.id);
                else setSelectedIds([roof.id]);
              }}
              onVertexDrag={(vi, pt) => {
                const newPts = roof.points.map((p, i) => i === vi ? pt : p);
                // Recompute area with the scale captured when this roof was traced
                updateRoof(roof.id, { points: newPts, area: pxToM2(polygonArea(newPts), roof.traceMpp) });
              }}
            />
          ))}

          {/* Obstacles */}
          {obstacles.map(obs => (
            <ObstacleShape
              key={obs.id}
              obs={obs}
              isSelected={selectedIds.includes(obs.id)}
              onSelect={e => {
                e.cancelBubble = true;
                if (activeTool === 'delete') { removeObstacle(obs.id); clearSelection(); return; }
                if ((e.evt as MouseEvent).shiftKey) toggleSelected(obs.id);
                else setSelectedIds([obs.id]);
              }}
              onDrag={(x, y) => updateObstacle(obs.id, { x, y })}
            />
          ))}

          {/* Panels are NOT rendered in 2D — all panel work happens in 3D view.
              2D is only for tracing the building roof outline. */}

          {/* Drawing preview */}
          <DrawingPreview
            points={drawingPoints}
            mousePos={mousePos}
            tool={activeTool}
          />

          {/* Rectangle preview */}
          {rectPreview && (
            <Rect
              x={rectPreview.x} y={rectPreview.y}
              width={safeSize(rectPreview.w)} height={safeSize(rectPreview.h)}
              fill="#38BDF820"
              stroke="#3B82F6"
              strokeWidth={1.5}
              dash={[6, 3]}
              listening={false}
            />
          )}

          {/* Obstacle drag preview */}
          {obstaclePreview && (
            <Rect
              x={obstaclePreview.x} y={obstaclePreview.y}
              width={safeSize(obstaclePreview.w)} height={safeSize(obstaclePreview.h)}
              fill="#F9731630"
              stroke="#EA580C"
              strokeWidth={1.5}
              dash={[5, 3]}
              listening={false}
            />
          )}

          {/* Snap crosshair */}
          {mousePos && snapEnabled && (activeTool === 'polygon' || activeTool === 'rectangle' || activeTool === 'obstacle') && (
            <>
              <Line points={[mousePos.x - 8, mousePos.y, mousePos.x + 8, mousePos.y]}
                stroke="#3B82F6" strokeWidth={0.8} listening={false} />
              <Line points={[mousePos.x, mousePos.y - 8, mousePos.x, mousePos.y + 8]}
                stroke="#3B82F6" strokeWidth={0.8} listening={false} />
            </>
          )}
        </Layer>
      </Stage>

      {/* Drawing instruction overlay */}
      {(activeTool === 'polygon' && drawingPoints.length > 0) && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-slate-900/90 border border-slate-700 rounded-lg px-4 py-2 text-xs text-slate-300 pointer-events-none z-20">
          <span className="text-blue-400 font-semibold">{drawingPoints.length} pts</span>
          {' · '}Double-click to close polygon · Esc to cancel
        </div>
      )}

      {/* Obstacle type picker — pick a type, then click-drag on the roof to
          draw its real footprint (skylight, AC unit, water tank, staircase). */}
      {activeTool === 'obstacle' && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-white border border-orange-200 rounded-lg shadow-md px-2 py-2 flex gap-1.5 z-20">
          {(['AC Unit', 'Water Tank', 'Skylight', 'Staircase', 'Vent'] as const).map(label => (
            <button
              key={label}
              onClick={() => setObstacleLabel(label)}
              className="px-2.5 py-1 rounded text-[11px] font-medium transition-colors"
              style={{
                background: obstacleLabel === label ? '#EA580C' : '#FFF7ED',
                color: obstacleLabel === label ? '#fff' : '#9A3412',
                border: '1px solid #FDBA74',
              }}
            >
              {label}
            </button>
          ))}
          <span className="text-[10px] text-slate-400 self-center ml-1 pr-1">click = default size · drag = custom size</span>
        </div>
      )}

      {/* Tool hint when idle */}
      {activeTool === 'select' && selectedIds.length === 0 && roofs.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
          <div className="text-center">
            <div className="text-4xl mb-3 opacity-30">⬡</div>
            <p className="text-slate-600 text-sm">Press <kbd className="bg-slate-800 border border-slate-700 rounded px-1 py-0.5 font-mono text-xs text-slate-400">P</kbd> to draw a roof polygon, or <kbd className="bg-slate-800 border border-slate-700 rounded px-1 py-0.5 font-mono text-xs text-slate-400">R</kbd> to draw a rectangle</p>
          </div>
        </div>
      )}
    </div>
  );
}
