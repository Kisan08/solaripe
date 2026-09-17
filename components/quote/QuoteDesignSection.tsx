import React from 'react';
import { Box, ExternalLink } from 'lucide-react';
import { safeDesignQuoteLink } from '../../lib/designQuoteLink';

export function QuoteDesignSection({url}:{url?:string}) {
  const href=safeDesignQuoteLink(url);
  if (!href) return null;
  return <section aria-label="Project design" style={{padding:'10px 0',borderTop:'1px solid #d8e0e7',color:'#243b47',breakInside:'avoid'}}>
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}>
      <h2 style={{fontSize:15,margin:0,display:'flex',gap:8,alignItems:'center'}}><Box size={18}/> Your Solar Design</h2>
      <a data-design-link href={href} target="_blank" rel="noopener noreferrer" style={{display:'inline-flex',alignItems:'center',gap:8,color:'#1765ad',fontSize:14,fontWeight:700,textDecoration:'underline'}}>View 3D Design <ExternalLink size={14}/></a>
    </div>
    <p style={{fontSize:10,lineHeight:1.5,margin:'6px 0 0'}}>Latest saved layout; subject to site verification. Sharing link expires 30 days after creation. Request a new link from your EPC vendor when needed.</p>
  </section>;
}
