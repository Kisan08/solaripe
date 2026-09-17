import { build } from 'esbuild';
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

// Mount the production component with isolated persistence; no account or live project is modified.
const outputDir = 'artifacts/design-accuracy-validation';
await mkdir(outputDir, { recursive: true });
const fixture = {
  roofs: [{ id: 'roof-fixture', type: 'roof', points: [{x:0,y:0},{x:240,y:0},{x:240,y:110},{x:190,y:110},{x:190,y:200},{x:0,y:200}], slope: 0, azimuth: 180, area: 435, color: '#3b82f6', opacity: 0.3, traceMpp: 0.1,
    design3D: { parapetHeightM: 0.9, mountingHeightM: 1.8, terraces: [{id:'t1',name:'Upper terrace',x:-6,z:-5,width:8,depth:6,heightM:2.8}] } }],
  obstacles: [{id:'stairs',type:'obstacle',x:190,y:40,width:35,height:30,rotation:0,label:'Staircase',heightM:2.7},{id:'tank',type:'obstacle',x:40,y:170,width:20,height:20,rotation:0,label:'Water Tank',heightM:1.7}],
  panels: [...[-8,-6.8,-5.6,2,3.2,4.4,5.6].map(x=>[x,3.2]), ...[-8,-6.8,-5.6].map(x=>[x,-5])].map(([x,z],i)=>({id:`p${i}`,type:'panel',x:120+x*10,y:100+z*10,width:11.34,height:22.78,rotation:180,tilt:15,orientation:'portrait',manufacturer:'Waaree',model:'580',power:580,stringNumber:1,roofId:'roof-fixture'})),
  wallHeightM: 7, projectId: 'fixture', saveStatus: 'saved',
};
const source = `import React from 'react';
import * as THREE from 'three';
window.testThree=THREE;
import {createRoot} from 'react-dom/client';
import {SolarDesign3D} from './components/design/SolarDesign3D';
import {useDesignStore} from './store/designStore';
import {DesignCanvas} from './components/design/DesignCanvas';
import {QuoteDesignSection} from './components/quote/QuoteDesignSection';
import Konva from 'konva';
window.testKonva=Konva;
const fixture=${JSON.stringify(fixture)};
const saved=JSON.parse(localStorage.getItem('studio-saved')||'null');
useDesignStore.setState({...fixture,project:{...useDesignStore.getState().project,clientName:'Mehta Residence',address:'Thane, Maharashtra'}});
if(saved) useDesignStore.getState().loadDesignData('fixture',saved);
if(location.search.includes('accuracy')) useDesignStore.setState({
  roofs:fixture.roofs.map(r=>({...r,slope:0,design3D:{mountingHeightM:1.8,parapetHeightM:1,measurementsConfirmed:true}})),
  obstacles:fixture.obstacles,
  equipment:{...useDesignStore.getState().equipment,specificationsConfirmed:true},
});
window.studioStore=useDesignStore;
if(location.search.includes('rotated-roof')) useDesignStore.setState({roofs:fixture.roofs.map(r=>({...r,points:[{x:80,y:0},{x:220,y:80},{x:160,y:190},{x:20,y:110}]}))});
if(location.search.includes('legacy-units')) useDesignStore.setState({
  equipment:{...useDesignStore.getState().equipment,dimensionUnit:undefined,panelWidth:1.134,panelHeight:2.278},
  panels:fixture.panels.map(p=>({...p,width:p.width/1000,height:p.height/1000,moduleWidthM:.001134,moduleHeightM:.002278})),
});
const map=document.createElement('canvas'); map.width=map.height=1280;
const ctx=map.getContext('2d');ctx.fillStyle='#567e52';ctx.fillRect(0,0,1280,1280);
ctx.fillStyle='#a6a7a5';ctx.fillRect(540,0,130,1280);ctx.fillRect(0,520,1280,100);
ctx.fillStyle='#e4dccb';for(let y=70;y<1280;y+=210)for(let x=70;x<1280;x+=210)ctx.fillRect(x,y,105,130);
window.fetch=async(url)=>{window.mapRequest=String(url);return new Response(JSON.stringify(location.search.includes('map')?{dataUrl:map.toDataURL(),fallback:false}:{dataUrl:null,fallback:true}),{status:200});};
const is2d=location.search.includes('2d');
if(is2d) useDesignStore.setState({roofs:fixture.roofs.map(r=>({...r,points:r.points.map(p=>({x:p.x+100,y:p.y+100}))})),scale:1,offset:{x:0,y:0}});

createRoot(document.getElementById('root')).render(location.search.includes('quote-section') ? <div style={{padding:24}}><QuoteDesignSection url="https://solar.example/design?projectId=5acd2406-d539-4f13-92f1-5665a0e5f1bd&client=1&shareToken=fixture.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"/></div> : is2d ? <DesignCanvas width={innerWidth} height={innerHeight}/> : <SolarDesign3D roofPoints={useDesignStore.getState().roofs[0].points} lat={19.24} roofCenterLatLng={{lat:19.24,lng:73.13}} onClose={()=>{}} readOnly={location.search.includes('readonly')}/>);`;
const bundle = await build({ stdin: { contents: source, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, write: false, outdir: 'out', platform:'browser', format:'iife', define:{'process.env.NODE_ENV':'"development"'}, plugins:[{
  name:'isolated-design-services', setup(b) {
    b.onLoad({filter:/SolarDesign3D[.]tsx$/},async({path})=>({contents:(await readFile(path,'utf8')).replace('sceneRef.current = scene;','sceneRef.current = scene; (window as any).testScene = scene;').replace('cameraRef.current = camera;','cameraRef.current = camera; (window as any).testCamera = camera;'),loader:'tsx'}));

    b.onResolve({filter:/^next\/navigation$/},()=>({path:'router',namespace:'stub'}));
    b.onResolve({filter:/lib\/designs$/},()=>({path:'designs',namespace:'stub'}));
    b.onLoad({filter:/.*/,namespace:'stub'},({path})=>({contents:path==='router' ? 'export const useRouter=()=>({push(){}});' : `export async function saveDesign(p){ localStorage.setItem('studio-saved',JSON.stringify({roofs:p.roofs,obstacles:p.obstacles,panels:p.panels,walkways:p.walkways,project_info:p.projectInfo,equipment:p.equipment,map_config:p.mapConfig,wall_height_m:p.wallHeightM}));return {error:null}; } export async function loadDesign(){return {design:JSON.parse(localStorage.getItem('studio-saved')),error:null};}`,loader:'js'}));
  }
}]});
const appSource = await readFile('app/design/DesignPageContent.tsx','utf8');
const tokens = appSource.match(/\.solaripe-design-workspace\[data-theme='light'\] \{([\s\S]*?)\}/)[1];
const html = `<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/out.css"><style>:root{${tokens}}body{margin:0;font-family:Arial,sans-serif}button,input{font:inherit}</style></head><body><div id="root"></div><script src="/out.js"></script></body></html>`;
const server = createServer((req,res)=>{
  const file = bundle.outputFiles.find(f=>f.path.endsWith(req.url?.endsWith('.css')?'.css':'.js'));
  if(req.url?.endsWith('.css') || req.url?.endsWith('.js')) {res.setHeader('Content-Type',req.url.endsWith('.css')?'text/css':'text/javascript');res.end(file.contents);}
  else {res.setHeader('Content-Type','text/html');res.end(html);}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser = await chromium.launch({channel:'msedge',headless:true});
const page = await browser.newPage({viewport:{width:1440,height:960}});
const errors=[];
page.on('pageerror', e=>errors.push(e.message));
page.on('dialog',d=>d.accept());
const url=`http://127.0.0.1:${server.address().port}`;
const pixels = async()=>page.locator('canvas').evaluate(canvas=>{
  const c=document.createElement('canvas');c.width=canvas.width;c.height=canvas.height;const ctx=c.getContext('2d');ctx.drawImage(canvas,0,0);
  const p=ctx.getImageData(0,0,c.width,c.height).data;let dark=0,light=0,signature=0;
  for(let i=0;i<p.length;i+=64){if(p[i]<100&&p[i+1]<120)dark++;if(p[i]>150)light++;signature=(signature+p[i]*i+p[i+1])%1000000007;}
  return {dark,light,signature,width:c.width,height:c.height};
});

try {
  await page.goto(url); await page.waitForSelector('canvas'); await page.waitForTimeout(1200);
  const originalRoof=await page.evaluate(()=>JSON.stringify(window.studioStore.getState().roofs));
  const originalPanels=await page.evaluate(()=>JSON.stringify(window.studioStore.getState().panels));
  let p=await pixels(); assert.ok(p.dark>50 && p.light>500,JSON.stringify(p));
  await page.screenshot({path:outputDir+'/desktop-panels.png'});
  const before=p.signature;
  await page.getByRole('button',{name:'Zoom in',exact:true}).click(); await page.waitForTimeout(400);
  assert.notEqual((await pixels()).signature,before);
  await page.getByRole('button',{name:'Top view',exact:true}).click(); await page.waitForTimeout(400);
  await page.screenshot({path:outputDir+'/top-view.png'});
  await page.getByRole('button',{name:'Perspective view',exact:true}).click();
  for(const section of ['Obstacles','Building','Electrical','Analysis','Panels']) {
    await page.getByRole('button',{name:section,exact:true}).click();
    assert.ok(await page.getByRole('complementary',{name:'Design properties'}).isVisible());
  }
  assert.equal(await page.evaluate(()=>JSON.stringify(window.studioStore.getState().roofs)),originalRoof);
  assert.equal(await page.evaluate(()=>JSON.stringify(window.studioStore.getState().panels)),originalPanels);
  await page.getByRole('button',{name:'Obstacles',exact:true}).click();
  await page.getByRole('button',{name:'+ Water Tank',exact:true}).click();
  assert.equal(await page.evaluate(()=>window.studioStore.getState().obstacles.length),3);
  await page.screenshot({path:outputDir+'/desktop-obstacles.png'});
  await page.getByRole('button',{name:'Save design',exact:true}).click();
  assert.ok(await page.evaluate(()=>JSON.parse(localStorage.getItem('studio-saved')).obstacles.length===3));
  const beforeSun=(await pixels()).signature;
  await page.getByLabel('Sun time',{exact:true}).fill('16'); await page.waitForTimeout(400);
  assert.notEqual((await pixels()).signature,beforeSun);
  await page.getByRole('button',{name:'Close properties',exact:true}).click();
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:'Fit roof',exact:true}).click(); await page.waitForTimeout(500);
  p=await pixels(); assert.ok(p.dark>30 && p.light>100,JSON.stringify(p));
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:outputDir+'/mobile-canvas.png'});
  await page.getByRole('button',{name:'Obstacles',exact:true}).click();
  await page.screenshot({path:outputDir+'/mobile-properties.png'});
  await page.getByRole('button',{name:'Close properties',exact:true}).click();
  assert.equal(await page.getByRole('complementary',{name:'Design properties'}).isVisible(),false);
  await page.goto(url+'/?readonly'); await page.waitForSelector('canvas'); await page.waitForTimeout(400);
  assert.equal(await page.getByRole('button',{name:'Save design',exact:true}).count(),0);
  assert.equal(await page.getByRole('navigation',{name:'3D design tools'}).count(),0);
  const appPage=await browser.newPage({viewport:{width:1440,height:960}});
  appPage.on('pageerror',e=>errors.push(e.message));
  const savedDesign=await page.evaluate(()=>JSON.parse(localStorage.getItem('studio-saved')));
  await appPage.route('**/_vercel/insights/**',route=>route.fulfill({contentType:'application/javascript',body:''}));
  await appPage.route('**/api/public-design?*',route=>route.fulfill({json:{design:savedDesign,project:{client_name:'Mehta Residence',address:'Thane, Maharashtra'}}}));
  await appPage.route('**/api/satellite-image?*',route=>route.fulfill({json:{imageUrl:null}}));
  await appPage.goto('http://localhost:3000/design?client=1&projectId=studio-ui-validation',{timeout:90000,waitUntil:'domcontentloaded'});
  await appPage.waitForSelector('.design-studio canvas',{timeout:90000});
  await appPage.waitForTimeout(500);
  await appPage.screenshot({path:outputDir+'/app-client.png'});
  assert.equal(await appPage.locator('.app-sidebar-rail').count(),0);
  await appPage.setViewportSize({width:390,height:844});
  await appPage.getByRole('button',{name:'Close properties',exact:true}).click();
  await appPage.getByRole('button',{name:'Fit roof',exact:true}).click();
  await appPage.waitForTimeout(400);
  assert.ok(await appPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await appPage.screenshot({path:outputDir+'/app-mobile-client.png'});

  await page.setViewportSize({width:1440,height:960});
  await page.goto(url+'/?map'); await page.waitForSelector('canvas'); await page.waitForFunction(()=>window.testScene?.getObjectByName('satellite-context'));
  const context=await page.evaluate(()=>{
    const mesh=window.testScene.getObjectByName('satellite-context');
    return {zoom:Number(new URL(window.mapRequest,location.origin).searchParams.get('zoom')),span:mesh.geometry.parameters.width,toneMapped:mesh.material.toneMapped};
  });
  assert.ok(context.zoom<=18 && context.span>=360,JSON.stringify(context));assert.equal(context.toneMapped,false);
  await page.getByRole('button',{name:'Building',exact:true}).click();
  await page.getByLabel('Mounting height',{exact:true}).fill('2.6');
  await page.waitForTimeout(350);
  assert.equal(await page.evaluate(()=>window.studioStore.getState().roofs[0].design3D.mountingHeightM),2.6);
  const assembly=await page.evaluate(()=>{
    const scene=window.testScene;const group=scene.getObjectByName('panels');
    const panel=group.children.find(o=>o.userData.panelId);
    return {roof:scene.getObjectByName('roof').type,clearance:panel.children[0].position.y,tilt:panel.children[0].rotation.x};
  });
  assert.equal(assembly.roof,'Mesh');assert.ok(assembly.clearance>2.6 && assembly.tilt>0);
  await page.getByRole('button',{name:'Save design',exact:true}).click();
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('studio-saved')).roofs[0].design3D.mountingHeightM),2.6);
  await page.getByRole('button',{name:'Top view',exact:true}).click();await page.waitForTimeout(400);
  await page.screenshot({path:outputDir+'/map-top.png'});
  await page.getByRole('button',{name:'Satellite context',exact:true}).click();
  assert.equal(await page.evaluate(()=>window.testScene.getObjectByName('satellite').visible),false);
  await page.getByRole('button',{name:'Perspective view',exact:true}).click();await page.waitForTimeout(400);
  await page.screenshot({path:outputDir+'/raised-mount.png'});
  await page.goto(url+'/?2d');await page.waitForSelector('canvas');await page.waitForTimeout(300);
  for(const scale of [.5,1,2]){
    await page.evaluate(scale=>window.studioStore.setState({scale}),scale);await page.waitForTimeout(200);
    const sizes=await page.evaluate(()=>window.testKonva.stages[0].find('Circle').map(c=>({radius:c.radius()*c.getAbsoluteScale().x,fill:c.fill()})));
    assert.ok(sizes.length>=6);
    assert.ok(sizes.every(s=>s.radius>=8&&s.radius<=9&&s.fill==='#FACC15'),JSON.stringify(sizes));
  }
  await page.evaluate(()=>window.studioStore.setState({scale:1}));await page.waitForTimeout(200);
  await page.screenshot({path:outputDir+'/yellow-trace-handles.png'});


  await page.goto(url+'/?accuracy');await page.waitForSelector('canvas');await page.waitForTimeout(300);
  const beforePan=await page.evaluate(()=>({position:window.testCamera.position.toArray(),panels:JSON.stringify(window.studioStore.getState().panels)}));
  await page.getByRole('button',{name:'Pan camera',exact:true}).click();
  const canvas=await page.locator('.design-studio-canvas').boundingBox();
  await page.mouse.move(canvas.x+canvas.width*.5,canvas.y+canvas.height*.5);
  await page.mouse.down();await page.mouse.move(canvas.x+canvas.width*.5+100,canvas.y+canvas.height*.5+60,{steps:12});await page.mouse.up();await page.waitForTimeout(400);
  assert.notDeepEqual(await page.evaluate(()=>window.testCamera.position.toArray()),beforePan.position);
  assert.equal(await page.evaluate(()=>JSON.stringify(window.studioStore.getState().panels)),beforePan.panels);
  await page.getByRole('button',{name:'Panels',exact:true}).click();await page.getByText('Module specification',{exact:true}).click();
  const oldWidth=await page.evaluate(()=>window.testScene.getObjectByName('panels').children.find(g=>g.userData.panelId).children[0].children[0].geometry.parameters.width);
  await page.getByLabel('Module width (mm)',{exact:true}).fill('1500');await page.getByLabel('Module width (mm)',{exact:true}).press('Tab');
  await page.waitForTimeout(200);
  assert.equal(await page.evaluate(()=>window.testScene.getObjectByName('panels').children.find(g=>g.userData.panelId).children[0].children[0].geometry.parameters.width),oldWidth);
  await page.getByLabel('Specifications checked against manufacturer data').check();
  await page.getByRole('button',{name:'Building',exact:true}).click();
  await page.getByLabel('Roof finish',{exact:true}).selectOption('coating');
  assert.ok(await page.evaluate(()=>window.testScene.getObjectByName('panels').children.length>0));
  await page.getByLabel('Site dimensions and heights checked').check();
  await page.getByLabel('Sun time',{exact:true}).fill('12');
  await page.getByRole('button',{name:'Analysis',exact:true}).click();
  await page.getByLabel('Analysis period',{exact:true}).selectOption('instant');
  await page.getByRole('button',{name:'Run Shading Analysis',exact:true}).click();
  await page.waitForFunction(()=>!document.body.textContent.includes('Checking '),{},{timeout:60000});
  assert.ok(await page.getByText(/No meaningful shading|panels affected/).count()>0);
  await page.screenshot({path:outputDir+'/analysis.png'});
  await page.getByLabel('Sun time',{exact:true}).fill('0');
  await page.waitForTimeout(200);
  assert.equal(await page.getByText(/No meaningful shading|panels affected/).count(),0);
  assert.equal(await page.evaluate(()=>{let intensity=-1;window.testScene.traverse(o=>{if(o.isDirectionalLight && o.shadow.mapSize.width===2048) intensity=o.intensity;});return intensity;}),0);
  await page.screenshot({path:outputDir+'/night.png'});
  await page.goto(url+'?legacy-units');await page.waitForSelector('canvas');await page.waitForTimeout(800);
  const moduleSizes=await page.evaluate(()=>window.testScene.getObjectByName('panels').children.filter(g=>g.userData.panelId).map(g=>g.children[0].children[0].geometry.parameters));
  assert.equal(moduleSizes.length,fixture.panels.length);
  for(const size of moduleSizes){assert.equal(size.width,1.134);assert.equal(size.depth,2.278);assert.equal(size.height,.035);}
  const legacyPixels=await pixels();assert.ok(legacyPixels.dark>100 && legacyPixels.light>100);
  await page.screenshot({path:outputDir+'/legacy-units-fixed.png'});
  await page.goto(url+'?rotated-roof');await page.waitForSelector('canvas');await page.waitForTimeout(600);
  await page.getByRole('button',{name:'Top view',exact:true}).click();await page.waitForTimeout(600);
  const alignment=await page.evaluate(()=>{
    const camera=window.testCamera, THREE=window.testThree;
    camera.updateMatrixWorld(true);
    const ground=new THREE.Vector3(4,0,5).project(camera);
    const roof=new THREE.Vector3(4,7,5).project(camera);
    const positions=window.testScene.getObjectByName('roof').geometry.attributes.position;
    const points=window.studioStore.getState().roofs[0].points;
    const cx=(Math.min(...points.map(p=>p.x))+Math.max(...points.map(p=>p.x)))/2;
    const cy=(Math.min(...points.map(p=>p.y))+Math.max(...points.map(p=>p.y)))/2;
    const matched=points.every(p=>Array.from({length:positions.count},(_,i)=>i).some(i=>Math.abs(positions.getX(i)-(p.x-cx)*.1)<1e-5&&Math.abs(positions.getZ(i)-(p.y-cy)*.1)<1e-5));
    return {orthographic:camera.isOrthographicCamera,dx:Math.abs(ground.x-roof.x),dy:Math.abs(ground.y-roof.y),matched};
  });
  assert.equal(alignment.orthographic,true);assert.ok(alignment.dx<1e-7&&alignment.dy<1e-7);assert.equal(alignment.matched,true);
  await page.screenshot({path:outputDir+'/rotated-roof-top.png'});
  await page.goto(url+'?accuracy');await page.waitForSelector('canvas');await page.waitForTimeout(600);
  await page.getByRole('button',{name:'Top view',exact:true}).click();await page.waitForTimeout(400);
  await page.getByRole('button',{name:'Move selection',exact:true}).click();
  const dragOrigin=await page.evaluate(()=>{
    const state=window.studioStore.getState(), o=state.obstacles.find(o=>o.id==='tank');
    const root=window.testScene.getObjectByName('obstruction-envelope').parent;
    const tank=window.testScene.children.flatMap(c=>c.children).find(c=>c.userData.obstacleId==='tank');
    const position=tank.position.clone();position.y+=.5;
    position.project(window.testCamera);const rect=document.querySelector('canvas').getBoundingClientRect();
    return {x:rect.left+(position.x*.5+.5)*rect.width,y:rect.top+(-position.y*.5+.5)*rect.height,savedX:o.x};
  });
  await page.mouse.move(dragOrigin.x,dragOrigin.y);await page.mouse.down();
  const positions=[];
  for(const delta of [18,36,54]) {
    await page.mouse.move(dragOrigin.x+delta,dragOrigin.y,{steps:5});await page.waitForTimeout(80);
    positions.push(await page.evaluate(()=>window.testScene.children.flatMap(c=>c.children).find(c=>c.userData.obstacleId==='tank').position.x));
  }
  assert.ok(positions[0]<positions[1]&&positions[1]<positions[2],'one held pointer must move an obstacle continuously');
  assert.equal(await page.evaluate(()=>window.studioStore.getState().obstacles.find(o=>o.id==='tank').x),dragOrigin.savedX);
  await page.mouse.up();await page.waitForTimeout(150);
  assert.notEqual(await page.evaluate(()=>window.studioStore.getState().obstacles.find(o=>o.id==='tank').x),dragOrigin.savedX);
  await page.goto(url+'?quote-section');
  const designLink=page.getByRole('link',{name:'View 3D Design',exact:true});
  assert.ok((await designLink.getAttribute('href')).includes('client=1'));
  assert.equal(await designLink.getAttribute('target'),'_blank');
  await page.screenshot({path:outputDir+'/quote-design-section.png'});
  await page.setViewportSize({width:390,height:844});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:outputDir+'/quote-design-mobile.png'});
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:true,checks:['nonblank desktop/mobile canvas','camera zoom and presets','all tool sections','navigation preserves geometry','obstacle creation and save','sun control','mobile inspector','read-only controls'],screenshots:outputDir},null,2));
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
