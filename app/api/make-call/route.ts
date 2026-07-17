import { NextRequest, NextResponse } from "next/server";
import twilio from "twilio";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID!,
  process.env.TWILIO_AUTH_TOKEN!
);

export async function POST(req: NextRequest) {
  try {
    const { clientId } = await req.json();

    if (!clientId) {
      return NextResponse.json({ error: "clientId required" }, { status: 400 });
    }

    // Look up the client row server-side instead of trusting phone/name
    // from the request body — previously this route dialed whatever phone
    // number the client sent, with no check that clientId actually
    // resolved to that number or belonged to the caller at all. The
    // session-aware client + RLS (auth.uid() = tenant_id) means this
    // select returns nothing if clientId belongs to another tenant or
    // doesn't exist, so the call gets rejected instead of silently dialing
    // an arbitrary number.
    const supabase = await createServerSupabaseClient();
    const { data: clientRow, error: fetchError } = await supabase
      .from("clients")
      .select("name, phone")
      .eq("id", clientId)
      .single();

    if (fetchError || !clientRow?.phone) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://solaripe.vercel.app";

    const call = await client.calls.create({
      to: `+91${clientRow.phone.replace(/\D/g, "").slice(-10)}`,
      from: process.env.TWILIO_PHONE_NUMBER!,
      url: `${baseUrl}/api/call-twiml?clientId=${clientId}&name=${encodeURIComponent(clientRow.name)}`,
      statusCallback: `${baseUrl}/api/call-webhook?clientId=${clientId}`,
      statusCallbackMethod: "POST",
    });

    await supabase
      .from("clients")
      .update({ status: "calling", called_at: new Date().toISOString() })
      .eq("id", clientId);

    return NextResponse.json({ success: true, callSid: call.sid });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Call failed" }, { status: 500 });
  }
}
