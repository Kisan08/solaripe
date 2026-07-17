import { supabase } from "@/lib/supabase";
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
  if (callStatus === "completed" && clientId) {
    const { data: client } = await supabase
      .from("clients")
      .select("name, phone, status, notes")
      .eq("id", clientId)
      .single();

    if (client) {
      const message = formatCallSummaryMessage({
        name: client.name,
        phone: client.phone,
        stage: client.status,
        notes: client.notes,
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