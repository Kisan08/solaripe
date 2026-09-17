import type { Equipment } from '../types';

// Older saved designs used metres; current equipment forms use millimetres.
export function normalizeEquipmentDimensions(equipment: Equipment): Equipment {
  const legacyMetres = !equipment.dimensionUnit &&
    [equipment.panelWidth, equipment.panelHeight].every(v => Number.isFinite(v) && v >= 0.1 && v <= 10);
  return {
    ...equipment,
    panelWidth: equipment.panelWidth * (legacyMetres ? 1000 : 1),
    panelHeight: equipment.panelHeight * (legacyMetres ? 1000 : 1),
    dimensionUnit: 'mm',
    specificationsConfirmed: legacyMetres ? false : equipment.specificationsConfirmed,
  };
}

export function recoverUndersizedModule(widthM: number, depthM: number, expectedWidthM: number, expectedDepthM: number) {
  const matches = (a: number, b: number) => Math.abs(a * 1000 - b) < 0.000001;
  const unitBug = widthM > 0 && depthM > 0 && widthM < 0.01 && depthM < 0.01 &&
    matches(widthM, expectedWidthM) && matches(depthM, expectedDepthM);
  return {widthM: unitBug ? expectedWidthM : widthM, depthM: unitBug ? expectedDepthM : depthM};
}
