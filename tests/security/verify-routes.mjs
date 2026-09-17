import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

// Production handlers with an isolated database substitute; never connects to Supabase.
await mkdir('artifacts/security-validation', { recursive: true });
await build({
  stdin: { contents: `export {POST as issue} from './app/api/design-share/route';
    export {GET as read} from './app/api/public-design/route';
    export {issueDesignToken} from './lib/security/designShareToken';
    export {proxy,config as proxyConfig} from './proxy';`, resolveDir: process.cwd(), loader: 'ts' },
  outfile: 'artifacts/security-validation/routes.cjs', bundle: true, platform: 'node', format: 'cjs', packages: 'external',
  plugins: [{ name: 'isolated-db', setup(b) {
    b.onResolve({ filter: /^@supabase\/ssr$/ }, () => ({path:'ssr',namespace:'fake-db'}));
    b.onResolve({ filter: /^@\/lib\/supabase(Admin|\/server)$/ }, args => ({ path: args.path, namespace: 'fake-db' }));
    b.onLoad({ filter: /.*/, namespace: 'fake-db' }, () => ({ contents: `export const supabaseAdmin=globalThis.__testDB; export function createServerClient(){return globalThis.__testDB} export async function createServerSupabaseClient(){return globalThis.__testDB}`, loader: 'js' }));
  }}],
});
const A = '343b0352-74c6-4aea-9f2e-0bd09e7d3010';
const B = '343b0352-74c6-4aea-9f2e-0bd09e7d3011';
const project = '5acd2406-d539-4f13-92f1-5665a0e5f1bd';
let user = A, reads = 0;
globalThis.__testDB = {
  auth: { getUser: async () => ({ data: { user: user ? { id: user } : null } }) },
  from(table) {
    const filters = {};
    let columns = '';
    return {
      select(value) { columns = value; return this; },
      eq(key, value) { filters[key] = value; return this; },
      async maybeSingle() {
        reads++;
        assert.ok('tenant_id' in filters, 'Every query must constrain tenant');
        assert.equal(filters[table === 'projects' ? 'id' : 'project_id'], project);
        const row = table === 'projects'
          ? { id: project, tenant_id: A, client_name: 'Fixture', address: 'Test address', phone: 'PRIVATE' }
          : { project_id: project, tenant_id: A, roofs: [], project_info: { phone: 'PRIVATE' } };
        return { data: filters.tenant_id === A ? Object.fromEntries(columns.split(',').map(c => c.trim()).map(c => [c, row[c]])) : null, error: null };
      },
    };
  },
};
process.env.DESIGN_SHARE_SECRET = 'local-fixture-secret-'.repeat(3);
const require = createRequire(import.meta.url);
const { NextRequest } = require('next/server');
const handlers = require('../../artifacts/security-validation/routes.cjs');
const issueRequest = () => new NextRequest('http://fixture/api/design-share', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId: project }) });
const readRequest = (token = '') => new NextRequest('http://fixture/api/public-design?' + new URLSearchParams({ projectId: project, shareToken: token }));
user = null;
for (const route of ['/api/design-share','/api/notify/call-summary','/api/admin/products/fake.png']) {
  assert.equal((await handlers.proxy(new NextRequest('http://fixture'+route))).status, 401);
}
assert.ok(handlers.proxyConfig.matcher.includes('/api/:path*'));
assert.equal((await handlers.proxy(new NextRequest('http://fixture/security-cache-cleanup.js'))).status, 200);
assert.equal((await handlers.issue(issueRequest())).status, 401);
assert.equal(reads, 0);
assert.equal((await handlers.read(readRequest())).status, 403);
assert.equal(reads, 0, 'Unsigned reads must not reach the database');
user = B;
assert.equal((await handlers.issue(issueRequest())).status, 404);
user = A;
const issued = await handlers.issue(issueRequest());
assert.equal(issued.status, 200);
const { token } = await issued.json();
const shared = await handlers.read(readRequest(token));
assert.equal(shared.status, 200);
assert.match(shared.headers.get('cache-control'), /no-store/);
assert.ok(!JSON.stringify(await shared.json()).includes('PRIVATE'));
const badScope = handlers.issueDesignToken(project, B, process.env.DESIGN_SHARE_SECRET).token;
assert.equal((await handlers.read(readRequest(badScope))).status, 404);
delete process.env.DESIGN_SHARE_SECRET;
assert.equal((await handlers.issue(issueRequest())).status, 503);
assert.equal((await handlers.read(readRequest(token))).status, 403);
console.log('PASS: production sharing handlers reject anonymous/other-tenant issuance, require signatures, constrain tenant reads, redact private fields, and fail closed without configuration. Database is mocked; live RLS is not tested.');
