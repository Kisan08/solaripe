import {safeDesignQuoteLink} from './designQuoteLink';

export function annotateDesignLinks(pdf:{link:(x:number,y:number,w:number,h:number,options:{url:string})=>unknown},page:HTMLElement,pageWidth:number,renderedHeight:number,offsetY:number) {
  const bounds=page.getBoundingClientRect();
  if (!bounds.width || !bounds.height) return;
  page.querySelectorAll<HTMLAnchorElement>('a[data-design-link]').forEach(anchor=>{
    const url=safeDesignQuoteLink(anchor.href),rect=anchor.getBoundingClientRect();
    if(!url || rect.width<=0 || rect.height<=0) return;
    pdf.link((rect.left-bounds.left)/bounds.width*pageWidth,
      offsetY+(rect.top-bounds.top)/bounds.height*renderedHeight,
      rect.width/bounds.width*pageWidth,rect.height/bounds.height*renderedHeight,{url});
  });
}
