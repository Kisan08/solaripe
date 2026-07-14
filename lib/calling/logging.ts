import { supabase } from "@/lib/supabase";

export async function logTurn(params: {
  callSid: string;
  clientId: string;
  turn: number;
  customerText: string;
  aiText: string;
  intent: string;
  stage: string;
  latencyMs: number;
  error?: string;
}): Promise<void> {
  const { error } = await supabase.from("call_logs").insert({
    call_sid: params.callSid,
    client_id: params.clientId,
    turn: params.turn,
    customer_text: params.customerText,
    ai_text: params.aiText,
    intent: params.intent,
    stage: params.stage,
    latency_ms: params.latencyMs,
    error: params.error ?? null,
  });
  // Logging is best-effort — never let a logging failure break the live call.
  if (error) console.error("[call_logs] insert failed", error);
}
