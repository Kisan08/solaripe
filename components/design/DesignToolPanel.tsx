'use client';
import React from 'react';
import { X } from 'lucide-react';

const C = { panel: 'var(--design-panel)', border: 'var(--design-border)', text: 'var(--design-text)', muted: 'var(--design-muted)' };

interface DesignToolPanelProps {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}

export function DesignToolPanel({ title, children, onClose }: DesignToolPanelProps) {
  return (
    <div
      role="region"
      aria-label={title}
      style={{
        width: 280, flexShrink: 0, background: C.panel, borderRight: `1px solid ${C.border}`,
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{title}</span>
        <button
          onClick={onClose}
          aria-label={`Close ${title} panel`}
          style={{ width: 24, height: 24, border: 'none', background: 'var(--design-input-bg)', borderRadius: 6, cursor: 'pointer', color: C.muted, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <X size={14} />
        </button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>{children}</div>
    </div>
  );
}
