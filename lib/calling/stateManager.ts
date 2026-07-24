// Service-role client — no browser session exists when Twilio hits these
// webhooks, so RLS's auth.uid() would be null. tenant_id on new rows is
// derived server-side from the associated clients row via a DB trigger
// (see supabase/migrations/0005_tenant_scope_crm.sql), not from a session.
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";
import type { CallSession } from "./types";

// Twilio calls your webhook fresh on every turn — there is no persistent
// process holding conversation state in memory between them (and even if
// there were, a serverless deployment can route consecutive requests to
// different instances). This table is the call's actual memory.
export async function getOrCreateSession(callSid: string, clientId: string): Promise<CallSession> {
  const { data: existing } = await supabase
    .from("call_sessions")
    .select("*")
    .eq("call_sid", callSid)
    .maybeSingle();

  if (existing) return existing as CallSession;

  const { data: created, error } = await supabase
    .from("call_sessions")
    .insert({ call_sid: callSid, client_id: clientId, stage: "greeting" })
    .select("*")
    .single();

  if (error || !created) throw new Error(`Failed to create call session: ${error?.message}`);
  return created as CallSession;
}

export async function saveSession(session: CallSession): Promise<void> {
  const { error } = await supabase
    .from("call_sessions")
    .update({
      stage: session.stage,
      turn_count: session.turn_count,
      silence_count: session.silence_count,
      transcript: session.transcript,
      slots: session.slots,
      intent: session.intent,
      emotion: session.emotion,
      ended: session.ended,
      fast_path_step: session.fast_path_step,
      updated_at: new Date().toISOString(),
    })
    .eq("id", session.id);

  if (error) throw new Error(`Failed to save call session: ${error.message}`);
}
