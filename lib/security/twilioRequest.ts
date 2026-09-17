import twilio from 'twilio';

export function validTwilioUpgrade(path: string | undefined, signature: string | string[] | undefined,
  token = process.env.TWILIO_AUTH_TOKEN, publicUrl = process.env.MEDIA_STREAM_WS_URL): boolean {
  try {
    if (!path || typeof signature !== 'string' || !token || !publicUrl) return false;
    const url = new URL(publicUrl);
    if (url.protocol !== 'wss:' || url.username || url.password || url.hash) return false;
    if (path !== url.pathname + url.search) return false;
    // Twilio documents a trailing-slash variant for Voice WSS handshake signatures.
    const withSlash = new URL(url);
    if (!withSlash.pathname.endsWith('/')) withSlash.pathname += '/';
    return twilio.validateRequest(token, signature, url.href, {})
      || twilio.validateRequest(token, signature, withSlash.href, {});
  } catch { return false; }
}

export async function validTwilioRequest(req: Request, token = process.env.TWILIO_AUTH_TOKEN, publicOrigin = process.env.NEXT_PUBLIC_APP_URL): Promise<boolean> {
  try {
    const signature = req.headers.get('x-twilio-signature');
    if (!token || !signature || !publicOrigin) return false;
    const incoming = new URL(req.url);
    const origin = new URL(publicOrigin);
    if (!['https:', 'http:'].includes(origin.protocol)) return false;
    const url = origin.origin + incoming.pathname + incoming.search;
    const params: Record<string, string | string[]> = Object.create(null);
    if (req.method === 'POST') {
      if (!req.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded')) return false;
      const body = await req.clone().text();
      if (body.length > 128_000) return false;
      const form = new URLSearchParams(body);
      for (const key of new Set(form.keys())) {
        const values = form.getAll(key);
        params[key] = values.length === 1 ? values[0] : values;
      }
    } else if (req.method !== 'GET') return false;
    return twilio.validateRequest(token, signature, url, params);
  } catch { return false; }
}
