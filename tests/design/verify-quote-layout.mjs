import { build } from 'esbuild';
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const output = 'artifacts/quote-layout-validation';
await mkdir(output, { recursive: true });
const form = {
  proposalNo: 'EPC-2026-001', date: '2026-09-14', validUntil: '2026-10-14', clientName: 'Priya Deshmukh Residence',
  siteAddress: 'Ghodbunder Road, Thane, Maharashtra', contactPhone: '', systemCapacity: 69.6, ratePerWp: 52,
  subsidyTotal: 0, monthlyBill: 50000, gridRate: 8, gridEscalation: 5, roofType: 'RCC Flat', floors: 'G+4',
  shadow: 'Minimal', projectType: 'CAPEX (EPC)', ppaRate: 5, ppaTermYears: '15 Years', acCableSpec: 'As per design', batteryKwh: 0,
  designUrl: 'https://solar.example/design?projectId=5acd2406-d539-4f13-92f1-5665a0e5f1bd&client=1&shareToken=fixture.' + 'a'.repeat(43),
};
const bundle = await build({
  stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
    import {QuotationDocument,compute} from './app/quote/page'; import {defaultSettings} from './lib/settings';
    const f=${JSON.stringify(form)}; if(location.search.includes('no-link')) delete f.designUrl;
    createRoot(document.getElementById('root')).render(<QuotationDocument f={f} c={compute(f)} s={defaultSettings}
      showSiteDetails={true} panel={null} inverter={null} clientLogos={[]} testimonials={[]} certifications={[]} featuredProjects={[]}/>);`,
    resolveDir: process.cwd(), loader: 'tsx' },
  bundle: true, write: false, outdir: 'out', platform: 'browser', format: 'iife', jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"development"' },
  plugins: [{ name: 'quote-fixture', setup(b) {
    b.onLoad({ filter: /app[\\/]quote[\\/]page\.tsx$/ }, async ({path}) => ({ contents: (await readFile(path, 'utf8')) + '\nexport {QuotationDocument,compute};', loader: 'tsx' }));
    b.onResolve({filter: /^next\/navigation$/}, () => ({path: 'navigation', namespace: 'stub'}));
    b.onResolve({filter: /^@\/lib\/supabase\/client$/}, () => ({path: 'database', namespace: 'stub'}));
    b.onLoad({filter: /.*/, namespace: 'stub'}, ({path}) => ({contents: path === 'database'
      ? 'export function createClient(){return {}}' : 'export function useSearchParams(){return new URLSearchParams()}', loader: 'js'}));
  }}],
});
const publicDir = path.resolve('public');
const server = createServer(async (req,res) => {
  if (req.url === '/out.js') { res.setHeader('Content-Type','text/javascript'); res.end(bundle.outputFiles.find(f=>f.path.endsWith('.js')).contents); return; }
  if (/\.(png|jpg)$/.test(req.url || '')) {
    const file = path.resolve(publicDir, '.' + req.url);
    if (!file.startsWith(publicDir + path.sep)) { res.writeHead(403).end(); return; }
    try { res.setHeader('Content-Type',file.endsWith('.png')?'image/png':'image/jpeg'); res.end(await readFile(file)); }
    catch { res.writeHead(404).end(); }
    return;
  }
  res.setHeader('Content-Type','text/html');
  res.end('<html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{margin:0;background:#e8ebee}*{box-sizing:border-box}</style></head><body><div id="root"></div><script src="/out.js"></script></body></html>');
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser = await chromium.launch({channel:'msedge',headless:true});
try {
  const page = await browser.newPage({viewport:{width:1100,height:1250}});
  const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  const url=`http://127.0.0.1:${server.address().port}`;
  await page.goto(url+'?no-link'); await page.waitForSelector('.quote-page');
  const baseline=await page.locator('.quote-page').count();
  await page.goto(url); await page.waitForSelector('[data-design-link]');
  await page.evaluate(()=>Promise.all([...document.images].map(img=>img.decode().catch(()=>{}))));
  assert.equal(await page.locator('.quote-page').count(),baseline,'Design must not add a page');
  assert.equal(await page.locator('.quote-page').first().locator('[data-design-link]').count(),1);
  const cover = page.locator('.quote-page').first();
  const bounds=await cover.boundingBox();
  const link=await page.locator('[data-design-link]').boundingBox();
  assert.ok(link.y+link.height < bounds.y+bounds.height-20);
  assert.ok(bounds.height <= 1124, 'Cover exceeds A4 height: '+bounds.height);
  assert.equal(await page.locator('text=fixture.aaaaaaaa').count(),0,'Token must not be printed');
  assert.ok(await page.evaluate(()=>[...document.images].every(i=>i.complete && i.naturalWidth>0)), 'Images must render');
  await cover.screenshot({path:output+'/cover.png'});
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:true,pageCount:baseline,coverHeight:bounds.height,screenshot:output+'/cover.png'}));
} finally { await browser.close(); await new Promise(resolve=>server.close(resolve)); }
