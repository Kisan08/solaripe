'use client';
import React from 'react';
import { Eye, EyeOff, Layers } from 'lucide-react';

const C = {
  panel: 'var(--design-panel)', border: 'var(--design-border)', text: 'var(--design-text)',
  muted: 'var(--design-muted)',
};

export type LayerKey = 'roof' | 'obstacles' | 'satellite';

interface DesignLayersPanelProps {
  layerVisibility: Record<LayerKey, boolean>;
  onToggleLayer: (layer: LayerKey) => void;
  roofCount: number;
  obstacleCount: number;
}

function LayerRow({ label, visible, count, onToggle }: {
  label: string; visible: boolean; count?: number; onToggle: () => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          onClick={onToggle}
          aria-label={`${visible ? 'Hide' : 'Show'} ${label} layer`}
          aria-pressed={visible}
          style={{ width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', cursor: 'pointer', color: visible ? C.text : C.muted, opacity: visible ? 1 : 0.5 }}
        >
          {visible ? <Eye size={14} /> : <EyeOff size={14} />}
        </button>
        <span style={{ fontSize: 12, color: visible ? C.text : C.muted }}>{label}</span>
      </div>
      {typeof count === 'number' && (
        <span style={{ fontSize: 11, color: C.muted, fontFamily: 'monospace' }}>{count}</span>
      )}
    </div>
  );
}

/**
 * Every toggle here genuinely controls DesignCanvas's rendering via
 * designStore.layerVisibility — none of these are decorative. Scoped to
 * what's real in the 2D canvas today; see designStore.ts's layerVisibility
 * comment for why Panels/Strings/Shadows/Parapet/Building aren't here
 * (those only exist in the 3D scene and aren't wired to visibility toggles
 * yet).
 */
export function DesignLayersPanel({ layerVisibility, onToggleLayer, roofCount, obstacleCount }: DesignLayersPanelProps) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, marginTop: 16, paddingTop: 16, borderTop: `1px solid ${C.border}` }}>
        <Layers size={14} color={C.muted} />
        <span style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Layers</span>
      </div>
      <LayerRow label="Roof" visible={layerVisibility.roof} count={roofCount} onToggle={() => onToggleLayer('roof')} />
      <LayerRow label="Obstacles" visible={layerVisibility.obstacles} count={obstacleCount} onToggle={() => onToggleLayer('obstacles')} />
      <LayerRow label="Satellite" visible={layerVisibility.satellite} onToggle={() => onToggleLayer('satellite')} />
      <p style={{ fontSize: 9.5, color: C.muted, marginTop: 10, lineHeight: 1.4 }}>
        3D-only layers (panels, strings, shadows) aren't controllable from here yet — switch to 3D to work with those.
      </p>
    </div>
  );
}
