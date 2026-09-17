import { timingSafeEqual } from 'node:crypto';

// Plain `===` on a secret leaks how many leading bytes matched through
// response timing. Not a practical remote attack over HTTPS with a
// high-entropy secret, but this is the one place a mismatch is checked
// against a fixed bearer token, so there's no reason not to close it.
export function bearerMatches(header: string | null, secret: string | undefined): boolean {
  if (!secret || !header?.startsWith('Bearer ')) return false;
  const provided = Buffer.from(header.slice('Bearer '.length));
  const expected = Buffer.from(secret);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}
