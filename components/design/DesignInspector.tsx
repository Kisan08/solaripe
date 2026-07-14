'use client';
import React from 'react';
import { FolderKanban } from 'lucide-react';

const C = {
  panel: 'var(--design-panel)', border: 'var(--design-border)', text: 'var(--design-text)',
  muted: 'var(--design-muted)', navy: 'var(--design-navy)',
};

interface DesignInspectorProps {
  clientName: string;
  address: string;
  projectId: string | null;
  totalRoofAreaM2: number;
  panelCount: number;
  dcKwp: number;
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '6px 0', borderBottom: `1px solid var(--design-row-border)` }}>
      <span style={{ fontSize: 11, color: C.muted, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 11, color: C.text, fontWeight: 600, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</span>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8, marginTop: 4 }}>
      {children}
    </div>
  );
}

/**
 * "Nothing selected" is the only state implemented right now — it's the
 * only one that's safe to build without touching SolarDesign3D. Panel /
 * multi-panel / obstacle / string selection all currently live as local
 * useState inside SolarDesign3D (selectedIds, selectedObstacleId) and are
 * never exposed outside that component, so this outer Inspector has no way
 * to know what's selected in the 3D view yet. Wiring that up is the next
 * piece of work — it needs SolarDesign3D to report selection changes
 * outward (e.g. an onSelectionChange callback prop), not a change to any
 * geometry/interaction logic.
 */
export function DesignInspector({
  clientName, address, projectId, totalRoofAreaM2, panelCount, dcKwp,
}: DesignInspectorProps) {
  return (
    <div style={{ width: 280, flexShrink: 0, background: C.panel, borderLeft: `1px solid ${C.border}`, padding: 16, overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <FolderKanban size={14} color={C.muted} />
        <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>No Selection</span>
      </div>
      <p style={{ fontSize: 10.5, color: C.muted, marginBottom: 16, lineHeight: 1.4 }}>
        Select an object in the viewport to view its properties.
      </p>

      <SectionLabel>Project Info</SectionLabel>
      <InfoRow label="Project Name" value={clientName || '—'} />
      <InfoRow label="Address" value={address || '—'} />
      <InfoRow label="Project ID" value={projectId ? `${projectId.slice(0, 8)}…` : '—'} />
      <InfoRow label="Roof Area" value={`${totalRoofAreaM2.toFixed(1)} m²`} />
      <InfoRow label="Panel Count" value={panelCount.toString()} />
      <InfoRow label="DC Capacity" value={`${dcKwp.toFixed(2)} kWp`} />
    </div>
  );
}
