import { NextRequest, NextResponse } from "next/server";
import twilio from "twilio";
import { supabase } from "@/lib/supabase";

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID!,
  process.env.TWILIO_AUTH_TOKEN!
);

export async function POST(req: NextRequest) {
  try {
    const { clientId, name, phone } = await req.json();

    if (!phone || !clientId) {
      return NextResponse.json(
        { error: "Phone and clientId required" },
        { status: 400 }
      );
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://onesolarpower.in";

    const call = await client.calls.create({
      to: `+91${phone.replace(/\D/g, "").slice(-10)}`,
      from: process.env.TWILIO_PHONE_NUMBER!,
      url: `${baseUrl}/api/call-twiml?clientId=${clientId}&name=${encodeURIComponent(name)}`,
      statusCallback: `${baseUrl}/api/call-webhook?clientId=${clientId}`,
      statusCallbackMethod: "POST",
    });

    // Update status in Supabase
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