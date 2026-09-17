import test from 'node:test';
import assert from 'node:assert/strict';
import {roofMapTransform} from '../../utils/roofMapTransform';
import type {RoofPolygon} from '../../types';

const roof={points:[{x:20,y:10},{x:50,y:30},{x:10,y:90},{x:-20,y:70}],traceMpp:.3,centroidLatLng:{lat:19.24,lng:73.13}} as RoofPolygon;
test('map zoom changes overlay pixels, not geographic roof dimensions',()=>{
  const a=roofMapTransform(roof,roof.centroidLatLng!,19,800,600)!;
  const b=roofMapTransform(roof,roof.centroidLatLng!,20,800,600)!;
  assert.equal(b.scale,a.scale*2);
  assert.equal(15*a.scale+a.offset.x,400);
  assert.equal(50*a.scale+a.offset.y,300);
  const physicalLength=Math.hypot(30,20)*roof.traceMpp!;
  assert.ok(Math.abs(Math.hypot(30*b.scale,20*b.scale)*roof.traceMpp!/b.scale-physicalLength)<1e-10);
});
test('resize and map pan reposition the overlay without changing size or angle',()=>{
  const a=roofMapTransform(roof,roof.centroidLatLng!,20,800,600)!;
  const b=roofMapTransform(roof,roof.centroidLatLng!,20,1000,700)!;
  assert.equal(b.offset.x-a.offset.x,100);assert.equal(b.offset.y-a.offset.y,50);
  const c=roofMapTransform(roof,{lat:19.24,lng:73.131},20,800,600)!;
  assert.equal(c.scale,a.scale);assert.ok(c.offset.x<a.offset.x);
});
