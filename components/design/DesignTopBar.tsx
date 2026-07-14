'use client';
import React from 'react';
import {
  Undo2, Redo2, Grid3x3, Magnet, ZoomIn, ZoomOut, Maximize2,
  Box, Square, Save, Check, Loader2, Sun, Moon,
} from 'lucide-react';
import type { DesignTheme } from '../../app/design/DesignPageContent';

const C = {
  navy: 'var(--design-navy)', blue: 'var(--design-primary)', border: 'var(--design-border)',
  text: 'var(--design-text)', muted: 'var(--design-muted)', panel: 'var(--design-panel)',
};

interface DesignTopBarProps {
  projectName: string;
  saveStatus: 'saved' | 'unsaved' | 'saving';
  onSave: () => void;

  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;

  showGrid: boolean;
  onToggleGrid: () => void;
  snapEnabled: boolean;
  onToggleSnap: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;

  view3D: boolean;
  onToggleView3D: () => void;

  dcKwp: number;

  theme: DesignTheme;
  onToggleTheme: () => void;
}

function TopBarIconBtn({ icon, title, active, disabled, onClick }: {
  icon: React.ReactNode; title: string; active?: boolean; disabled?: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      disabled={disabled}
      style={{
        width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
        border: 'none', borderRadius: 6, cursor: disabled ? 'default' : 'pointer',
        background: active ? 'color-mix(in srgb, var(--design-primary) 12%, transparent)' : 'transparent',
        color: active ? C.blue : C.muted, opacity: disabled ? 0.35 : 1, flexShrink: 0,
      }}
      className="design-topbar-icon-btn"
    >
      {icon}
    </button>
  );
}

function Sep() {
  return <div style={{ width: 1, height: 20, background: C.border, margin: '0 6px', flexShrink: 0 }} />;
}

export function DesignTopBar({
  projectName, saveStatus, onSave,
  onUndo, onRedo, canUndo, canRedo,
  showGrid, onToggleGrid, snapEnabled, onToggleSnap, onZoomIn, onZoomOut, onFit,
  view3D, onToggleView3D,
  dcKwp,
  theme, onToggleTheme,
}: DesignTopBarProps) {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 10, height: 52, padding: '0 14px',
        background: C.panel, borderBottom: `1px solid ${C.border}`, flexShrink: 0,
        boxShadow: '0 1px 3px rgba(0,0,0,.12)', zIndex: 40, minWidth: 0,
      }}
    >
      <style>{`
        .design-topbar-icon-btn:hover:not(:disabled) { background: var(--design-input-bg); }
        .design-topbar-edit-group { display: flex; align-items: center; gap: 1px; }
        .design-topbar-project-name { display: inline; }
        @media (max-width: 1366px) {
          .design-topbar-project-name { display: none; }
        }
        @media (max-width: 1180px) {
          .design-topbar-edit-group-2d { display: none; }
        }
      `}</style>

      {/* Brand + project identity */}
      <div style={{ width: 26, height: 26, borderRadius: 6, background: C.blue, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 12, flexShrink: 0 }}>S</div>
      <span style={{ fontSize: 13, fontWeight: 700, color: C.text, whiteSpace: 'nowrap', flexShrink: 0 }}>Solar Designer</span>
      <span className="design-topbar-project-name" style={{ fontSize: 12, color: C.muted, opacity: 0.6, flexShrink: 0 }}>/</span>
      <span className="design-topbar-project-name" style={{ fontSize: 12, color: C.muted, whiteSpace: 'nowrap', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {projectName || 'New Project'}
      </span>

      <Sep />

      {/* Editing controls */}
      <div className="design-topbar-edit-group">
        <TopBarIconBtn icon={<Undo2 size={16} />} title="Undo" onClick={onUndo} disabled={!canUndo} />
        <TopBarIconBtn icon={<Redo2 size={16} />} title="Redo" onClick={onRedo} disabled={!canRedo} />
      </div>

      {!view3D && (
        <div className="design-topbar-edit-group-2d" style={{ display: 'flex', alignItems: 'center' }}>
          <Sep />
          <div className="design-topbar-edit-group">
            <TopBarIconBtn icon={<Grid3x3 size={16} />} title="Toggle grid" active={showGrid} onClick={onToggleGrid} />
            <TopBarIconBtn icon={<Magnet size={16} />} title="Snap to grid" active={snapEnabled} onClick={onToggleSnap} />
            <TopBarIconBtn icon={<ZoomIn size={16} />} title="Zoom in" onClick={onZoomIn} />
            <TopBarIconBtn icon={<ZoomOut size={16} />} title="Zoom out" onClick={onZoomOut} />
            <TopBarIconBtn icon={<Maximize2 size={16} />} title="Fit to screen" onClick={onFit} />
          </div>
        </div>
      )}

      {/* Primary actions — right aligned */}
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <span
          title="Current DC system size, based on placed panels"
          style={{ fontSize: 12, color: C.muted, whiteSpace: 'nowrap' }}
        >
          {dcKwp.toFixed(2)} kW
        </span>

        <TopBarIconBtn
          icon={theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          title={theme === 'dark' ? 'Switch to light workspace' : 'Switch to dark workspace'}
          onClick={onToggleTheme}
        />

        <button
          onClick={onSave}
          disabled={saveStatus === 'saving'}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '7px 12px', borderRadius: 7, border: 'none',
            background: saveStatus === 'saving' ? C.muted : saveStatus === 'saved' ? 'var(--design-input-bg)' : C.blue,
            color: saveStatus === 'saved' ? C.text : '#fff',
            fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
            cursor: saveStatus === 'saving' ? 'not-allowed' : 'pointer',
            opacity: saveStatus === 'saving' ? 0.7 : 1,
          }}
        >
          {saveStatus === 'saving' ? <Loader2 size={13} className="animate-spin" /> : saveStatus === 'saved' ? <Check size={13} /> : <Save size={13} />}
          {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'unsaved' ? 'Save' : 'Saved'}
        </button>

        <button
          onClick={onToggleView3D}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '7px 14px', borderRadius: 7, border: 'none',
            background: view3D ? C.navy : C.blue, color: '#fff',
            fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
          }}
        >
          {view3D ? <Square size={13} /> : <Box size={13} />}
          {view3D ? '2D View' : '3D View'}
        </button>
      </div>
    </div>
  );
}
