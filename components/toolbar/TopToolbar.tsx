'use client';
import React from 'react';
import { useDesignStore } from '../../store/designStore';
import { ToolType } from '../../types';

interface ToolDef {
  id: ToolType | string;
  icon: string;
  label: string;
  shortcut?: string;
  action?: () => void;
  isToggle?: boolean;
  isActive?: boolean;
  dividerBefore?: boolean;
}

function ToolBtn({
  icon, label, shortcut, active, onClick, className = ''
}: {
  icon: string; label: string; shortcut?: string;
  active?: boolean; onClick: () => void; className?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={`${label}${shortcut ? ` (${shortcut})` : ''}`}
      className={`toolbar-btn group relative ${active ? 'toolbar-btn-active' : ''} ${className}`}
    >
      <span className="text-base leading-none">{icon}</span>
      <span className="toolbar-label">{label}</span>
    </button>
  );
}

function Divider() {
  return <div className="w-px h-6 bg-slate-700/60 mx-0.5" />;
}

export function TopToolbar() {
  const {
    activeTool, setActiveTool,
    undo, redo, historyIndex, history,
    zoomIn, zoomOut, fitToScreen,
    showGrid, toggleGrid,
    snapEnabled, toggleSnap,
    setSaveStatus, saveStatus,
  } = useDesignStore();

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  const setTool = (t: ToolType) => setActiveTool(t);

  const handleSave = () => {
    setSaveStatus('saving');
    setTimeout(() => setSaveStatus('saved'), 800);
  };

  return (
    <div className="top-toolbar">
      {/* History */}
      <ToolBtn icon="↩" label="Undo" shortcut="Ctrl+Z" onClick={undo}
        className={!canUndo ? 'opacity-30 cursor-not-allowed' : ''} />
      <ToolBtn icon="↪" label="Redo" shortcut="Ctrl+Y" onClick={redo}
        className={!canRedo ? 'opacity-30 cursor-not-allowed' : ''} />
      <Divider />

      {/* Selection tools */}
      <ToolBtn icon="⊹" label="Select" shortcut="V"
        active={activeTool === 'select'} onClick={() => setTool('select')} />
      <ToolBtn icon="✥" label="Move" shortcut="M"
        active={activeTool === 'move'} onClick={() => setTool('move')} />
      <Divider />

      {/* Draw tools */}
      <ToolBtn icon="⬡" label="Polygon" shortcut="P"
        active={activeTool === 'polygon'} onClick={() => setTool('polygon')} />
      <ToolBtn icon="⬜" label="Rectangle" shortcut="R"
        active={activeTool === 'rectangle'} onClick={() => setTool('rectangle')} />
      <ToolBtn icon="⬛" label="Obstacle" shortcut="O"
        active={activeTool === 'obstacle'} onClick={() => setTool('obstacle')} />
      <Divider />

      {/* Panel tools */}
      <ToolBtn icon="▦" label="Solar Panel" shortcut="S"
        active={activeTool === 'panel'} onClick={() => setTool('panel')} />
      <ToolBtn icon="↻" label="Rotate" shortcut="—"
        active={activeTool === 'rotate'} onClick={() => setTool('rotate')} />
      <ToolBtn icon="✕" label="Delete" shortcut="Del"
        active={activeTool === 'delete'} onClick={() => setTool('delete')} />
      <Divider />

      {/* Measure */}
      <ToolBtn icon="📐" label="Measure" shortcut="E"
        active={activeTool === 'measure'} onClick={() => setTool('measure')} />
      <Divider />

      {/* View */}
      <ToolBtn icon="🔍+" label="Zoom In" onClick={zoomIn} />
      <ToolBtn icon="🔍−" label="Zoom Out" onClick={zoomOut} />
      <ToolBtn icon="⊞" label="Fit Screen" onClick={fitToScreen} />
      <Divider />

      {/* Toggles */}
      <ToolBtn icon="⊞" label="Grid" active={showGrid} onClick={toggleGrid} />
      <ToolBtn icon="⊡" label="Snap" active={snapEnabled} onClick={toggleSnap} />
      <Divider />

      {/* Save / Export */}
      <ToolBtn
        icon={saveStatus === 'saving' ? '⟳' : saveStatus === 'saved' ? '✓' : '💾'}
        label={saveStatus === 'saving' ? 'Saving…' : saveStatus === 'saved' ? 'Saved' : 'Save'}
        shortcut="Ctrl+S"
        onClick={handleSave}
        className={saveStatus === 'saved' ? 'text-emerald-400' : ''}
      />
      <ToolBtn icon="📄" label="Export PDF" onClick={() => alert('Export PDF — integrate with your PDF generator')} />
    </div>
  );
}
