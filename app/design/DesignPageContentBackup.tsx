'use client';
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useSearchParams, usePathname } from 'next/navigation';
import {
  MapPin, Home, Square, Hexagon, MousePointer2, Trash2, Box,
  Navigation, PenLine, CheckCircle2, Save, FileText, Link2, AlertTriangle,
} from 'lucide-react';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import { useDesignStore } from '../../store/designStore';
import { DesignCanvas } from '../../components/design/DesignCanvas';
import { MapBackground, MapBackgroundRef } from '../../components/map/MapBackground';
import { SolarDesign3D } from '../../components/design/SolarDesign3D';
import { AddressSearch } from '../../components/map/AddressSearch';
import { SunPathAnalysis } from '../../components/design/SunPathAnalysis';
import { getOptimalOrientation } from '../../utils/SolarAPIService';
import { DesignTopBar } from '../../components/design/DesignTopBar';
import { DesignToolRail, type DesignPanelKey } from '../../components/design/DesignToolRail';
import { DesignToolPanel } from '../../components/design/DesignToolPanel';
import { DesignStatusBar } from '../../components/design/DesignStatusBar';
import { DesignInspector } from '../../components/design/DesignInspector';
import { DesignLayersPanel } from '../../components/design/DesignLayersPanel';
import { useDesignProjectLoader } from '../../hooks/useDesignProjectLoader';
import { useDesignNavigationActions } from '../../hooks/useDesignNavigationActions';

export type DesignTheme = 'light' | 'dark';
const THEME_STORAGE_KEY = 'solaripe-design-theme';

/* ── Theme tokens ──
   Every color below is a CSS custom property scoped under
   .solaripe-design-workspace[data-theme="light"|"dark"]. Components in
   this file (and DesignTopBar/DesignToolRail/DesignToolPanel/
   DesignStatusBar) reference these via var(--design-x) instead of
   hardcoded hex, so the same JSX renders correctly in both themes and a
   toggle is just flipping the data-theme attribute — no per-component
   branching needed. SolarDesign3D.tsx does NOT participate in this yet —
   it has its own independent panel/theme that hasn't been merged into
   this shell (that's a separate, larger decision still pending). */
function DesignThemeStyles() {
  return (
    <style>{`
      .solaripe-design-workspace[data-theme='light'] {
        --design-bg: #F1F5F9;
        --design-panel: #FFFFFF;
        --design-panel-elevated: #FFFFFF;
        --design-border: #E2E8F0;
        --design-text: #1E293B;
        --design-text-secondary: #475569;
        --design-muted: #64748B;
        --design-muted-2: #94A3B8;
        --design-primary: #2563EB;
        --design-primary-hover: #1D4ED8;
        --design-navy: #1E3A5F;
        --design-input-bg: #F8FAFC;
        --design-viewport-bg: #E2E8F0;
        --design-info-bg: #EFF6FF;
        --design-info-border: #BFDBFE;
        --design-info-text: #1E40AF;
        --design-success-bg: #F0FDF4;
        --design-success-border: #86EFAC;
        --design-success-text: #15803D;
        --design-success-text-2: #166534;
        --design-danger-bg: #FEF2F2;
        --design-danger-border: #FCA5A5;
        --design-danger-text: #B91C1C;
        --design-danger-solid: #DC2626;
        --design-warning-bg: #FFFBEB;
        --design-warning-border: #FDE68A;
        --design-warning-text: #B45309;
        --design-obstacle-bg: #FFF7ED;
        --design-obstacle-border: #FDBA74;
        --design-obstacle-text: #9A3412;
        --design-row-border: #F1F5F9;
      }
      .solaripe-design-workspace[data-theme='dark'] {
        --design-bg: #07111D;
        --design-panel: #0D1724;
        --design-panel-elevated: #111D2B;
        --design-border: rgba(148, 163, 184, 0.18);
        --design-text: #F4F7FB;
        --design-text-secondary: #C3CEDC;
        --design-muted: #A7B4C5;
        --design-muted-2: #728197;
        --design-primary: #2563EB;
        --design-primary-hover: #1D4ED8;
        --design-navy: #16233A;
        --design-input-bg: #101C29;
        --design-viewport-bg: #060D16;
        --design-info-bg: rgba(37, 99, 235, 0.12);
        --design-info-border: rgba(37, 99, 235, 0.35);
        --design-info-text: #93B4F5;
        --design-success-bg: rgba(34, 197, 94, 0.1);
        --design-success-border: rgba(34, 197, 94, 0.35);
        --design-success-text: #6EE7A0;
        --design-success-text-2: #86EFAC;
        --design-danger-bg: rgba(239, 68, 68, 0.1);
        --design-danger-border: rgba(239, 68, 68, 0.35);
        --design-danger-text: #FCA5A5;
        --design-danger-solid: #DC2626;
        --design-warning-bg: rgba(245, 158, 11, 0.1);
        --design-warning-border: rgba(245, 158, 11, 0.35);
        --design-warning-text: #FCD34D;
        --design-obstacle-bg: rgba(234, 88, 12, 0.1);
        --design-obstacle-border: rgba(234, 88, 12, 0.35);
        --design-obstacle-text: #FDBA74;
        --design-row-border: rgba(148, 163, 184, 0.12);
      }
    `}</style>
  );
}

