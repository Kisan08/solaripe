import test from 'node:test';
import assert from 'node:assert/strict';
import {jsPDF} from 'jspdf';
import {designQuoteLink,safeDesignQuoteLink} from '../../lib/designQuoteLink';
import {annotateDesignLinks} from '../../lib/designPdfLinks';

const project='5acd2406-d539-4f13-92f1-5665a0e5f1bd';
const url=designQuoteLink('https://solar.example',project, 'fixture.'+'a'.repeat(43));
test('quote design links are read-only and survive snapshot serialization',()=>{
  assert.equal(new URL(url).searchParams.get('client'),'1');
  assert.equal(new URL(url).searchParams.get('projectId'),project);
  assert.equal(safeDesignQuoteLink(JSON.parse(JSON.stringify({designUrl:url})).designUrl),url);
  assert.equal(safeDesignQuoteLink('javascript:alert(1)'), '');
  assert.equal(designQuoteLink('https://solar.example','bad-id'),'');
  assert.equal(safeDesignQuoteLink('https://solar.example/design?projectId='+project),'');
  assert.equal(safeDesignQuoteLink(undefined),'');
  assert.equal(designQuoteLink('https://solar.example', project), '');
  assert.equal(designQuoteLink('http://solar.example',project,'fixture.'+'a'.repeat(43)), '');
});
test('rasterized quote receives a real clickable PDF URL annotation',()=>{
  const page={getBoundingClientRect:()=>({left:0,top:0,width:800,height:1100}),querySelectorAll:()=>[
    {href:url,getBoundingClientRect:()=>({left:80,top:110,width:160,height:55})}
  ]} as unknown as HTMLElement;
  const pdf=new jsPDF();annotateDesignLinks(pdf,page,200,275,10);
  const output=pdf.output();
  assert.ok(output.includes('/Subtype /Link'));assert.ok(output.includes(url));
  const calls:unknown[][]=[];
  annotateDesignLinks({link:(...args)=>calls.push(args)},page,200,275,10);
  assert.deepEqual(calls[0],[20,37.5,40,13.75,{url}]);
});
