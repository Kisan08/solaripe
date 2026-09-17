import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { rectangle, containsFootprint, footprintsOverlap, fitsRoofSurface, terraceAt } from '../../components/design/roofGeometry';
import { solarPositionIST } from '../../components/design/solarPosition';

const roof = rectangle(0, 0, 24, 20);
const terrace = { id: 't1', name: 'Upper terrace', x: -5, z: -4, width: 8, depth: 6, heightM: 2.8 };

test('panels fit one terrace and cannot bridge a height boundary', () => {
  assert.equal(fitsRoofSurface(rectangle(-5, -4, 1.134, 2.2), roof, [terrace]), true);
  assert.equal(terraceAt({ x: -5, z: -4 }, [terrace])?.heightM, 2.8);
  assert.equal(fitsRoofSurface(rectangle(-1.1, -4, 1.134, 2.2), roof, [terrace]), false);
  assert.equal(fitsRoofSurface(rectangle(11.8, 0, 1.134, 2.2), roof, []), false);
});

test('concave roof notches and small obstacles are not missed by corner-only tests', () => {
  const notched = [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 10 }, { x: 6, z: 10 }, { x: 6, z: 3 }, { x: 4, z: 3 }, { x: 4, z: 10 }, { x: 0, z: 10 }];
  assert.equal(containsFootprint(notched, rectangle(5, 5, 8, 2)), false);
  assert.equal(footprintsOverlap(rectangle(0, 0, 1.134, 2.2, 0.7), rectangle(0, 0, 0.2, 0.2)), true);
  assert.equal(footprintsOverlap(rectangle(0, 0, 1, 2), rectangle(4, 4, 1, 2)), false);
});

test('positive panel tilt and compass yaw point the normal toward the stated azimuth', () => {
  for (const azimuth of [0, 90, 180, 270]) {
    const normal = new THREE.Vector3(0, 1, 0).applyAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 12)
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), (180 - azimuth) * Math.PI / 180);
    const facing = (Math.atan2(normal.x, -normal.z) * 180 / Math.PI + 360) % 360;
    assert.ok(Math.abs(facing - azimuth) < 0.0001);
  }
});

test('IST sun position accounts for longitude and uses compass degrees', () => {
  const mumbai = solarPositionIST(19.07, 72.88, 1, 9, 2026);
  assert.ok(mumbai.azimuth > 90 && mumbai.azimuth < 180);
  assert.ok(mumbai.elevation > 10 && mumbai.elevation < 40);
  const kolkata = solarPositionIST(22.57, 88.36, 1, 9, 2026);
  assert.ok(kolkata.elevation > mumbai.elevation);
  assert.ok(solarPositionIST(19.07, 72.88, 1, 19, 2026).elevation < 0);
});