/* Local shorthand — every value below is a CSS var, resolved at paint
   time by whichever data-theme is active on the workspace root. */
const C = {
  bg: 'var(--design-bg)', panel: 'var(--design-panel)', rail: 'var(--design-panel)',
  border: 'var(--design-border)', text: 'var(--design-text)', muted: 'var(--design-muted)',
  muted2: 'var(--design-muted-2)', navy: 'var(--design-navy)', blue: 'var(--design-primary)',
  railActive: 'var(--design-navy)', inputBg: 'var(--design-input-bg)',
};

/* ── Small UI helpers ── */
function Row({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: `1px solid var(--design-row-border)` }}>
      <span style={{ fontSize: 12, color: C.muted }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 600, color: color || C.text }}>{value}</span>
    </div>
  );
}

function EstimateRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '6px 0', borderBottom: `1px solid var(--design-row-border)` }}>
      <span style={{ fontSize: 12, color: C.muted }}>{label} <span style={{ fontSize: 9.5, color: 'var(--design-warning-text)', background: 'var(--design-warning-bg)', border: '1px solid var(--design-warning-border)', borderRadius: 4, padding: '1px 4px', marginLeft: 4 }}>est.</span></span>
      <span style={{ fontSize: 12, fontWeight: 600, color: color || C.text }}>{value}</span>
    </div>
  );
}

function ToolBtn({ icon: Icon, label, active, onClick }: { icon: React.ComponentType<{ size?: number }>; label: string; active?: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
      padding: '12px 4px', borderRadius: 8, cursor: 'pointer',
      border: `1px solid ${active ? C.blue : C.border}`,
      background: active ? 'color-mix(in srgb, var(--design-primary) 8%, transparent)' : C.panel,
      color: active ? C.blue : C.muted, fontSize: 11, fontWeight: 500, width: '100%',
    }}>
      <Icon size={18} />
      <span>{label}</span>
    </button>
  );
}

