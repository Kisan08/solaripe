import * as THREE from 'three';

export function obstacleModel(label: string, w: number, d: number, h: number, selected: boolean) {
  const group=new THREE.Group();
  const material=(color:string,metalness=0,roughness=.8)=>new THREE.MeshStandardMaterial({color:selected?'#58a879':color,metalness,roughness});
  const concrete=material('#aaaead'), steel=material('#747d7c',.55,.45), dark=material('#303b3b'), plastic=material('#d2d6d2',0,.5);
  const add=(geometry:THREE.BufferGeometry,mat:THREE.Material,x:number,y:number,z:number)=>{
    const mesh=new THREE.Mesh(geometry,mat);mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;
    mesh.userData.visualDetail=true;group.add(mesh);return mesh;
  };
  const box=(x:number,y:number,z:number,px:number,py:number,pz:number,mat=concrete)=>add(new THREE.BoxGeometry(x,y,z),mat,px,py,pz);
  const beam=(a:THREE.Vector3,b:THREE.Vector3,r=.018)=>{
    const delta=b.clone().sub(a);const mesh=add(new THREE.CylinderGeometry(r,r,delta.length(),8),steel,0,0,0);
    mesh.position.copy(a).add(b).multiplyScalar(.5);mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());
  };
  const type=label.toLowerCase();
  if(type.includes('water')) {
    const r=.5, dome=.12*h, bodyH=h-dome;
    const tank=new THREE.Group();group.add(tank);
    const cylinder=add(new THREE.CylinderGeometry(r*.96,r*.98,bodyH,48),plastic,0,bodyH/2,0);
    cylinder.scale.set(w,1,d);
    for(const fraction of [.12,.3,.5,.7,.9]) {
      const rib=add(new THREE.TorusGeometry(.48,.012,6,48),plastic,0,bodyH*fraction,0);
      rib.rotation.x=Math.PI/2;rib.scale.set(w,d,Math.min(w,d));
    }
    const cap=add(new THREE.SphereGeometry(.48,40,16,0,Math.PI*2,0,Math.PI/2),plastic,0,bodyH,0);
    cap.scale.set(w,dome/.48,d);
    const lid=add(new THREE.CylinderGeometry(.12,.12,.035*h,32),steel,0,h-.0175*h,0);lid.scale.set(w,1,d);
  } else if(type.includes('stair')) {
    const stairW=w*.32, roomW=w-stairW, roomX=stairW/2;
    box(roomW,h*.87,d,roomX,h*.435,0);
    box(roomW,h*.06,d,roomX,h*.9,0,material('#858e8b'));
    const doorW=roomW*.42, doorH=h*.65;
    box(doorW,doorH,.015,roomX,doorH/2,d/2-.008,dark);
    box(.025,doorH*.9,.02,roomX-doorW*.43,doorH/2,d/2-.006,steel);
    const x=-w/2+stairW/2, run=d*.88, stepCount=Math.max(6,Math.min(18,Math.round(h/.19)));
    for(let i=0;i<stepCount;i++) {
      const sh=h*.78*(i+1)/stepCount;
      box(stairW*.85,sh,run/stepCount,x,sh/2,d/2-(i+.5)*run/stepCount,concrete);
    }
    for(const side of [-1,1]) {
      const px=x+side*stairW*.43;
      const a=new THREE.Vector3(px,h*.16,d*.44),b=new THREE.Vector3(px,h*.94,-d*.38);
      beam(a,b,Math.min(.025,w*.008));
      for(let i=0;i<=4;i++) {const top=a.clone().lerp(b,i/4);beam(new THREE.Vector3(top.x,Math.max(0,top.y-h*.14),top.z),top,.012);}
    }
  } else if(type.includes('sky')) {
    box(w,h*.6,d,0,h*.3,0,steel);
    box(w*.92,h*.4,d*.92,0,h*.8,0,material('#6e959e',.25,.22));
    box(w*.025,h*.02,d*.92,0,h*.99,0,steel);
  } else if(type.includes('ac') || type.includes('hvac')) {
    box(w*.94,h*.82,d*.94,0,h*.53,0,plastic);
    for(const x of [-w*.3,w*.3]) box(w*.12,h*.12,d*.8,x,h*.06,0,steel);
    const radius=Math.min(w*.32,h*.32);
    const fan=add(new THREE.CylinderGeometry(radius,radius,.015,40),dark,-w*.12,h*.55,d*.475);
    fan.rotation.x=Math.PI/2;
    for(let i=1;i<5;i++) {const ring=add(new THREE.TorusGeometry(radius*i/5,.006,4,32),steel,-w*.12,h*.55,d*.485);ring.userData.visualDetail=true;}
    for(let i=0;i<7;i++) box(w*.2,h*.018,.01,w*.32,h*(.28+i*.075),d*.48,steel);
  } else {
    box(w*.65,h*.78,d*.65,0,h*.39,0,steel);
    box(w,h*.12,d,0,h*.9,0,steel);
    for(let i=0;i<4;i++) box(w*.68,h*.035,d*.68,0,h*(.55+i*.07),0,dark);
  }
  // Conservative entered obstruction envelope; decorative geometry is not survey data.
  const proxy=type.includes('water')
    ? new THREE.Mesh(new THREE.CylinderGeometry(.5,.5,h,48),new THREE.MeshBasicMaterial())
    : new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshBasicMaterial());
  if(type.includes('water')) proxy.scale.set(w,1,d);
  proxy.position.y=h/2;proxy.visible=false;proxy.name='obstruction-envelope';group.add(proxy);
  if(selected) {const outline=new THREE.BoxHelper(proxy,'#31a56b');group.add(outline);}
  return group;
}
