// Service-role client — this is a Twilio status callback, no browser
// session exists here at all (see lib/calling/stateManager.ts for the
// same reasoning).
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";
import { NextRequest, NextResponse } from "next/server";
import { sendWhatsAppTo, formatCallSummaryMessage } from "@/lib/whatsappNotify";

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
      .select("name, phone, status, notes, lead_score, tenant_id")
      .eq("id", clientId)
      .single();

    if (client) {
      // Fallback for calls that end before a real outcome was ever
      // written — the streaming pipeline (server/media-stream-server.ts)
      // only writes a status when the LLM's own [OUTCOME:...] marker
      // fires, which never happens if the call is dropped, the caller
      // hangs up mid-conversation, or the WS process crashes. Mirrors the
      // old flow's existing silent-mid-call fallback in
      // call-response/route.ts ("Customer went silent mid-call; needs a
      // manual callback."), so status is NEVER left stuck on "calling"
      // once Twilio reports the call as done, regardless of what
      // happened mid-call, and regardless of which flow made the call.
      if (client.status === "calling") {
        await supabase
          .from("clients")
          .update({
            status: "call_back",
            notes: "Call ended before a clear outcome was captured; needs a manual callback.",
          })
          .eq("id", clientId);
        client.status = "call_back"; // keep the in-memory copy in sync for the check below
      }

      if (client.status === "interested") {
        const message = formatCallSummaryMessage({
          name: client.name,
          phone: client.phone,
          stage: client.status,
          notes: client.notes,
          leadScore: client.lead_score,
        });

        // Tenant-scoped recipient — same pattern as
        // app/api/cron/send-reminders/route.ts, replacing the old
        // hardcoded sendOwnerWhatsApp(OWNER_WHATSAPP_NUMBER) which always
        // notified one fixed number regardless of which tenant's client
        // this was.
        const { data: settingsRow } = await supabase
          .from("settings")
          .select("owner_phone")
          .eq("tenant_id", client.tenant_id)
          .single();

        if (!settingsRow?.owner_phone) {
          console.error(`[call-webhook] tenant ${client.tenant_id} has no owner_phone set, skipping WhatsApp notification`);
        } else {
          // Awaited, not fire-and-forget: a Vercel serverless function can be
          // frozen the instant it returns a response, so an un-awaited promise
          // here isn't guaranteed to ever actually finish sending. It already
          // never throws (see sendWhatsApp), so this can't fail the
          // 200 Twilio expects back either way.
          await sendWhatsAppTo(settingsRow.owner_phone, message);
        }
      }
    }
  }

  return new NextResponse("ok", { status: 200 });
}