import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { getPosition } from 'suncalc';
import { solarPositionAtIST } from '../../components/design/solarPosition';
import { moduleFits, moduleFootprint, reanchorRoof } from '../../components/design/designAccuracy';
import { rectangle } from '../../components/design/roofGeometry';
import { sampleShading } from '../../components/design/sampleShading';

test('editing roof bounds keeps the geographic anchor aligned', () => {
  const points = [{x:0,y:0},{x:10,y:10}];
  const anchor = {lat:19,lng:73};
  const shifted = reanchorRoof(points, points.map(p=>({x:p.x+20,y:p.y+10})), anchor, .5)!;
  assert.ok(Math.abs((shifted.lng-anchor.lng)*111320*Math.cos(19*Math.PI/180)-10)<1e-7);
  assert.ok(Math.abs((shifted.lat-anchor.lat)*111320+5)<1e-7);
  assert.equal(reanchorRoof(points,points,anchor,undefined),anchor);
});

test('full calendar date and IST roll over to the correct UTC instant', () => {
  const actual = solarPositionAtIST(19.07, 72.88, '2026-01-01', 1);
  const expected = getPosition(new Date('2025-12-31T19:30:00Z'), 19.07, 72.88);
  assert.equal(actual.azimuth, expected.azimuth);
  assert.equal(actual.elevation, expected.altitude);
  assert.throws(() => solarPositionAtIST(19, 73, '2026-02-30', 12));
  assert.throws(() => solarPositionAtIST(100, 73, '2026-01-01', 12));
  assert.notEqual(solarPositionAtIST(19, 73, '2026-01-01', 12).elevation, solarPositionAtIST(19, 73, '2026-06-01', 12).elevation);
});

test('whole module footprint obeys setbacks and detects contained obstacles', () => {
  const panel = {x:0,z:0,widthM:1.2,depthM:2.4,tilt:15,azimuth:210};
  const roof = rectangle(0,0,10,10);
  assert.equal(moduleFits(panel,roof,[],.5),true);
  assert.equal(moduleFits({...panel,x:4.5},roof,[],.5),false);
  assert.equal(moduleFits(panel,roof,[{x:0,z:0,w:.1,d:.1,rotDeg:35}],.5),false);
  assert.equal(moduleFits({...panel,widthM:NaN},roof,[],.5),false);
  assert.equal(moduleFootprint(panel).length,4);
});

test('shading detects a blocker less than 1.5m away and excludes the module itself', async () => {
  const module = new THREE.Mesh(new THREE.BoxGeometry(1.2,.04,2.4),new THREE.MeshBasicMaterial());
  const blocker = new THREE.Mesh(new THREE.BoxGeometry(2,.1,3),new THREE.MeshBasicMaterial());
  blocker.position.y = .25;
  module.updateMatrixWorld(true); blocker.updateMatrixWorld(true);
  const surfaces=[{id:'p',mesh:module,width:1.2,depth:2.4}];
  const up=[new THREE.Vector3(0,1,0)];
  const result=await sampleShading(surfaces,[{mesh:module,owner:'p'},{mesh:blocker}],up,new AbortController().signal,()=>{});
  assert.equal(result.results.p,1);
  const clear=await sampleShading(surfaces,[{mesh:module,owner:'p'}],up,new AbortController().signal,()=>{});
  assert.equal(clear.results.p,0);
  const back=await sampleShading(surfaces,[],[new THREE.Vector3(0,-1,0)],new AbortController().signal,()=>{});
  assert.deepEqual(back.unlit,['p']);
  const controller=new AbortController();controller.abort();
  await assert.rejects(sampleShading(surfaces,[],up,controller.signal,()=>{}),{name:'AbortError'});
});
