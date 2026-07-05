'use client';
import React from 'react';
import { useDesignStore } from '../../store/designStore';
import { pxToM2, polygonArea, formatCapacity } from '../../utils/geometry';

export function BottomStatusBar() {
  const {
    cursorPos, scale, selectedIds,
    roofs, panels, obstacles, saveStatus,
    activeTool,
  } = useDesignStore();

  const totalRoofAreaM2 = pxToM2(roofs.reduce((a, r) => a + polygonArea(r.points), 0));
  const dcKwp = (panels.length * 580) / 1000;

  const firstId = selectedIds[0];
  const selectedRoof = firstId ? roofs.find(r => r.id === firstId) : null;
  const selectedObs = firstId ? obstacles.find(o => o.id === firstId) : null;
  const selectedPanel = firstId ? panels.find(p => p.id === firstId) : null;

  let selectedLabel = '—';
  if (selectedRoof) selectedLabel = `Roof (${pxToM2(polygonArea(selectedRoof.points)).toFixed(1)} m²)`;
  else if (selectedObs) selectedLabel = `Obstacle: ${selectedObs.label}`;
  else if (selectedPanel) selectedLabel = `Panel (${selectedPanel.power}Wp)`;
  else if (selectedIds.length > 1) selectedLabel = `${selectedIds.length} objects`;

  const saveColor = saveStatus === 'saved' ? 'text-emerald-400' : saveStatus === 'saving' ? 'text-amber-400' : 'text-slate-400';
  const saveIcon = saveStatus === 'saved' ? '✓' : saveStatus === 'saving' ? '⟳' : '●';

  return (
    <div className="status-bar">
      <StatusItem label="Tool" value={activeTool.toUpperCase()} />
      <Dot />
      <StatusItem label="XY" value={`${cursorPos.x.toFixed(0)}, ${cursorPos.y.toFixed(0)}`} mono />
      <Dot />
      <StatusItem label="Zoom" value={`${(scale * 100).toFixed(0)}%`} mono />
      <Dot />
      <StatusItem label="Selected" value={selectedLabel} />
      <Dot />
      <StatusItem label="Roof Area" value={`${totalRoofAreaM2.toFixed(1)} m²`} mono />
      <Dot />
      <StatusItem label="Panels" value={panels.length.toString()} mono />
      <Dot />
      <StatusItem label="Capacity" value={formatCapacity(dcKwp)} mono />
      <div className="ml-auto flex items-center gap-1.5">
        <span className={`text-xs font-medium ${saveColor}`}>{saveIcon}</span>
        <span className={`text-xs ${saveColor}`}>
          {saveStatus === 'saved' ? 'All saved' : saveStatus === 'saving' ? 'Saving…' : 'Unsaved changes'}
        </span>
      </div>
    </div>
  );
}

function StatusItem({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-slate-600 text-xs">{label}</span>
      <span className={`text-slate-300 text-xs font-medium ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}

function Dot() {
  return <span className="text-slate-700 text-xs">·</span>;
}
