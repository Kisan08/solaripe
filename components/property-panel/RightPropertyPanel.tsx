'use client';
import React from 'react';
import { useDesignStore } from '../../store/designStore';
import { RoofPolygon, Obstacle, SolarPanel } from '../../types';
import { pxToM2, polygonArea, formatCapacity } from '../../utils/geometry';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-2 px-1">{title}</div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', unit }: {
  label: string; value: string | number; type?: string;
  onChange?: (v: string) => void; unit?: string;
}) {
  return (
    <div className="flex items-center justify-between py-1 px-1 rounded hover:bg-slate-800/40 group">
      <span className="text-slate-500 text-xs w-24 shrink-0">{label}</span>
      {onChange ? (
        <div className="flex items-center gap-1 flex-1 justify-end">
          <input
            type={type}
            value={value}
            onChange={e => onChange(e.target.value)}
            className="bg-slate-800 text-slate-200 text-xs rounded px-2 py-0.5 w-24 text-right border border-slate-700 focus:border-blue-500 focus:outline-none tabular-nums"
          />
          {unit && <span className="text-slate-600 text-xs w-6">{unit}</span>}
        </div>
      ) : (
        <span className="text-slate-200 text-xs font-medium tabular-nums">{value}{unit ? ` ${unit}` : ''}</span>
      )}
    </div>
  );
}

function RoofPanel({ roof }: { roof: RoofPolygon }) {
  const { updateRoof } = useDesignStore();
  const areaM2 = pxToM2(polygonArea(roof.points));

  return (
    <>
      <Section title="Geometry">
        <Field label="Area" value={`${areaM2.toFixed(1)} m²`} />
        <Field label="Vertices" value={roof.points.length} />
      </Section>
      <Section title="Properties">
        <Field
          label="Slope" value={roof.slope} type="number" unit="°"
          onChange={v => updateRoof(roof.id, { slope: Number(v) })}
        />
        <Field
          label="Azimuth" value={roof.azimuth} type="number" unit="°"
          onChange={v => updateRoof(roof.id, { azimuth: Number(v) })}
        />
      </Section>
      <Section title="Appearance">
        <div className="flex items-center justify-between py-1 px-1">
          <span className="text-slate-500 text-xs">Color</span>
          <input
            type="color" value={roof.color}
            onChange={e => updateRoof(roof.id, { color: e.target.value })}
            className="w-8 h-6 rounded cursor-pointer bg-transparent border border-slate-700"
          />
        </div>
        <Field
          label="Opacity" value={Math.round(roof.opacity * 100)} type="number" unit="%"
          onChange={v => updateRoof(roof.id, { opacity: Number(v) / 100 })}
        />
      </Section>
    </>
  );
}

function ObstaclePanel({ obs }: { obs: Obstacle }) {
  const { updateObstacle } = useDesignStore();
  return (
    <>
      <Section title="Dimensions">
        <Field label="Width" value={obs.width.toFixed(0)} type="number" unit="px"
          onChange={v => updateObstacle(obs.id, { width: Number(v) })} />
        <Field label="Height" value={obs.height.toFixed(0)} type="number" unit="px"
          onChange={v => updateObstacle(obs.id, { height: Number(v) })} />
        <Field label="Rotation" value={obs.rotation.toFixed(0)} type="number" unit="°"
          onChange={v => updateObstacle(obs.id, { rotation: Number(v) })} />
      </Section>
      <Section title="Position">
        <Field label="X" value={obs.x.toFixed(0)} type="number"
          onChange={v => updateObstacle(obs.id, { x: Number(v) })} />
        <Field label="Y" value={obs.y.toFixed(0)} type="number"
          onChange={v => updateObstacle(obs.id, { y: Number(v) })} />
      </Section>
      <Section title="Label">
        <Field label="Label" value={obs.label}
          onChange={v => updateObstacle(obs.id, { label: v })} />
      </Section>
    </>
  );
}

