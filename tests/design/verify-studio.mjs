import { build } from 'esbuild';
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

// Mount the production component with isolated persistence; no account or live project is modified.
const outputDir = 'artifacts/design-validation';
await mkdir(outputDir, { recursive: true });
const fixture = {
  roofs: [{ id: 'roof-fixture', type: 'roof', points: [{x:0,y:0},{x:240,y:0},{x:240,y:110},{x:190,y:110},{x:190,y:200},{x:0,y:200}], slope: 0, azimuth: 180, area: 435, color: '#ccc', opacity: 0.3, traceMpp: 0.1,
    design3D: { parapetHeightM: 0.9, mountingHeightM: 1.8, terraces: [{id:'t1',name:'Upper terrace',x:-6,z:-5,width:8,depth:6,heightM:2.8}] } }],
  obstacles: [{id:'stairs',type:'obstacle',x:190,y:40,width:35,height:30,rotation:0,label:'Staircase',heightM:2.7},{id:'tank',type:'obstacle',x:40,y:170,width:20,height:20,rotation:0,label:'Water Tank',heightM:1.7}],
  panels: [...[-8,-6.8,-5.6,2,3.2,4.4,5.6].map(x=>[x,3.2]), ...[-8,-6.8,-5.6].map(x=>[x,-5])].map(([x,z],i)=>({id:`p${i}`,type:'panel',x:120+x*10,y:100+z*10,width:11.34,height:22.78,rotation:180,tilt:15,orientation:'portrait',manufacturer:'Waaree',model:'580',power:580,stringNumber:1,roofId:'roof-fixture'})),
  wallHeightM: 7, projectId: 'fixture', saveStatus: 'saved',
};
const source = `import React from 'react';
import {createRoot} from 'react-dom/client';
import {SolarDesign3D} from './components/design/SolarDesign3D';
import {useDesignStore} from './store/designStore';
const fixture=${JSON.stringify(fixture)};
const saved=JSON.parse(localStorage.getItem('studio-saved')||'null');
useDesignStore.setState({...fixture,project:{...useDesignStore.getState().project,clientName:'Mehta Residence',address:'Thane, Maharashtra'}});
if(saved) useDesignStore.getState().loadDesignData('fixture',saved);
window.studioStore=useDesignStore;
window.fetch=async()=>new Response(JSON.stringify({imageUrl:null}),{status:200});
createRoot(document.getElementById('root')).render(<SolarDesign3D roofPoints={useDesignStore.getState().roofs[0].points} lat={19.24} roofCenterLatLng={{lat:19.24,lng:73.13}} onClose={()=>{}} readOnly={location.search.includes('readonly')}/>);`;
const bundle = await build({ stdin: { contents: source, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, write: false, outdir: 'out', platform:'browser', format:'iife', define:{'process.env.NODE_ENV':'"development"'}, plugins:[{
  name:'isolated-design-services', setup(b) {
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
const pixels = async()=>page.locator('canvas[aria-label]').evaluate(canvas=>{
  const c=document.createElement('canvas');c.width=canvas.width;c.height=canvas.height;const ctx=c.getContext('2d');ctx.drawImage(canvas,0,0);
  const p=ctx.getImageData(0,0,c.width,c.height).data;let dark=0,light=0,signature=0;
  for(let i=0;i<p.length;i+=64){if(p[i]<100&&p[i+1]<120)dark++;if(p[i]>150)light++;signature=(signature+p[i]*i+p[i+1])%1000000007;}
  return {dark,light,signature,width:c.width,height:c.height};
});
try {
  await page.goto(url); await page.waitForSelector('canvas[aria-label]'); await page.waitForTimeout(1200);
  let p=await pixels();assert.ok(p.dark>50 && p.light>500,JSON.stringify(p));
  await page.screenshot({path:`${outputDir}/desktop-editor.png`});
  await page.getByRole('button',{name:'Client presentation',exact:true}).click(); await page.waitForTimeout(350);
  await page.screenshot({path:`${outputDir}/desktop-proposal.png`});
  const before=(await pixels()).signature;
  await page.getByRole('button',{name:'Top view',exact:true}).click(); await page.waitForTimeout(300);
  assert.notEqual((await pixels()).signature,before);
  await page.screenshot({path:`${outputDir}/top-view.png`});
  await page.getByRole('button',{name:'Perspective view',exact:true}).click();
  const shadowBefore=(await pixels()).signature;
  await page.locator('#solar-hour').fill('16'); await page.waitForTimeout(300);
  assert.notEqual((await pixels()).signature,shadowBefore);
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'Export proposal image',exact:true}).click();
  await (await download).saveAs(`${outputDir}/proposal-export.png`);
  await page.getByRole('button',{name:'Design view',exact:true}).click();
  await page.getByLabel('Mounting height (m)',{exact:true}).fill('2.2');await page.getByLabel('Mounting height (m)',{exact:true}).press('Tab');
  await page.getByLabel('Upper terrace height above roof (m)',{exact:true}).fill('3.4');await page.getByLabel('Upper terrace height above roof (m)',{exact:true}).press('Tab');
  await page.getByRole('button',{name:'+ Water Tank',exact:true}).click();
  await page.getByLabel('Obstacle height (m)',{exact:true}).fill('2.3');await page.getByLabel('Obstacle height (m)',{exact:true}).press('Tab');
  await page.getByRole('button',{name:'Save design',exact:true}).click();
  await page.reload();await page.waitForSelector('canvas[aria-label]');
  assert.equal(await page.getByLabel('Mounting height (m)',{exact:true}).inputValue(),'2.2');
  assert.equal(await page.getByLabel('Upper terrace height above roof (m)',{exact:true}).inputValue(),'3.4');
  assert.ok(await page.evaluate(()=>window.studioStore.getState().obstacles.some(o=>o.heightM===2.3)));
  await page.getByRole('button',{name:'Analysis & array settings',exact:true}).click();
  await page.getByRole('button',{name:/Run Shading Analysis/}).click();
  await page.waitForFunction(()=>!document.body.textContent.includes('Checking every panel'),{},{timeout:30000});
  await page.getByRole('button',{name:'Client presentation',exact:true}).click();
  await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Perspective view',exact:true}).click();await page.waitForTimeout(500);
  p=await pixels();assert.ok(p.dark>30&&p.light>100,JSON.stringify(p));
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:`${outputDir}/mobile-proposal.png`});
  await page.getByRole('button',{name:'Design properties',exact:true}).click();await page.screenshot({path:`${outputDir}/mobile-properties.png`});
  await page.goto(`${url}/?readonly`);await page.waitForSelector('canvas[aria-label]');
  assert.equal(await page.getByRole('button',{name:'Save design',exact:true}).count(),0);
  const savedDesign=await page.evaluate(()=>JSON.parse(localStorage.getItem('studio-saved')));
  const appPage=await browser.newPage({viewport:{width:1440,height:960}});
  appPage.on('pageerror',e=>errors.push(e.message));
  // Vercel serves telemetry only on deployed hosts; localhost otherwise redirects it to login.
  await appPage.route('**/_vercel/insights/**',route=>route.fulfill({contentType:'application/javascript',body:''}));
  await appPage.route('**/api/public-design?*',route=>route.fulfill({json:{design:savedDesign,project:{client_name:'Mehta Residence',address:'Thane, Maharashtra'}}}));
  await appPage.route('**/api/satellite-image?*',route=>route.fulfill({json:{imageUrl:null}}));
  await appPage.goto(`${process.argv[2] || 'http://localhost:3000'}/design?client=1&projectId=studio-validation`,{timeout:60000,waitUntil:'domcontentloaded'});
  await appPage.waitForSelector('canvas[aria-label]',{timeout:60000});
  await appPage.waitForTimeout(600);
  assert.equal(await appPage.locator('.app-sidebar-rail').count(),0);
  assert.ok(await appPage.locator('.solar-title').evaluate(el=>el.getBoundingClientRect().left>=0));
  await appPage.screenshot({path:`${outputDir}/app-client-view.png`});
  await appPage.setViewportSize({width:390,height:844});
  await appPage.getByRole('button',{name:'Perspective view',exact:true}).click();
  await appPage.waitForTimeout(250);
  assert.ok(await appPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await appPage.screenshot({path:`${outputDir}/app-mobile-client-view.png`});
  await appPage.close();
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({result:'PASS',checks:['nonblank desktop/mobile WebGL','camera presets','moving sun','PNG export','saved mounting/terrace/obstacle height reload','shading execution','mobile overflow','read-only controls','actual Next.js client route'],screenshots:outputDir},null,2));
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
