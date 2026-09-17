import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {obstacleModel} from '../../components/design/obstacleModels';

for(const label of ['Water Tank','Staircase','AC Unit','Skylight','Vent']) {
  test(`${label} keeps its entered obstruction envelope and separates visual details`,()=>{
    const group=obstacleModel(label,3,2,2.4,false);
    group.updateMatrixWorld(true);
    const proxy=group.getObjectByName('obstruction-envelope')!;
    const size=new THREE.Box3().setFromObject(proxy).getSize(new THREE.Vector3());
    assert.ok(Math.abs(size.x-3)<1e-6&&Math.abs(size.y-2.4)<1e-6&&Math.abs(size.z-2)<1e-6);
    assert.equal(proxy.visible,false);
    let visual=0,analytical=0;
    group.traverse(o=>{if(o instanceof THREE.Mesh){if(o.userData.visualDetail)visual++;else analytical++;}});
    assert.ok(visual>=3);assert.equal(analytical,1);
  });
}
