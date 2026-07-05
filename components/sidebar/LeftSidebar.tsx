'use client';
import React, { useState } from 'react';
import { useDesignStore } from '../../store/designStore';
import { ToolType } from '../../types';
import { formatCapacity, pxToM2, polygonArea, PIXELS_PER_METER } from '../../utils/geometry';

interface CollapsibleCardProps {
  title: string;
  icon: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

function CollapsibleCard({ title, icon, children, defaultOpen = true }: CollapsibleCardProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="sidebar-card">
      <button
        onClick={() => setOpen(o => !o)}
        className="sidebar-card-header"
      >
        <span className="flex items-center gap-2">
          <span className="text-blue-400">{icon}</span>
          <span className="text-xs font-semibold tracking-widest uppercase text-slate-300">{title}</span>
        </span>
        <span className={`text-slate-500 text-xs transition-transform ${open ? 'rotate-180' : ''}`}>▼</span>
      </button>
      {open && <div className="sidebar-card-body">{children}</div>}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center py-1 border-b border-slate-800/60">
      <span className="text-slate-500 text-xs">{label}</span>
      <span className="text-slate-200 text-xs font-medium tabular-nums">{value}</span>
    </div>
  );
}

function ToolButton({ tool, label, icon, active, onClick }: {
  tool: ToolType; label: string; icon: string; active: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`tool-btn ${active ? 'tool-btn-active' : ''}`}
      title={label}
    >
      <span className="text-base">{icon}</span>
      <span className="text-xs">{label}</span>
    </button>
  );
}

export function LeftSidebar() {
  const {
    project, equipment, roofs, panels, activeTool, setActiveTool,
    autoFillRoof,
  } = useDesignStore();

  const totalRoofAreaPx = roofs.reduce((a, r) => a + polygonArea(r.points), 0);
  const totalRoofAreaM2 = pxToM2(totalRoofAreaPx);
  const usableAreaM2 = totalRoofAreaM2 * 0.75;
  const panelCount = panels.length;
  const dcKwp = (panelCount * equipment.panelPower) / 1000;
  const acKw = dcKwp * 0.78;
  const generation = dcKwp * 1332;
  const co2 = generation * 0.71;
  const utilization = totalRoofAreaM2 > 0
    ? Math.min(100, ((panelCount * (equipment.panelWidth / 1000) * (equipment.panelHeight / 1000)) / totalRoofAreaM2) * 100)
    : 0;

  const tools: { tool: ToolType; label: string; icon: string }[] = [
    { tool: 'polygon', label: 'Draw Roof', icon: '⬡' },
    { tool: 'obstacle', label: 'Obstacle', icon: '⬛' },
    { tool: 'panel', label: 'Add Panel', icon: '▦' },
    { tool: 'delete', label: 'Delete', icon: '✕' },
    { tool: 'measure', label: 'Measure', icon: '📐' },
    { tool: 'rotate', label: 'Rotate', icon: '↻' },
    { tool: 'move', label: 'Move', icon: '✥' },
  ];

  const handleAutoFill = () => {
    roofs.forEach(r => autoFillRoof(r.id, equipment));
  };

  return (
    <aside className="left-sidebar">
      {/* Branding strip */}
      <div className="px-4 py-3 border-b border-slate-800 flex items-center gap-2">
        <div className="w-6 h-6 rounded bg-blue-500 flex items-center justify-center text-xs font-bold">S</div>
        <span className="text-slate-200 font-semibold text-sm tracking-wide">SolarDesign</span>
        <span className="ml-auto text-xs text-slate-600 font-mono">v2.4</span>
      </div>

      <div className="overflow-y-auto flex-1 space-y-1 p-2">
        <CollapsibleCard title="Project" icon="🏗">
          <InfoRow label="Client" value={project.clientName || '—'} />
          <InfoRow label="Address" value={project.address.length > 20 ? project.address.slice(0, 20) + '…' : project.address} />
          <InfoRow label="Roof Area" value={`${totalRoofAreaM2.toFixed(1)} m²`} />
          <InfoRow label="Usable Area" value={`${usableAreaM2.toFixed(1)} m²`} />
          <InfoRow label="Total Panels" value={panelCount.toString()} />
          <InfoRow label="DC Capacity" value={formatCapacity(dcKwp)} />
          <InfoRow label="AC Capacity" value={`${acKw.toFixed(2)} kW`} />
        </CollapsibleCard>

        <CollapsibleCard title="Equipment" icon="⚡">
          <InfoRow label="Panel" value={equipment.panelModel} />
          <InfoRow label="Power" value={`${equipment.panelPower} Wp`} />
          <InfoRow label="Inverter" value={equipment.inverter} />
          <InfoRow label="Mounting" value={equipment.mountingType} />
        </CollapsibleCard>

        <CollapsibleCard title="Design Tools" icon="✏">
          <div className="grid grid-cols-2 gap-1">
            {tools.map(t => (
              <ToolButton
                key={t.tool}
                {...t}
                active={activeTool === t.tool}
                onClick={() => setActiveTool(t.tool)}
              />
            ))}
          </div>
          <button
            onClick={handleAutoFill}
            disabled={roofs.length === 0}
            className="mt-2 w-full py-1.5 rounded text-xs font-semibold bg-blue-600 hover:bg-blue-500 disabled:opacity-30 disabled:cursor-not-allowed text-white transition-colors"
          >
            ⚡ Auto-Fill All Roofs
          </button>
        </CollapsibleCard>

        <CollapsibleCard title="Statistics" icon="📊">
          <div className="space-y-2">
            <StatBar label="Panels" value={panelCount} unit="" max={200} color="blue" />
            <StatBar label="Roof Utilization" value={utilization} unit="%" max={100} color="emerald" />
            <InfoRow label="Generation" value={`${(generation / 1000).toFixed(1)} MWh/yr`} />
            <InfoRow label="CO₂ Saved" value={`${(co2 / 1000).toFixed(2)} t/yr`} />
            <InfoRow label="System Size" value={formatCapacity(dcKwp)} />
          </div>
        </CollapsibleCard>
      </div>
    </aside>
  );
}

function StatBar({ label, value, unit, max, color }: {
  label: string; value: number; unit: string; max: number; color: string;
}) {
  const pct = Math.min(100, (value / Math.max(max, 1)) * 100);
  const colorMap: Record<string, string> = {
    blue: 'bg-blue-500',
    emerald: 'bg-emerald-500',
    amber: 'bg-amber-500',
  };
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-slate-500">{label}</span>
        <span className="text-slate-200 tabular-nums font-medium">{typeof value === 'number' ? value.toFixed(value % 1 === 0 ? 0 : 1) : value}{unit}</span>
      </div>
      <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${colorMap[color] || 'bg-blue-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
