'use client';
import React from 'react';
import { MapPin, Home, BarChart3, type LucideIcon } from 'lucide-react';

const C = { rail: 'var(--design-panel)', border: 'var(--design-border)', railActive: 'var(--design-navy)', muted: 'var(--design-muted)' };

export type DesignPanelKey = 'view' | 'roof' | 'obstacles' | 'shading' | 'panels' | 'sun' | 'stats' | null;

interface RailToolDef {
  key: DesignPanelKey;
  label: string;
  icon: LucideIcon;
  shortcut?: string;
}

interface RailGroupDef {
  label: string;
  tools: RailToolDef[];
}

const RAIL_GROUPS: RailGroupDef[] = [
  { label: 'Step 1', tools: [{ key: 'view', label: 'Find Location', icon: MapPin }] },
  { label: 'Step 2', tools: [{ key: 'roof', label: 'Draw Roof', icon: Home, shortcut: 'P' }] },
  { label: 'Info', tools: [{ key: 'stats', label: 'Statistics', icon: BarChart3 }] },
];

function RailIcon({ icon: Icon, label, shortcut, active, onClick }: {
  icon: LucideIcon; label: string; shortcut?: string; active: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={shortcut ? `${label} (${shortcut})` : label}
      aria-label={label}
      aria-pressed={active}
      className={`design-rail-item${active ? ' design-rail-item-active' : ''}`}
      style={{
        width: '100%', height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center',
        border: 'none', cursor: 'pointer', borderRadius: 10,
        background: active ? C.railActive : 'transparent',
        color: active ? '#fff' : C.muted, transition: 'background .15s',
      }}
    >
      <Icon size={18} strokeWidth={2} />
    </button>
  );
}

function RailGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingBottom: 8, marginBottom: 8, borderBottom: `1px solid ${C.border}`, width: '100%' }} title={label}>
      {children}
    </div>
  );
}

interface DesignToolRailProps {
  openPanel: DesignPanelKey;
  onTogglePanel: (key: DesignPanelKey) => void;
}

export function DesignToolRail({ openPanel, onTogglePanel }: DesignToolRailProps) {
  return (
    <nav
      aria-label="Design tools"
      style={{
        width: 68, flexShrink: 0, background: C.rail, borderRight: `1px solid ${C.border}`,
        display: 'flex', flexDirection: 'column', alignItems: 'stretch', padding: '12px 8px',
        overflowY: 'auto', overflowX: 'hidden', zIndex: 5,
      }}
    >
      <style>{`.design-rail-item:hover:not(.design-rail-item-active) { background: var(--design-input-bg); }`}</style>
      {RAIL_GROUPS.map(group => (
        <RailGroup key={group.label} label={group.label}>
          {group.tools.map(tool => (
            <RailIcon
              key={tool.key}
              icon={tool.icon}
              label={tool.label}
              shortcut={tool.shortcut}
              active={openPanel === tool.key}
              onClick={() => onTogglePanel(tool.key)}
            />
          ))}
        </RailGroup>
      ))}
    </nav>
  );
}