function PrimaryBtn({ children, onClick, color = C.navy, disabled }: { children: React.ReactNode; onClick: () => void; color?: string; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{ width: '100%', padding: '10px 0', borderRadius: 8, border: 'none', background: color, color: '#fff', fontSize: 12, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer', marginBottom: 8, opacity: disabled ? 0.5 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>{children}</button>
  );
}

export default function DesignPageContent() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapBackgroundRef>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [view3D, setView3D] = useState(false);
  const [openPanel, setOpenPanel] = useState<DesignPanelKey>('roof');
  const [mapMode, setMapMode] = useState(true);
  const [showIrregularTool, setShowIrregularTool] = useState(false);
  const [currentLocation, setCurrentLocation] = useState({ lat: 19.2403, lng: 73.1305 });

  // Design workspace theme — defaults to 'dark' (the target CAD look) on
  // first render for SSR/client consistency, then syncs from localStorage
  // right after mount. This is a workspace-scoped preference, independent
  // of the rest of Solaripe, which keeps its existing light UI.
  const [theme, setTheme] = useState<DesignTheme>('dark');
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
      if (saved === 'light' || saved === 'dark') setTheme(saved);
    } catch {
      // localStorage unavailable (privacy mode, etc.) — just keep the default.
    }
  }, []);
  const toggleTheme = useCallback(() => {
    setTheme(prev => {
      const next = prev === 'dark' ? 'light' : 'dark';
      try { window.localStorage.setItem(THEME_STORAGE_KEY, next); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const searchParams = useSearchParams();
  const isClientView = searchParams.get('client') === '1';
  const pathname = usePathname();

  useKeyboardShortcuts();

  const {
    activeTool, setActiveTool, roofs, obstacles, panels, equipment, project, updateProject,
    showGrid, toggleGrid, snapEnabled, toggleSnap, zoomIn, zoomOut, fitToScreen, scale,
    undo, redo, historyIndex, history, cursorPos, saveStatus, setSaveStatus,
    autoFillRoof, selectedIds, setSelectedIds, removeRoof,
    saveToSupabase, projectId, layerVisibility, toggleLayerVisibility,
  } = useDesignStore();

  // Handles both loading an existing project's design AND — for a direct
  // /design visit — actually creating a backing `projects` row instead of
  // silently minting a client-side id that nothing else in the app knows
  // about. See hooks/useDesignProjectLoader.ts for the full rationale.
  const { status: projectLoadStatus, errorMessage: projectLoadError } = useDesignProjectLoader();

  // Single source of truth for every mapMode+activeTool transition — see
  // hooks/useDesignNavigationActions.ts.
  const {
    enterNavigateMode, enterDrawMode, enterRectangleMode,
    enterPolygonMode, enterSelectMode, enterDeleteMode,
  } = useDesignNavigationActions(setMapMode);

  useEffect(() => {
    const update = () => {
      if (!containerRef.current) return;
      const w = containerRef.current.offsetWidth, h = containerRef.current.offsetHeight;
      // Ignore transient 0×0 readings — these happen for a frame as the
      // container collapses during route-away navigation (e.g. clicking
      // "Generate Quote"). Passing 0 straight through to Konva's <Stage> as
      // real width/height props is what triggers an internal canvas
      // resize/cache operation on a 0-size canvas — the actual source of
      // the "drawImage... width or height of 0" error. Just keep the last
      // known-good size instead; there's nothing useful to render at 0×0
      // anyway, and the real size gets picked up again once layout settles.
      if (w === 0 || h === 0) return;
      setDimensions({ width: w, height: h });
    };
    update();
    const ro = new ResizeObserver(update);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const handleLocationSelect = useCallback((lat: number, lng: number, address: string) => {
    setCurrentLocation({ lat, lng });
    updateProject({ address });
    mapRef.current?.jumpTo(lat, lng);
  }, [updateProject]);

  // Client links (?client=1) skip straight to the 3D view — a client should
  // never see the 2D roof-tracing screen or any editing tools.
  useEffect(() => {
    if (isClientView) setView3D(true);
  }, [isClientView]);

  // ── Stats ──
  // NOTE on the figures below: dcKwp/panelCount/totalRoofAreaM2 are directly
  // measured from placed geometry — those are real. generation, co2,
  // usable-area and AC-capacity are rough estimates using fixed multipliers
  // (1332 kWh/kWp/yr, 0.71 t/MWh, 0.75 usable fraction, 0.78 DC:AC ratio) —
  // they are NOT verified engineering calculations, and are labeled "est."
  // wherever shown. The "Energy %" figure remains removed — it wasn't a
  // defined metric and there's no verified roof-utilization calculation to
  // replace it with here.
  const panelCount = panels.length;
  const dcKwp = (panelCount * equipment.panelPower) / 1000;
  const estGeneration = dcKwp * 1332;
  const estCo2 = estGeneration * 0.71;
  const totalRoofAreaM2 = roofs.reduce((a, r) => a + (r.area || 0), 0);
  const bestRoof = roofs.length > 0 ? roofs[0] : null;
  const orientation = bestRoof ? getOptimalOrientation(bestRoof.azimuth) : null;

  // Pushes the actual design numbers into the quote generator via URL params
  // it already reads (yearly_units, panel_count, roof_area, system_size,
  // name, address) — this is what "AI Design Banner" on that page expects.
  const generateQuote = useCallback(() => {
    if (panelCount === 0) {
      alert('Design at least a few panels first — the quote needs a system size to work from.');
      return;
    }
    const params = new URLSearchParams({
      name: project.clientName && project.clientName !== 'New Client' ? project.clientName : '',
      address: project.address && project.address !== 'Enter address...' ? project.address : '',
      system_size: dcKwp.toFixed(2),
      panel_count: String(panelCount),
      roof_area: totalRoofAreaM2.toFixed(1),
      yearly_units: String(Math.round(estGeneration)),
      monthly_units: String(Math.round(estGeneration / 12)),
    });
    // A full hard navigation (not router.push) — this completely discards
    // the current page instead of trying to smoothly transition within
    // React, sidestepping a re-render race during navigation that was
    // crashing Konva's canvas on this page. Left unchanged per instruction.
    window.location.href = `/quote?${params.toString()}`;
  }, [panelCount, project.clientName, project.address, dcKwp, totalRoofAreaM2, estGeneration]);

  // Shareable, view-only link — opens straight into the 3D model with every
  // editing tool stripped out, so a client can orbit/zoom and see the sun
  // move across their own roof without touching anything they shouldn't.
  const copyClientLink = useCallback(async () => {
    if (panelCount === 0) {
      alert('Design at least a few panels first, then save, before sharing a client link.');
      return;
    }
    const params = new URLSearchParams(searchParams.toString());
    params.set('client', '1');
    const url = `${window.location.origin}${pathname}?${params.toString()}`;
    try {
      await navigator.clipboard.writeText(url);
      alert('Client link copied! Make sure you\'ve saved the design first — this link loads whatever is currently saved.');
    } catch {
      prompt('Copy this link:', url);
    }
  }, [panelCount, searchParams, pathname]);

  const togglePanel = (key: DesignPanelKey) => setOpenPanel(prev => prev === key ? null : key);

  // Client link (?client=1): no top bar, no icon rail, no editing tools —
  // just the 3D model, read-only. AppShell already omits the global
  // Sidebar/BottomNav entirely for this state (see app-shell.tsx), so this
  // no longer needs a position:fixed/z-9999 escape hatch to visually cover
  // them — it's a normal full-height block in normal document flow.
  // Always dark here regardless of the saved preference — there's no
  // toggle control in this read-only view, and dark is the better default
  // for a client-facing 3D presentation.
  if (isClientView) {
    return (
      <div className="solaripe-design-workspace" data-theme="dark" style={{ height: '100vh', width: '100%', background: 'var(--design-bg)', fontFamily: 'Inter, system-ui, sans-serif' }}>
        <DesignThemeStyles />
        {bestRoof ? (
          <SolarDesign3D roofPoints={bestRoof.points} onClose={() => {}} lat={currentLocation.lat} readOnly />
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--design-muted)', fontSize: 14 }}>
            This design isn't ready to view yet.
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="solaripe-design-workspace" data-theme={theme} style={{ position: 'relative', height: '100vh', display: 'flex', flexDirection: 'column', background: C.bg, fontFamily: 'Inter, system-ui, sans-serif', color: C.text, overflow: 'hidden' }}>
      <DesignThemeStyles />

      {/* ── TOP BAR ──
          Hidden in 3D mode: SolarDesign3D renders its own full header bar
          (project name, panel count, kWp, mode switcher, Back to 2D) and
          was never designed to sit underneath a second one. SolarDesign3D's
          own header still has everything needed to get back to 2D (its
          "← Back to 2D" button already calls onClose, wired to
          setView3D(false) below), so nothing is lost. Note: SolarDesign3D's
          own panel does not yet respect this theme toggle — see the
          component comment at the top of this file. */}
      {!view3D && (
        <>
          <DesignTopBar
            projectName={project.clientName || 'New Project'}
            saveStatus={saveStatus}
            onSave={saveToSupabase}
            onUndo={undo}
            onRedo={redo}
            canUndo={historyIndex > 0}
            canRedo={historyIndex < history.length - 1}
            showGrid={showGrid}
            onToggleGrid={toggleGrid}
            snapEnabled={snapEnabled}
            onToggleSnap={toggleSnap}
            onZoomIn={zoomIn}
            onZoomOut={zoomOut}
            onFit={fitToScreen}
            view3D={view3D}
            onToggleView3D={() => setView3D(v => !v)}
            dcKwp={dcKwp}
            theme={theme}
            onToggleTheme={toggleTheme}
          />

          {/* Project-record creation failed — surfaced inline since there's no
              existing toast/notification system in this codebase to route
              this through instead. Save is a no-op until this resolves
              (designStore.saveToSupabase already guards on projectId being
              null), so this banner is the only signal the user gets. */}
          {projectLoadStatus === 'error' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', background: 'var(--design-danger-bg)', borderBottom: '1px solid var(--design-danger-border)', color: 'var(--design-danger-text)', fontSize: 12, flexShrink: 0 }}>
              <AlertTriangle size={14} />
              Couldn't set up a project record for this design — Save won't work until this is resolved.
              {projectLoadError && <span style={{ opacity: 0.8 }}>({projectLoadError})</span>}
            </div>
          )}
        </>
      )}

      {/* ── BODY ── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>

        {/* LEFT ICON RAIL — fixed width, no hover animation (see DesignToolRail).
            Hidden in 3D mode for the same reason as the top bar above. */}
        {!view3D && <DesignToolRail openPanel={openPanel} onTogglePanel={togglePanel} />}

        {/* CONTEXTUAL PANEL — normal flex child, pushes the viewport rather than overlaying it */}
        {!view3D && openPanel === 'view' && (
          <DesignToolPanel title="Location" onClose={() => setOpenPanel(null)}>
            <AddressSearch onLocationSelect={handleLocationSelect} />
            <div style={{ marginTop: 12, display: 'flex', gap: 6 }}>
              <button onClick={enterNavigateMode} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 0', borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: 'pointer', background: mapMode ? C.navy : C.inputBg, color: mapMode ? '#fff' : C.muted, border: `1px solid ${mapMode ? C.navy : C.border}` }}><Navigation size={13} /> Navigate</button>
              <button onClick={enterDrawMode} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 0', borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: 'pointer', background: !mapMode ? C.blue : C.inputBg, color: !mapMode ? '#fff' : C.muted, border: `1px solid ${!mapMode ? C.blue : C.border}` }}><PenLine size={13} /> Draw</button>
            </div>
            <p style={{ fontSize: 11, color: C.muted2, marginTop: 10, lineHeight: 1.5 }}>
              {mapMode ? 'Pan & zoom to find the building, then switch to Draw mode and press P to trace the roof.' : 'Press P to draw the roof outline. Double-click to close.'}
            </p>
          </DesignToolPanel>
        )}

        {!view3D && openPanel === 'roof' && (
          <DesignToolPanel title="Draw Building Outline" onClose={() => setOpenPanel(null)}>
            {!bestRoof && (
              <>
                <div style={{ padding: 12, background: 'var(--design-info-bg)', border: '1px solid var(--design-info-border)', borderRadius: 8, fontSize: 12, color: 'var(--design-info-text)', lineHeight: 1.6, marginBottom: 14 }}>
                  Most rooftops are simple rectangles — start there. Drag one corner-to-corner over the building in the satellite image.
                </div>

                <button
                  onClick={enterRectangleMode}
                  style={{
                    width: '100%', padding: '16px 0', borderRadius: 10, cursor: 'pointer', marginBottom: 10,
                    border: `2px solid ${activeTool === 'rectangle' ? C.blue : C.border}`,
                    background: activeTool === 'rectangle' ? 'var(--design-info-bg)' : C.panel,
                    color: activeTool === 'rectangle' ? C.navy : C.text,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                  }}
                >
                  <Square size={24} />
                  <span style={{ fontSize: 13, fontWeight: 700 }}>Trace Rectangle Roof</span>
                  <span style={{ fontSize: 10, color: C.muted, fontWeight: 400 }}>Click one corner, drag to the opposite corner</span>
                </button>

                {!showIrregularTool ? (
                  <button onClick={() => setShowIrregularTool(true)} style={{ width: '100%', padding: '8px 0', background: 'none', border: 'none', color: C.blue, fontSize: 12, fontWeight: 600, cursor: 'pointer', marginBottom: 14 }}>
                    My roof isn't a simple rectangle →
                  </button>
                ) : (
                  <div style={{ marginBottom: 14 }}>
                    <ToolBtn icon={Hexagon} label="Draw Custom Outline (point-by-point)" active={activeTool === 'polygon'} onClick={enterPolygonMode} />
                    <p style={{ fontSize: 10, color: C.muted2, marginTop: 8, lineHeight: 1.5 }}>
                      Click each corner of the building, following its actual shape. Double-click the last corner to close the outline.
                    </p>
                  </div>
                )}
              </>
            )}

            {bestRoof && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                <ToolBtn icon={Hexagon} label="Draw Polygon" active={activeTool === 'polygon'} onClick={enterPolygonMode} />
                <ToolBtn icon={Square} label="Rectangle" active={activeTool === 'rectangle'} onClick={enterRectangleMode} />
                <ToolBtn icon={MousePointer2} label="Edit Points" active={activeTool === 'select'} onClick={enterSelectMode} />
                <ToolBtn icon={Trash2} label="Delete" active={activeTool === 'delete'} onClick={enterDeleteMode} />
              </div>
            )}

            {/* 2D obstacle creation intentionally removed — creation,
                resizing and rotation now live only inside the 3D designer.
                Obstacles remain visible/selectable/deletable in 2D via
                DesignCanvas's existing ObstacleShape rendering + Delete-key
                handling, both untouched. */}

            {bestRoof ? (
              <>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Roof Info</div>
                <Row label="Area" value={`${(bestRoof.area || 0).toFixed(1)} m²`} />
                <Row label="Corners" value={bestRoof.points.length.toString()} />
                <Row label="Slope" value={`${bestRoof.slope}°`} />
                <Row label="Facing" value={orientation?.label || '—'} color={orientation?.color} />
                <Row label="Obstacles" value={obstacles.length.toString()} color={obstacles.length > 0 ? 'var(--design-obstacle-text)' : undefined} />
                <p style={{ fontSize: 9.5, color: C.muted2, marginTop: 4, lineHeight: 1.4 }}>To add, resize or rotate obstacles, switch to 3D.</p>

                <div style={{ marginTop: 16, padding: 14, background: 'var(--design-success-bg)', border: '1px solid var(--design-success-border)', borderRadius: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: 'var(--design-success-text)', marginBottom: 6 }}><CheckCircle2 size={14} /> Roof outline ready!</div>
                  <div style={{ fontSize: 11, color: 'var(--design-success-text-2)', lineHeight: 1.5, marginBottom: 10 }}>Now switch to 3D to add panels, set tilt, and see shadows.</div>
                  <button onClick={() => setView3D(true)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '11px 0', borderRadius: 8, border: 'none', background: C.navy, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                    <Box size={15} /> Continue to 3D Design →
                  </button>
                </div>

                <button
                  onClick={() => {
                    if (window.confirm('Delete this roof outline? This also removes every panel placed on it. You can Undo (↩ in the top bar) right after if this was a mistake.')) {
                      removeRoof(bestRoof.id);
                      enterPolygonMode();
                      setShowIrregularTool(false);
                    }
                  }}
                  style={{ width: '100%', marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '9px 0', borderRadius: 8, border: '1px solid var(--design-danger-border)', background: 'var(--design-danger-bg)', color: 'var(--design-danger-text)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                >
                  <Trash2 size={13} /> Delete Roof & Start Over
                </button>
              </>
            ) : null}
          </DesignToolPanel>
        )}

        {!view3D && openPanel === 'stats' && (
          <DesignToolPanel title="System Statistics" onClose={() => setOpenPanel(null)}>
            <Row label="Roof Area" value={`${totalRoofAreaM2.toFixed(1)} m²`} />
            <EstimateRow label="Usable Area" value={`${(totalRoofAreaM2 * 0.75).toFixed(1)} m²`} />
            <Row label="Total Panels" value={panelCount.toString()} />
            <Row label="DC Capacity" value={`${dcKwp.toFixed(2)} kWp`} />
            <EstimateRow label="AC Capacity" value={`${(dcKwp * 0.78).toFixed(2)} kW`} />
            <div style={{ height: 8 }} />
            <EstimateRow label="Annual Generation" value={`${(estGeneration / 1000).toFixed(1)} MWh`} color="var(--design-success-text)" />
            <EstimateRow label="CO₂ Offset" value={`${(estCo2 / 1000).toFixed(2)} t/yr`} color="var(--design-success-text)" />
            <p style={{ fontSize: 9.5, color: C.muted2, marginTop: 8, lineHeight: 1.4 }}>
              Figures marked "est." use fixed rule-of-thumb multipliers, not a site-specific yield simulation.
            </p>
            <div style={{ marginTop: 16 }}>
              <PrimaryBtn
                onClick={saveToSupabase}
                disabled={saveStatus === 'saving'}
              >
                <Save size={13} /> {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'unsaved' ? 'Save Design' : 'Saved'}
              </PrimaryBtn>
              <PrimaryBtn onClick={generateQuote} color={C.blue}><FileText size={13} /> Generate Quote</PrimaryBtn>
              <PrimaryBtn onClick={copyClientLink} color={C.navy}><Link2 size={13} /> Copy Client Link</PrimaryBtn>
              <div style={{ fontSize: 10, color: C.muted2, marginTop: -4, lineHeight: 1.4 }}>
                Opens a view-only 3D model for the client — no editing tools, just orbit/zoom and the sun path. Save first so the link shows your latest design.
              </div>
            </div>
          </DesignToolPanel>
        )}

        {/* CENTER WORKSPACE */}
        <div ref={containerRef} style={{ flex: 1, position: 'relative', overflow: 'hidden', background: 'var(--design-viewport-bg)', minWidth: 0 }}>
          <div style={{ position: 'absolute', inset: 0, zIndex: 1, pointerEvents: mapMode ? 'auto' : 'none', opacity: layerVisibility.satellite ? 1 : 0, transition: 'opacity .15s' }}>
            <MapBackground ref={mapRef} interactive={mapMode} />
          </div>
          <div style={{ position: 'absolute', inset: 0, zIndex: 2, pointerEvents: mapMode ? 'none' : 'auto' }}>
            {dimensions.width > 0 && <DesignCanvas width={dimensions.width} height={dimensions.height} />}
          </div>

          {/* 3D overlay */}
          {view3D && (
            <SolarDesign3D roofPoints={(roofs[0])?.points || []} onClose={() => setView3D(false)} lat={currentLocation.lat} />
          )}

          {/* Mode badge */}
          {!view3D && (
            <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 20, display: 'flex', gap: 6, alignItems: 'center', background: mapMode ? 'var(--design-navy)' : 'var(--design-primary)', color: '#fff', padding: '6px 12px', borderRadius: 20, fontSize: 11, fontWeight: 600, boxShadow: '0 2px 8px rgba(0,0,0,.25)' }}>
              {mapMode ? <><Navigation size={12} /> Navigate Mode — pan & zoom freely</> : <><PenLine size={12} /> Draw Mode — press P to trace roof</>}
            </div>
          )}

          {/* Drawing hint */}
          {activeTool === 'polygon' && !view3D && (
            <div style={{ position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)', background: 'rgba(15,23,42,.92)', color: '#fff', borderRadius: 8, padding: '8px 16px', fontSize: 11, zIndex: 20 }}>
              Click to add points · <strong>Double-click</strong> to close · <kbd style={{ background: '#475569', borderRadius: 3, padding: '1px 5px', fontSize: 10 }}>Esc</kbd> to cancel
            </div>
          )}
        </div>

        {/* RIGHT INSPECTOR + LAYERS — 2D mode only for now. Showing this
            alongside the 3D viewport too requires SolarDesign3D to stop
            owning its own full-screen header/panel and report its state
            (selection, etc.) up to this shell instead — that's the next
            piece of the Stage 3 merge, not done yet. */}
        {!view3D && (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <DesignInspector
              clientName={project.clientName}
              address={project.address}
              projectId={projectId}
              totalRoofAreaM2={totalRoofAreaM2}
              panelCount={panelCount}
              dcKwp={dcKwp}
            />
            <div style={{ width: 280, flexShrink: 0, background: C.panel, borderLeft: `1px solid ${C.border}`, borderTop: `1px solid ${C.border}`, padding: '0 16px 16px' }}>
              <DesignLayersPanel
                layerVisibility={layerVisibility}
                onToggleLayer={toggleLayerVisibility}
                roofCount={roofs.length}
                obstacleCount={obstacles.length}
              />
            </div>
          </div>
        )}
      </div>

      {/* BOTTOM STATUS BAR */}
      {!view3D && (
        <DesignStatusBar
          activeTool={activeTool}
          cursorX={cursorPos.x}
          cursorY={cursorPos.y}
          scale={scale}
          totalRoofAreaM2={totalRoofAreaM2}
          panelCount={panelCount}
          saveStatus={saveStatus}
        />
      )}
    </div>
  );
}
