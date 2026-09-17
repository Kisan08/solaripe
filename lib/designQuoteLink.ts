export function designQuoteLink(origin: string, projectId: string, shareToken = '') {
  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(shareToken) || shareToken.length > 1024) return '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId)) return '';
  try {
    const url=new URL('/design',origin);
    if (!['https:','http:'].includes(url.protocol)) return '';
    if (url.username || url.password) return '';
    if (url.protocol === 'http:' && !['localhost','127.0.0.1','[::1]'].includes(url.hostname)) return '';
    url.searchParams.set('projectId',projectId);url.searchParams.set('client','1');
    url.searchParams.set('shareToken',shareToken);
    return url.href;
  } catch { return ''; }
}

export function safeDesignQuoteLink(value: string | undefined) {
  try {
    const url=new URL(value ?? '');
    return url.pathname==='/design' && url.searchParams.get('client')==='1'
      ? designQuoteLink(url.origin,url.searchParams.get('projectId') ?? '',url.searchParams.get('shareToken') ?? '') : '';
  } catch { return ''; }
}
