# Tenant Security and Recovery

## Status: code hardening, not a production security certification

The user prioritizes recoverable access over vendor-held encryption keys. No row encryption or destructive migration was performed. Database encryption at rest is a managed infrastructure responsibility, not provided by the sharing-token code. Infrastructure owners and service-role credentials remain privileged. Do not promise owner-blindness or zero data loss.

## Production audit and target confirmation (2026-09-17)

- The production website was https://solaripe.vercel.app on 2026-09-17; the main address is now https://www.amsuapp.in, and solaripe.vercel.app stays available as a secondary address. Dashboard project ID: prj_bd2Ze50Q41QwpTz9zaANMasnkPYX, under kisan-vishwakarma-s-projects. Corrected the local .vercel/project.json project ID only; preserved the previous link in backups/vercel-project-link-before-20260917.json. No deployment performed.
- Supabase project rnyejnvsuzxytpraltju has a legacy ALL policy on public.designs with USING (true) and WITH CHECK (true) for anon/authenticated. Table grants must be checked before concluding public exploitability. The inspected projects SELECT rule uses auth.uid() = tenant_id; full tenant isolation remains unverified.
- Supabase Free plan dashboard reports no included project backups. External backups and recovery have not been verified. Do not apply production migrations until a recovery plan is verified and changes approved.
- Supabase Advisor flags public branding object listing, disabled leaked-password protection, mutable function search paths and executable SECURITY DEFINER functions. These require review, not blanket claims of exploitation.
- Initial inspection found no DESIGN_SHARE_SECRET in the Vercel project variable list and no linked shared variables; the secret has since been added as recorded below. Several other sensitive variables remain scoped to Production and Preview. Values were not revealed or compared.
- Vercel Standard Protection and protected sourcemaps are enabled. Code/chat model-training data preference is enabled; this observation does not establish sharing of database records.
- Live database changes, additional secret configuration, backup setup and deployment still require approval. Managed encryption and recovery do not make data inaccessible to privileged infrastructure owners.

### Approved environment setup (2026-09-17)