function PanelPanel({ panel }: { panel: SolarPanel }) {
  const { updatePanel } = useDesignStore();
  return (
    <>
      <Section title="Equipment">
        <Field label="Manufacturer" value={panel.manufacturer} />
        <Field label="Model" value={panel.model} />
        <Field label="Power" value={panel.power} unit="Wp" />
      </Section>
      <Section title="Placement">
        <Field
          label="Orientation" value={panel.orientation}
          onChange={v => updatePanel(panel.id, { orientation: v as any })}
        />
        <Field
          label="Tilt" value={panel.tilt} type="number" unit="°"
          onChange={v => updatePanel(panel.id, { tilt: Number(v) })}
        />
        <Field
          label="Rotation" value={panel.rotation.toFixed(0)} type="number" unit="°"
          onChange={v => updatePanel(panel.id, { rotation: Number(v) })}
        />
      </Section>
      <Section title="Electrical">
        <Field
          label="String #" value={panel.stringNumber} type="number"
          onChange={v => updatePanel(panel.id, { stringNumber: Number(v) })}
        />
      </Section>
    </>
  );
}

function EmptyState({ panelCount, roofCount }: { panelCount: number; roofCount: number }) {
  const dcKwp = (panelCount * 580) / 1000;
  const generation = dcKwp * 1332;

  return (
    <div className="space-y-4">
      <Section title="Project Overview">
        <Field label="Roofs" value={roofCount} />
        <Field label="Panels" value={panelCount} />
        <Field label="DC Capacity" value={formatCapacity(dcKwp)} />
        <Field label="Annual Gen." value={`${(generation / 1000).toFixed(1)} MWh`} />
      </Section>
      <div className="mx-1 rounded-lg bg-slate-800/60 border border-slate-700/50 p-3 text-center">
        <div className="text-2xl mb-1">⊹</div>
        <p className="text-slate-400 text-xs leading-relaxed">
          Select a roof, obstacle, or panel to view and edit its properties.
        </p>
      </div>
      <Section title="Shortcuts">
        {[
          ['V', 'Select tool'],
          ['P', 'Draw polygon roof'],
          ['O', 'Place obstacle'],
          ['S', 'Place panel'],
          ['Del', 'Delete selected'],
          ['Ctrl+Z', 'Undo'],
          ['Ctrl+Y', 'Redo'],
          ['Esc', 'Cancel / deselect'],
        ].map(([k, v]) => (
          <div key={k} className="flex items-center justify-between py-0.5 px-1">
            <span className="text-slate-500 text-xs">{v}</span>
            <kbd className="text-xs bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5 font-mono text-slate-300">{k}</kbd>
          </div>
        ))}
      </Section>
    </div>
  );
}

export function RightPropertyPanel() {
  const { selectedIds, roofs, obstacles, panels } = useDesignStore();

  const firstId = selectedIds[0];
  const selectedRoof = firstId ? roofs.find(r => r.id === firstId) : null;
  const selectedObs = firstId ? obstacles.find(o => o.id === firstId) : null;
  const selectedPanel = firstId ? panels.find(p => p.id === firstId) : null;

  const title = selectedRoof ? 'Roof' : selectedObs ? 'Obstacle' : selectedPanel ? 'Solar Panel' : 'Properties';

  return (
    <aside className="right-sidebar">
      <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
        <span className="text-xs font-semibold tracking-widest uppercase text-slate-300">{title}</span>
        {selectedIds.length > 1 && (
          <span className="text-xs text-slate-500">{selectedIds.length} selected</span>
        )}
      </div>

      <div className="overflow-y-auto flex-1 p-2">
        {selectedRoof && <RoofPanel roof={selectedRoof} />}
        {selectedObs && <ObstaclePanel obs={selectedObs} />}
        {selectedPanel && <PanelPanel panel={selectedPanel} />}
        {!selectedRoof && !selectedObs && !selectedPanel && (
          <EmptyState panelCount={panels.length} roofCount={roofs.length} />
        )}
      </div>
    </aside>
  );
}
