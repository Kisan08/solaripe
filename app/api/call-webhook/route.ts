// Service-role client — this is a Twilio status callback, no browser
// session exists here at all (see lib/calling/stateManager.ts for the
// same reasoning).
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";
import { NextRequest, NextResponse } from "next/server";
import { sendOwnerWhatsApp, formatCallSummaryMessage } from "@/lib/whatsappNotify";

export async function POST(req: NextRequest) {
  const body = await req.text();
  const params = new URLSearchParams(body);

  const callStatus = params.get("CallStatus");
  const clientId = new URL(req.url).searchParams.get("clientId") || "";

  const failedStatuses = ["no-answer", "busy", "failed", "canceled"];
  if (callStatus && failedStatuses.includes(callStatus)) {
    await supabase
      .from("clients")
      .update({ status: "no_answer", called_at: new Date().toISOString() })
      .eq("id", clientId);
  }

  // "completed" fires for every call ending, however it ends (the AI closed
  // it naturally, the customer hung up first, or the line dropped) — unlike
  // hooking into the AI's own endCall branch, this can't be missed. Read
  // whatever's currently on the client's row (call-response updates
  // status/notes turn by turn, so it reflects wherever the conversation
  // actually got to, not just a fully "completed" AI-decided close).
  //
  // Confirmed (Phase 8 investigation): this previously sent a WhatsApp
  // message for EVERY completed call regardless of outcome — there was no
  // status check here, and sendOwnerWhatsApp itself has no filtering
  // either. That didn't match the described intent of "only interested
  // leads go to WhatsApp," so the status check below is the actual fix,
  // not a pre-existing behavior being preserved.
  if (callStatus === "completed" && clientId) {
    const { data: client } = await supabase
      .from("clients")
      .select("name, phone, status, notes, lead_score")
      .eq("id", clientId)
      .single();

    if (client && client.status === "interested") {
      const message = formatCallSummaryMessage({
        name: client.name,
        phone: client.phone,
        stage: client.status,
        notes: client.notes,
        leadScore: client.lead_score,
      });
      // Awaited, not fire-and-forget: a Vercel serverless function can be
      // frozen the instant it returns a response, so an un-awaited promise
      // here isn't guaranteed to ever actually finish sending. It already
      // never throws (see sendOwnerWhatsApp), so this can't fail the
      // 200 Twilio expects back either way.
      await sendOwnerWhatsApp(message);
    }
  }

  return new NextResponse("ok", { status: 200 });
}