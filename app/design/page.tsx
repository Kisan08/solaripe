'use client';
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import { useDesignStore } from '../../store/designStore';
import { DesignCanvas } from '../../components/design/DesignCanvas';
import { MapBackground, MapBackgroundRef } from '../../components/map/MapBackground';
import { SolarDesign3D } from '../../components/design/SolarDesign3D';
import { AddressSearch } from '../../components/map/AddressSearch';
import { SunPathAnalysis } from '../../components/design/SunPathAnalysis';
import { getOptimalOrientation } from '../../utils/SolarAPIService';
import { supabase } from '../../lib/supabase';

/* ── Theme ── */
const C = {
  bg: '#F1F5F9', panel: '#FFFFFF', rail: '#FFFFFF',
  border: '#E2E8F0', text: '#1E293B', muted: '#64748B',
  navy: '#1E3A5F', blue: '#2563EB', railActive: '#1E3A5F',
};

type PanelKey = 'view' | 'roof' | 'obstacles' | 'shading' | 'panels' | 'sun' | 'stats' | null;

/* ── Rail icon button ── */
function RailIcon({ icon, label, active, onClick }: { icon: string; label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} title={label} className={`design-rail-item${active ? ' design-rail-item-active' : ''}`}
      style={{
        width: '100%', height: 44, display: 'flex', alignItems: 'center', gap: 12,
        padding: '0 14px', border: 'none', cursor: 'pointer', borderRadius: 10,
        background: active ? C.railActive : 'transparent',
        color: active ? '#fff' : '#64748B', transition: 'background .15s', overflow: 'hidden',
      }}>
      <span style={{ fontSize: 18, flexShrink: 0 }}>{icon}</span>
      <span className="design-rail-label" style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', opacity: 0, transition: 'opacity .15s' }}>{label}</span>
    </button>
  );
}

function RailGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingBottom: 8, marginBottom: 8, borderBottom: '1px solid #E2E8F0', width: '100%' }}>
      <span className="design-rail-label" style={{ fontSize: 10, fontWeight: 700, color: '#94A3B8', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 2, paddingLeft: 14, opacity: 0, transition: 'opacity .15s', whiteSpace: 'nowrap' }}>{label}</span>
      {children}
    </div>
  );
}

/* ── Slide-out panel ── */
function SlidePanel({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div style={{
      position: 'absolute', left: 68, top: 0, bottom: 0, width: 280,
      background: C.panel, borderRight: '1px solid #E2E8F0', zIndex: 30,
      boxShadow: '4px 0 16px rgba(0,0,0,.06)', display: 'flex', flexDirection: 'column',
      animation: 'slideIn .2s ease',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid #E2E8F0' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{title}</span>
        <button onClick={onClose} style={{ width: 24, height: 24, border: 'none', background: '#F1F5F9', borderRadius: 6, cursor: 'pointer', color: '#64748B', fontSize: 14 }}>✕</button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>{children}</div>
    </div>
  );
}

/* ── Small UI helpers ── */
function Row({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #F1F5F9' }}>
      <span style={{ fontSize: 12, color: '#64748B' }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 600, color: color || C.text }}>{value}</span>
    </div>
  );
}

function Slider({ label, value, min, max, color, suffix, onChange }: { label: string; value: number; min: number; max: number; color: string; suffix: string; onChange: (v: number) => void }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
        <span style={{ fontSize: 12, color: '#64748B' }}>{label}</span>
        <span style={{ fontSize: 12, color, fontWeight: 700 }}>{value}{suffix}</span>
      </div>
      <input type="range" min={min} max={max} value={value} onChange={e => onChange(Number(e.target.value))} style={{ width: '100%', accentColor: color }} />
    </div>
  );
}

function ToolBtn({ icon, label, active, onClick }: { icon: string; label: string; active?: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
      padding: '12px 4px', borderRadius: 8, cursor: 'pointer',
      border: `1px solid ${active ? C.blue : '#E2E8F0'}`,
      background: active ? 'rgba(37,99,235,.06)' : '#fff',
      color: active ? C.blue : '#475569', fontSize: 11, fontWeight: 500, width: '100%',
    }}>
      <span style={{ fontSize: 18 }}>{icon}</span>
      <span>{label}</span>
    </button>
  );
}

