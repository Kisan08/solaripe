'use client';
import React from 'react';
import { Check, Loader2, Circle } from 'lucide-react';

const C = { border: 'var(--design-border)', muted: 'var(--design-muted)', text: 'var(--design-text)', panel: 'var(--design-panel)' };

interface DesignStatusBarProps {
  activeTool: string;
  cursorX: number;
  cursorY: number;
  scale: number;
  totalRoofAreaM2: number;
  panelCount: number;
  saveStatus: 'saved' | 'unsaved' | 'saving';
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <span>
      <span style={{ color: C.muted }}>{label}</span>{' '}
      <span style={{ color: C.text, fontFamily: 'monospace' }}>{value}</span>
    </span>
  );
}

function Dot() {
  return <span style={{ color: C.muted, opacity: 0.5 }}>·</span>;
}

export function DesignStatusBar({
  activeTool, cursorX, cursorY, scale, totalRoofAreaM2, panelCount, saveStatus,
}: DesignStatusBarProps) {
  const saveColor = saveStatus === 'saved' ? 'var(--design-success-text)' : saveStatus === 'saving' ? 'var(--design-warning-text)' : C.muted;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, height: 30, padding: '0 16px', background: C.panel, borderTop: `1px solid ${C.border}`, fontSize: 11, color: C.muted, flexShrink: 0 }}>
      <span><span style={{ color: C.muted }}>Tool</span> <span style={{ color: C.text, fontWeight: 600 }}>{activeTool.toUpperCase()}</span></span>
      <Dot />
      <Item label="XY" value={`${cursorX.toFixed(0)}, ${cursorY.toFixed(0)}`} />
      <Dot />
      <Item label="Zoom" value={`${(scale * 100).toFixed(0)}%`} />
      <Dot />
      <Item label="Roof" value={`${totalRoofAreaM2.toFixed(1)} m²`} />
      <Dot />
      <Item label="Panels" value={panelCount.toString()} />
      <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5, color: saveColor, fontWeight: 600 }}>
        {saveStatus === 'saved' ? <Check size={12} /> : saveStatus === 'saving' ? <Loader2 size={12} className="animate-spin" /> : <Circle size={7} fill="currentColor" />}
        {saveStatus === 'saved' ? 'Saved' : saveStatus === 'saving' ? 'Saving…' : 'Unsaved changes'}
      </span>
    </div>
  );
}