- Saved NEXT_PUBLIC_SITE_URL as a Config variable (then https://solaripe.vercel.app; it must now be https://www.amsuapp.in, followed by a redeploy) scoped to Production only in the confirmed Vercel project. The dashboard confirmed success and states a new deployment is needed for the change to take effect. No redeploy was triggered; existing NEXT_PUBLIC_APP_URL and other variables were not altered.
- User completed DESIGN_SHARE_SECRET entry/save. Verified the Vercel list shows DESIGN_SHARE_SECRET as Secret, Production only, and a successful-save notice. Its value, length, entropy and recovery copy were not inspected. No deployment was triggered, so runtime availability remains unverified.
- Production database policies, backups, migrations and deployment remain unchanged. Preview must use a separate signing secret and isolated test data before release validation.

## Application changes

- Normal APIs now require authentication by default. Explicit public exceptions enforce their own authorization (except the intentional public demo enquiry form).
- Client design reads require a project-scoped, tenant-scoped HMAC capability lasting 30 days. Only the authenticated owner of a saved project/design can issue one. UUID-only links intentionally stop working; regenerate old proposals/links.
- Links expose the latest saved geometry and project name/address, not the CRM or arbitrary project_info. Anyone receiving or forwarding a link can view that design until expiry. Links are NOT recipient-authenticated and currently have no individual revocation UI. Signing-key rotation invalidates all outstanding links.
- Twilio HTTP callbacks and standalone WSS handshakes verify signatures. The voice socket limits incoming messages to 64 KiB. Real provider calls still require deployment verification. Scheduled reminder APIs require a configured bearer secret, not a query-string secret or platform-admin session.
- Manual call summaries go to the authenticated tenant's configured notification number. New/default settings no longer substitute the platform owner's phone; existing saved recipients must be reviewed by their EPC owner.
- Private response caching is disabled. A rebuilt service worker removes known legacy private runtime caches on activation; already downloaded PDFs and external copies cannot be revoked.
- Quote design links are compactly embedded on the cover rather than placed on a nearly empty page. Existing rasterized saved PDFs must be regenerated to adopt the new layout.

## Deployment requirements

1. Set server-only DESIGN_SHARE_SECRET to a cryptographically random secret with at least 32 characters in the deployment secret manager. Never prefix it NEXT_PUBLIC or commit its value. Sharing fails closed if missing. Store a recovery copy under controlled access. Losing this secret only invalidates links; projects and quotes remain in the database and new links can be issued with a replacement secret.
2. Set NEXT_PUBLIC_APP_URL to the exact externally reachable HTTP(S) origin used by Twilio, including the current development tunnel origin. Match webhook URLs and verify a real test call after deployment. No unsigned development bypass is supported.
   Set MEDIA_STREAM_WS_URL to the exact public wss:// URL of the standalone voice server and verify its handshake. Missing/incorrect configuration fails closed. Signature validation is not rate limiting or replay prevention; those and provider usage limits remain operational follow-up work.
3. Configure CRON_SECRET and update schedulers to send Authorization: Bearer, not a URL query parameter. Verify successful runs and alert on failures.
4. Set NEXT_PUBLIC_SITE_URL to the main HTTPS website, https://www.amsuapp.in. A localhost URL is not usable by customers.
5. Review and apply only migration 0021 after checking existing migration history and testing in staging. Do NOT replay historical 0004/0005: they contain TRUNCATE statements. This task has not applied 0021 to a live database.
6. Build/deploy the service worker changes; confirm legacy caches disappear. Keep database/service-role/Twilio keys server-only and limit dashboard access with MFA and least privilege.

## Required live verification

Create two disposable EPC test accounts A and B and one project/lead/design/quote per account. Using each account's JWT directly against Supabase REST (not only UI), verify A cannot SELECT, INSERT, UPDATE or DELETE B's rows; also try spoofing tenant_id and cross-tenant parent IDs. Repeat unauthenticated. Verify the owner can still save/read all supported workflows. Inspect all policies, security-definer functions, views, grants, Storage policies and foreign-key ownership checks. A restrictive tenant fence does not automatically validate every cross-table relationship.

Check public-design: unsigned, altered, expired and wrong-project tokens must fail; a valid link only returns its one intended project. Check link issuance as another tenant. Audit the standalone media-stream server, AI prompts/log retention and third-party providers before calling the overall platform hardened. Backend service-role processes bypass normal RLS and must stay tightly scoped.

Branding storage is intentionally public for logos/media used in proposals. It must not contain confidential client documents. Move any confidential uploads to a separately authorized private bucket, with signed downloads. Inspect existing contents before changing bucket visibility.

## Recovery operations (not yet configured or tested here)

- Verify the actual Supabase plan's backup retention and enable appropriate PITR if needed. Agree recovery-point and recovery-time objectives with the business; do not imply these are zero.
- Schedule encrypted database backups to a separately controlled destination, with retention protection and failure alerts. Protect managed keys in a secrets system with recovery procedures and restricted break-glass access.
- Back up Storage objects separately, plus deployment configuration, schema/migrations and required secret recovery material. Supabase database backups include Storage metadata, not the underlying files. [Supabase backup documentation](https://supabase.com/docs/guides/platform/backups)
- Restore into an isolated project at least quarterly. Verify tenant IDs/Auth relationships, sample record counts, quote reopening, design geometry and actual uploaded files. Record measured restore time and backup age; never test a restore by overwriting production.
- Use verified account recovery through Supabase Auth. Do not implement an unauthenticated support bypass or disclose whether arbitrary customer accounts exist.
- Enable and review infrastructure/admin audit logs; an application-wide immutable audit trail is not implemented by this patch. Record metadata for privileged actions, not full lead transcripts, tokens or credentials.

Signature verification follows the provider's validation model. [Twilio security documentation](https://www.twilio.com/docs/usage/security)

## Local verification on 2026-09-14

Security/unit tests and isolated production sharing-handler tests pass (database substituted; not a live RLS test). Playwright design suite passes desktop/mobile canvas, camera, obstacle drag, saved fixture and read-only checks. Full quote fixture remains five pages with the compact link on its 1123px A4 cover; no additional design page. The actual local Next server rejects anonymous public-design/callback calls with 403 and private API/cron calls with 401. Source TypeScript checking reports the three existing backup-page errors; generated Next dev types were also malformed during one full check. No live database migration, secret changes or backup/restore configuration was performed.