function PrimaryBtn({ children, onClick, color = C.navy, disabled }: { children: React.ReactNode; onClick: () => void; color?: string; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{ width: '100%', padding: '10px 0', borderRadius: 8, border: 'none', background: color, color: '#fff', fontSize: 12, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer', marginBottom: 8, opacity: disabled ? 0.5 : 1 }}>{children}</button>
  );
}

// Simple unique id — no external uuid dependency needed
function makeProjectId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `proj-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export default function DesignPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapBackgroundRef>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [view3D, setView3D] = useState(false);
  const [openPanel, setOpenPanel] = useState<PanelKey>('roof');
  const [mapMode, setMapMode] = useState(true);
  const [showIrregularTool, setShowIrregularTool] = useState(false);
  const [currentLocation, setCurrentLocation] = useState({ lat: 19.2403, lng: 73.1305 });

  const searchParams = useSearchParams();
  const isClientView = searchParams.get('client') === '1';
  const router = useRouter();
  const pathname = usePathname();

  useKeyboardShortcuts();

  const {
    activeTool, setActiveTool, roofs, obstacles, panels, equipment, project, updateProject,
    showGrid, toggleGrid, snapEnabled, toggleSnap, zoomIn, zoomOut, fitToScreen, scale,
    undo, redo, historyIndex, history, cursorPos, saveStatus, setSaveStatus,
    autoFillRoof, selectedIds, setSelectedIds, removeRoof,
    projectId, setProjectId, saveToSupabase, loadFromSupabase,
  } = useDesignStore();

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

  // Load saved design if ?projectId= is present. If it's NOT present, this
  // page previously left projectId as null forever — meaning Save silently
  // no-op'd every time (see designStore.saveToSupabase's `if (!projectId) return`).
  // Fix: mint a fresh id right away and put it in the URL, so a design started
  // from the nav ("Design" tab, no lead attached) can still be saved & reopened.
  useEffect(() => {
    const pid = searchParams.get('projectId');
    if (pid) {
      (async () => {
        // loadFromSupabase pulls roofs/panels/obstacles from the DESIGNS
        // table — it has nothing to do with the project's own identity.
        await loadFromSupabase(pid);
        // The client's real name & address live on the PROJECT record itself
        // (see ProjectCard's "Open in Designer" link — it only ever passes
        // ?projectId=, never the name/address as params). Fetch that record
        // directly and let it win over whatever the saved design's own
        // project_info snapshot had, since the project record is the
        // authoritative source of truth for who this design is actually for.
        try {
          const { data, error } = await supabase
            .from('projects')
            .select('client_name, address')
            .eq('id', pid)
            .single();
          if (!error && data) {
            updateProject({
              clientName: data.client_name || 'New Client',
              address: data.address || 'Enter address...',
            });
          }
        } catch (err) {
          console.error('Could not load project name/address:', err);
        }
      })();
    } else {
      const newId = makeProjectId();
      setProjectId(newId);
      const params = new URLSearchParams(searchParams.toString());
      params.set('projectId', newId);
      router.replace(`${pathname}?${params.toString()}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once on mount only — searchParams intentionally not a dep here

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

  // Stats
  const panelCount = panels.length;
  const dcKwp = (panelCount * equipment.panelPower) / 1000;
  const generation = dcKwp * 1332;
  const co2 = generation * 0.71;
  const totalRoofAreaM2 = roofs.reduce((a, r) => a + (r.area || 0), 0);
  const bestRoof = roofs.length > 0 ? roofs[0] : null;
  const orientation = bestRoof ? getOptimalOrientation(bestRoof.azimuth) : null;
  const energyPct = Math.min(99, Math.round((dcKwp / Math.max(totalRoofAreaM2 / 10, 1)) * 100));

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
      yearly_units: String(Math.round(generation)),
      monthly_units: String(Math.round(generation / 12)),
    });
    // A full hard navigation (not router.push) — this completely discards
    // the current page instead of trying to smoothly transition within
    // React, sidestepping a re-render race during navigation that was
    // crashing Konva's canvas on this page.
    window.location.href = `/quote?${params.toString()}`;
  }, [panelCount, project.clientName, project.address, dcKwp, totalRoofAreaM2, generation, router]);

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

  const togglePanel = (key: PanelKey) => setOpenPanel(prev => prev === key ? null : key);

  // Client link (?client=1): bypass the entire vendor UI — no top bar, no
  // icon rail, no editing tools. Just the 3D model, read-only, full-screen.
  if (isClientView) {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: C.bg, fontFamily: 'Inter, system-ui, sans-serif' }}>
        {bestRoof ? (
          <SolarDesign3D roofPoints={bestRoof.points} onClose={() => {}} lat={currentLocation.lat} readOnly />
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#64748B', fontSize: 14 }}>
            This design isn't ready to view yet.
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', height: '100vh', display: 'flex', flexDirection: 'column', background: C.bg, fontFamily: 'Inter, system-ui, sans-serif', color: C.text, overflow: 'hidden' }}>
      <style>{`
        @keyframes slideIn { from { transform: translateX(-12px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        .design-rail:hover { width: 220px; }
        .design-rail:hover .design-rail-label { opacity: 1; }
        .design-rail-item:hover:not(.design-rail-item-active) { background: #F1F5F9; }
      `}</style>

      {/* ── TOP BAR ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, height: 52, padding: '0 16px', background: '#fff', borderBottom: '1px solid #E2E8F0', flexShrink: 0, boxShadow: '0 1px 3px rgba(0,0,0,.04)', zIndex: 40 }}>
        <div style={{ width: 28, height: 28, borderRadius: 7, background: C.blue, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 13 }}>S</div>
        <span style={{ fontSize: 14, fontWeight: 700 }}>Solar Designer</span>
        <span style={{ fontSize: 12, color: '#94A3B8' }}>·</span>
        <span style={{ fontSize: 12, color: '#64748B' }}>{project.clientName || 'New Project'}</span>

        {/* Toolbar icons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginLeft: 16 }}>
          <IconBtn icon="↩" title="Undo" onClick={undo} dim={historyIndex <= 0} />
          <IconBtn icon="↪" title="Redo" onClick={redo} dim={historyIndex >= history.length - 1} />
          <Sep />
          <IconBtn icon="⊞" title="Grid" active={showGrid} onClick={toggleGrid} />
          <IconBtn icon="⊡" title="Snap" active={snapEnabled} onClick={toggleSnap} />
          <IconBtn icon="⊕" title="Zoom In" onClick={zoomIn} />
          <IconBtn icon="⊖" title="Zoom Out" onClick={zoomOut} />
          <IconBtn icon="⛶" title="Fit" onClick={fitToScreen} />
        </div>

        {/* Stats top-right */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 0 }}>
          <button
            onClick={saveToSupabase}
            disabled={saveStatus === 'saving'}
            style={{
              padding: '8px 14px', borderRadius: 8, border: 'none',
              background: saveStatus === 'saving' ? '#94A3B8' : C.blue,
              color: '#fff', fontSize: 12, fontWeight: 600,
              cursor: saveStatus === 'saving' ? 'not-allowed' : 'pointer',
              marginRight: 10, opacity: saveStatus === 'saving' ? 0.7 : 1,
            }}
          >
            {saveStatus === 'saving' ? '⟳ Saving…' : saveStatus === 'unsaved' ? '💾 Save' : '✓ Saved'}
          </button>

          <button onClick={() => setView3D(v => !v)} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: view3D ? '#7C3AED' : '#1E293B', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', marginRight: 16 }}>
            {view3D ? '◱ 2D View' : '🧊 3D View'}
          </button>
          <Stat label="Size" value={`${dcKwp.toFixed(2)} kW`} />
          <Stat label="Panels" value={panelCount.toString()} />
          <Stat label="Energy" value={`${energyPct}%`} color="#16A34A" />
          <Stat label="Area" value={`${totalRoofAreaM2.toFixed(0)} m²`} />
        </div>
      </div>

      {/* ── BODY ── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0, position: 'relative' }}>

        {/* LEFT ICON RAIL */}
        <div className="design-rail" style={{ width: 68, flexShrink: 0, background: C.rail, borderRight: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', alignItems: 'stretch', padding: '12px 8px', overflowY: 'auto', overflowX: 'hidden', zIndex: 35, transition: 'width .2s ease' }}>
          <RailGroup label="Step 1">
            <RailIcon icon="📍" label="Find Location" active={openPanel === 'view'} onClick={() => togglePanel('view')} />
          </RailGroup>

          <RailGroup label="Step 2">
            <RailIcon icon="🏠" label="Draw Roof" active={openPanel === 'roof'} onClick={() => togglePanel('roof')} />
          </RailGroup>

          <RailGroup label="Info">
            <RailIcon icon="📊" label="Statistics" active={openPanel === 'stats'} onClick={() => togglePanel('stats')} />
          </RailGroup>
        </div>

        {/* SLIDE-OUT PANELS */}
        {openPanel === 'view' && (
          <SlidePanel title="Location" onClose={() => setOpenPanel(null)}>
            <AddressSearch onLocationSelect={handleLocationSelect} />
            <div style={{ marginTop: 12, display: 'flex', gap: 6 }}>
              <button onClick={() => setMapMode(true)} style={{ flex: 1, padding: '8px 0', borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: 'pointer', background: mapMode ? C.navy : '#F8FAFC', color: mapMode ? '#fff' : '#64748B', border: `1px solid ${mapMode ? C.navy : '#E2E8F0'}` }}>🗺 Navigate</button>
              <button onClick={() => setMapMode(false)} style={{ flex: 1, padding: '8px 0', borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: 'pointer', background: !mapMode ? '#7C3AED' : '#F8FAFC', color: !mapMode ? '#fff' : '#64748B', border: `1px solid ${!mapMode ? '#7C3AED' : '#E2E8F0'}` }}>✏ Draw</button>
            </div>
            <p style={{ fontSize: 11, color: '#94A3B8', marginTop: 10, lineHeight: 1.5 }}>
              {mapMode ? 'Pan & zoom to find the building, then switch to Draw mode and press P to trace the roof.' : 'Press P to draw the roof outline. Double-click to close.'}
            </p>
          </SlidePanel>
        )}

        {openPanel === 'roof' && (
          <SlidePanel title="Draw Building Outline" onClose={() => setOpenPanel(null)}>
            {!bestRoof && (
              <>
                <div style={{ padding: 12, background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 8, fontSize: 12, color: '#1E40AF', lineHeight: 1.6, marginBottom: 14 }}>
                  Most rooftops are simple rectangles — start there. Drag one corner-to-corner over the building in the satellite image.
                </div>

                <button
                  onClick={() => { setActiveTool('rectangle'); setMapMode(false); }}
                  style={{
                    width: '100%', padding: '16px 0', borderRadius: 10, cursor: 'pointer', marginBottom: 10,
                    border: `2px solid ${activeTool === 'rectangle' ? '#2563EB' : '#E2E8F0'}`,
                    background: activeTool === 'rectangle' ? '#EFF6FF' : '#fff',
                    color: activeTool === 'rectangle' ? '#1E3A5F' : '#334155',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                  }}
                >
                  <span style={{ fontSize: 26 }}>⬜</span>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>Trace Rectangle Roof</span>
                  <span style={{ fontSize: 10, color: '#64748B', fontWeight: 400 }}>Click one corner, drag to the opposite corner</span>
                </button>

                {!showIrregularTool ? (
                  <button onClick={() => setShowIrregularTool(true)} style={{ width: '100%', padding: '8px 0', background: 'none', border: 'none', color: '#2563EB', fontSize: 12, fontWeight: 600, cursor: 'pointer', marginBottom: 14 }}>
                    My roof isn't a simple rectangle →
                  </button>
                ) : (
                  <div style={{ marginBottom: 14 }}>
                    <ToolBtn icon="⬡" label="Draw Custom Outline (point-by-point)" active={activeTool === 'polygon'} onClick={() => { setActiveTool('polygon'); setMapMode(false); }} />
                    <p style={{ fontSize: 10, color: '#94A3B8', marginTop: 8, lineHeight: 1.5 }}>
                      Click each corner of the building, following its actual shape. Double-click the last corner to close the outline.
                    </p>
                  </div>
                )}
              </>
            )}

            {bestRoof && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                <ToolBtn icon="⬡" label="Draw Polygon" active={activeTool === 'polygon'} onClick={() => { setActiveTool('polygon'); setMapMode(false); }} />
                <ToolBtn icon="⬜" label="Rectangle" active={activeTool === 'rectangle'} onClick={() => { setActiveTool('rectangle'); setMapMode(false); }} />
                <ToolBtn icon="✥" label="Edit Points" active={activeTool === 'select'} onClick={() => { setActiveTool('select'); setMapMode(false); }} />
                <ToolBtn icon="✕" label="Delete" active={activeTool === 'delete'} onClick={() => setActiveTool('delete')} />
              </div>
            )}

            {bestRoof && (
              <div style={{ marginBottom: 14 }}>
                <ToolBtn icon="⛔" label="Add Obstacle" active={activeTool === 'obstacle'} onClick={() => { setActiveTool('obstacle'); setMapMode(false); }} />
                <p style={{ fontSize: 10, color: '#94A3B8', marginTop: 6, lineHeight: 1.5 }}>
                  Trace skylights, AC units, water tanks & staircase heads visible on the roof — Auto-Fill will route panels around them.
                </p>
              </div>
            )}

            {bestRoof ? (
              <>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Roof Info</div>
                <Row label="Area" value={`${(bestRoof.area || 0).toFixed(1)} m²`} />
                <Row label="Corners" value={bestRoof.points.length.toString()} />
                <Row label="Slope" value={`${bestRoof.slope}°`} />
                <Row label="Facing" value={orientation?.label || '—'} color={orientation?.color} />
                <Row label="Obstacles" value={obstacles.length.toString()} color={obstacles.length > 0 ? '#EA580C' : undefined} />

                <div style={{ marginTop: 16, padding: 14, background: '#F0FDF4', border: '1px solid #86EFAC', borderRadius: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#15803D', marginBottom: 6 }}>✓ Roof outline ready!</div>
                  <div style={{ fontSize: 11, color: '#166534', lineHeight: 1.5, marginBottom: 10 }}>Now switch to 3D to add panels, set tilt, and see shadows.</div>
                  <button onClick={() => setView3D(true)} style={{ width: '100%', padding: '11px 0', borderRadius: 8, border: 'none', background: '#1E3A5F', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                    🧊 Continue to 3D Design →
                  </button>
                </div>

                <button
                  onClick={() => {
                    if (window.confirm('Delete this roof outline? This also removes every panel placed on it. You can Undo (↩ in the top bar) right after if this was a mistake.')) {
                      removeRoof(bestRoof.id);
                      setActiveTool('polygon');
                      setShowIrregularTool(false);
                    }
                  }}
                  style={{ width: '100%', marginTop: 10, padding: '9px 0', borderRadius: 8, border: '1px solid #FCA5A5', background: '#FEF2F2', color: '#B91C1C', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                >
                  🗑 Delete Roof & Start Over
                </button>
              </>
            ) : null}
          </SlidePanel>
        )}

        {openPanel === 'stats' && (
          <SlidePanel title="System Statistics" onClose={() => setOpenPanel(null)}>
            <Row label="Roof Area" value={`${totalRoofAreaM2.toFixed(1)} m²`} />
            <Row label="Usable Area" value={`${(totalRoofAreaM2 * 0.75).toFixed(1)} m²`} />
            <Row label="Total Panels" value={panelCount.toString()} />
            <Row label="DC Capacity" value={`${dcKwp.toFixed(2)} kWp`} />
            <Row label="AC Capacity" value={`${(dcKwp * 0.78).toFixed(2)} kW`} />
            <div style={{ height: 8 }} />
            <Row label="Annual Generation" value={`${(generation / 1000).toFixed(1)} MWh`} color="#16A34A" />
            <Row label="CO₂ Offset" value={`${(co2 / 1000).toFixed(2)} t/yr`} color="#16A34A" />
            <div style={{ marginTop: 16 }}>
              <PrimaryBtn
                onClick={saveToSupabase}
                disabled={saveStatus === 'saving'}
              >
                {saveStatus === 'saving' ? '⟳ Saving…' : saveStatus === 'unsaved' ? '💾 Save Design' : '✓ Saved'}
              </PrimaryBtn>
              <PrimaryBtn onClick={generateQuote} color="#2563EB">📄 Generate Quote</PrimaryBtn>
              <PrimaryBtn onClick={copyClientLink} color="#16A34A">🔗 Copy Client Link</PrimaryBtn>
              <div style={{ fontSize: 10, color: '#94A3B8', marginTop: -4, lineHeight: 1.4 }}>
                Opens a view-only 3D model for the client — no editing tools, just orbit/zoom and the sun path. Save first so the link shows your latest design.
              </div>
            </div>
          </SlidePanel>
        )}

        {/* CENTER WORKSPACE */}
        <div ref={containerRef} style={{ flex: 1, position: 'relative', overflow: 'hidden', background: '#E2E8F0' }}>
          <div style={{ position: 'absolute', inset: 0, zIndex: 1, pointerEvents: mapMode ? 'auto' : 'none' }}>
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
            <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 20, display: 'flex', gap: 6, alignItems: 'center', background: mapMode ? 'rgba(30,58,95,.92)' : 'rgba(124,58,237,.92)', color: '#fff', padding: '6px 12px', borderRadius: 20, fontSize: 11, fontWeight: 600, boxShadow: '0 2px 8px rgba(0,0,0,.15)' }}>
              {mapMode ? '🗺 Navigate Mode — pan & zoom freely' : '✏ Draw Mode — press P to trace roof'}
            </div>
          )}

          {/* Drawing hint */}
          {activeTool === 'polygon' && !view3D && (
            <div style={{ position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)', background: 'rgba(30,41,59,.92)', color: '#fff', borderRadius: 8, padding: '8px 16px', fontSize: 11, zIndex: 20 }}>
              Click to add points · <strong>Double-click</strong> to close · <kbd style={{ background: '#475569', borderRadius: 3, padding: '1px 5px', fontSize: 10 }}>Esc</kbd> to cancel
            </div>
          )}
        </div>
      </div>

      {/* BOTTOM STATUS BAR */}
      {!view3D && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, height: 30, padding: '0 16px', background: '#fff', borderTop: '1px solid #E2E8F0', fontSize: 11, color: '#94A3B8', flexShrink: 0 }}>
          <span><span style={{ color: '#94A3B8' }}>Tool</span> <span style={{ color: '#334155', fontWeight: 600 }}>{activeTool.toUpperCase()}</span></span>
          <span style={{ color: '#CBD5E1' }}>·</span>
          <span><span style={{ color: '#94A3B8' }}>XY</span> <span style={{ color: '#334155', fontFamily: 'monospace' }}>{cursorPos.x.toFixed(0)}, {cursorPos.y.toFixed(0)}</span></span>
          <span style={{ color: '#CBD5E1' }}>·</span>
          <span><span style={{ color: '#94A3B8' }}>Zoom</span> <span style={{ color: '#334155', fontFamily: 'monospace' }}>{(scale * 100).toFixed(0)}%</span></span>
          <span style={{ color: '#CBD5E1' }}>·</span>
          <span><span style={{ color: '#94A3B8' }}>Roof</span> <span style={{ color: '#334155', fontFamily: 'monospace' }}>{totalRoofAreaM2.toFixed(1)} m²</span></span>
          <span style={{ color: '#CBD5E1' }}>·</span>
          <span><span style={{ color: '#94A3B8' }}>Panels</span> <span style={{ color: '#334155', fontFamily: 'monospace' }}>{panelCount}</span></span>
          <span style={{ marginLeft: 'auto', color: saveStatus === 'saved' ? '#16A34A' : saveStatus === 'saving' ? '#D97706' : '#94A3B8', fontWeight: 600 }}>
            {saveStatus === 'saved' ? '✓ Saved' : saveStatus === 'saving' ? '⟳ Saving…' : '● Unsaved'}
          </span>
        </div>
      )}
    </div>
  );
}

function IconBtn({ icon, title, active, dim, onClick }: { icon: string; title: string; active?: boolean; dim?: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} title={title} style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', borderRadius: 7, cursor: 'pointer', background: active ? 'rgba(37,99,235,.1)' : 'transparent', color: active ? '#2563EB' : '#64748B', fontSize: 15, opacity: dim ? 0.3 : 1 }}>{icon}</button>
  );
}
function Sep() { return <div style={{ width: 1, height: 20, background: '#E2E8F0', margin: '0 4px' }} />; }
function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ padding: '0 14px', borderLeft: '1px solid #E2E8F0', textAlign: 'center' }}>
      <div style={{ fontSize: 10, color: '#94A3B8', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: color || '#1E293B' }}>{value}</div>
    </div>
  );
}
