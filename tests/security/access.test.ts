import test from 'node:test';
import assert from 'node:assert/strict';
import twilio from 'twilio';
import { issueDesignToken, verifyDesignToken, SHARE_TTL_SECONDS } from '../../lib/security/designShareToken';
import { validTwilioRequest, validTwilioUpgrade } from '../../lib/security/twilioRequest';
import { publicApiPaths } from '../../lib/security/publicApiPaths';

const project = '5acd2406-d539-4f13-92f1-5665a0e5f1bd';
const tenant = '343b0352-74c6-4aea-9f2e-0bd09e7d3010';
const secret = 'test-only-key-'.repeat(4);
const now = 1_800_000_000_000;

test('design capability is scoped, expires, and rejects tampering or missing configuration', () => {
  const { token } = issueDesignToken(project, tenant, secret, now);
  assert.equal(verifyDesignToken(token, project, secret, now)?.tenantId, tenant);
  assert.equal(verifyDesignToken(token, tenant, secret, now), null);
  assert.equal(verifyDesignToken(token, project, secret, now + SHARE_TTL_SECONDS * 1000), null);
  assert.equal(verifyDesignToken(token + 'x', project, secret, now), null);
  const [payload, signature] = token.split('.');
  const scope = JSON.parse(Buffer.from(payload, 'base64url').toString());
  scope.tenantId = project;
  const forged = Buffer.from(JSON.stringify(scope)).toString('base64url') + '.' + signature;
  assert.equal(verifyDesignToken(forged, project, secret, now), null);
  assert.equal(verifyDesignToken(token, project, 'different-secret'.repeat(4), now), null);
  assert.equal(verifyDesignToken(token, project, undefined, now), null);
  assert.equal(verifyDesignToken(null, project, secret, now), null);
  assert.throws(() => issueDesignToken(project, tenant, undefined));
});

test('Twilio signatures bind URL and body without consuming the request', async () => {
  const origin = 'https://solar.example';
  const path = '/api/call-response?clientId=abc';
  const form = { CallSid: 'CAfixture', SpeechResult: 'Interested' };
  const signature = twilio.getExpectedTwilioSignature(secret, origin + path, form);
  const make = (body = form, url = 'http://localhost:3000' + path) => new Request(url, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Twilio-Signature': signature },
    body: new URLSearchParams(body),
  });
  const req = make();
  assert.equal(await validTwilioRequest(req, secret, origin), true);
  assert.ok((await req.text()).includes('Interested'));
  assert.equal(await validTwilioRequest(make({ ...form, SpeechResult: 'Changed' }), secret, origin), false);
  assert.equal(await validTwilioRequest(make(form, 'http://localhost/api/call-response?clientId=other'), secret, origin), false);
  assert.equal(await validTwilioRequest(new Request(origin + path), secret, origin), false);
  assert.equal(await validTwilioRequest(make(), '', origin), false);
  assert.equal(await validTwilioRequest(make(), secret, ''), false);
});

test('sensitive APIs are private by default', () => {
  for (const path of ['/api/design-share', '/api/notify/call-summary', '/api/make-call', '/api/crm/clients', '/api/admin/products', '/api/new-private-route']) {
    assert.equal(publicApiPaths.has(path), false, path);
  }
});

test('voice socket rejects unsigned upgrades and wrong paths', () => {
  const url = 'wss://voice.example/media-stream';
  const signature = twilio.getExpectedTwilioSignature(secret, url, {});
  assert.equal(validTwilioUpgrade('/media-stream', signature, secret, url), true);
  assert.equal(validTwilioUpgrade('/media-stream', undefined, secret, url), false);
  assert.equal(validTwilioUpgrade('/other', signature, secret, url), false);
  assert.equal(validTwilioUpgrade('/media-stream', signature, 'wrong', url), false);
  assert.equal(validTwilioUpgrade('/media-stream', signature, secret, ''), false);
  assert.equal(validTwilioUpgrade('/media-stream', signature, secret, 'ws://voice.example/media-stream'), false);
});
