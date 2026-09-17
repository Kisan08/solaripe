import { createHmac, timingSafeEqual } from 'node:crypto';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const SHARE_TTL_SECONDS = 30 * 24 * 60 * 60;
type Scope = { projectId: string; tenantId: string; expiresAt: number };

function signingKey(secret: string | undefined) {
  if (!secret || secret.length < 32) throw new Error('Design sharing is not configured.');
  return secret;
}

export function issueDesignToken(projectId: string, tenantId: string, secret: string | undefined, now = Date.now()) {
  const key = signingKey(secret);
  if (!UUID.test(projectId) || !UUID.test(tenantId)) throw new Error('Invalid share scope');
  const scope: Scope = { projectId, tenantId, expiresAt: Math.floor(now / 1000) + SHARE_TTL_SECONDS };
  const payload = Buffer.from(JSON.stringify(scope)).toString('base64url');
  const signature = createHmac('sha256', key).update(`design-share-v1:${payload}`).digest('base64url');
  return { token: `${payload}.${signature}`, expiresAt: scope.expiresAt };
}

export function verifyDesignToken(token: string | null, projectId: string, secret: string | undefined, now = Date.now()): Scope | null {
  try {
    const key = signingKey(secret);
    if (!token || token.length > 1024 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(token)) return null;
    const [payload, signature] = token.split('.');
    const expected = createHmac('sha256', key).update(`design-share-v1:${payload}`).digest('base64url');
    if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
    const scope = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Scope;
    const seconds = Math.floor(now / 1000);
    return UUID.test(scope.tenantId) && UUID.test(scope.projectId) && scope.projectId === projectId
      && Number.isInteger(scope.expiresAt) && scope.expiresAt > seconds
      && scope.expiresAt <= seconds + SHARE_TTL_SECONDS ? scope : null;
  } catch { return null; }
}
