import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeEquipmentDimensions, recoverUndersizedModule} from '../../utils/moduleDimensions';
import type {Equipment} from '../../types';

const legacy: Equipment = {panelModel:'Waaree 580W Mono PERC',panelPower:580,panelWidth:1.134,panelHeight:2.278,inverter:'Growatt 5kW',mountingType:'Ballasted'};
test('legacy metre equipment converts once without changing power or model', () => {
  const normalized = normalizeEquipmentDimensions(legacy);
  assert.equal(normalized.panelWidth,1134);
  assert.equal(normalized.panelHeight,2278);
  assert.equal(normalized.panelPower,580);
  assert.equal(normalized.panelModel,legacy.panelModel);
  assert.equal(normalized.specificationsConfirmed,false);
  assert.deepEqual(normalizeEquipmentDimensions(normalized),normalized);
  assert.equal(legacy.panelWidth,1.134);
});
test('explicit millimetres are never silently reinterpreted', () => {
  assert.equal(normalizeEquipmentDimensions({...legacy,dimensionUnit:'mm'}).panelWidth,1.134);
  assert.equal(normalizeEquipmentDimensions({...legacy,panelWidth:1134,panelHeight:2278}).panelWidth,1134);
});
test('only exact thousandfold module corruption is recovered', () => {
  assert.deepEqual(recoverUndersizedModule(.001134,.002278,1.134,2.278),{widthM:1.134,depthM:2.278});
  assert.deepEqual(recoverUndersizedModule(1.2,2.4,1.134,2.278),{widthM:1.2,depthM:2.4});
  assert.deepEqual(recoverUndersizedModule(.001,.002,1.134,2.278),{widthM:.001,depthM:.002});
});
