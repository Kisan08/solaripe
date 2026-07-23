-- Phase 8: lead scoring for the AI calling system. `lead_score` is set
-- server-side by lib/calling/leadScore.ts's scoreLeadFromCall(), at the
-- same write as `status`/`notes` when a call ends (app/api/call-response/
-- route.ts's result.endCall branch) — not a separate call, not computed
-- client-side.
alter table public.clients
  add column lead_score text check (lead_score in ('hot', 'warm', 'cold'));
