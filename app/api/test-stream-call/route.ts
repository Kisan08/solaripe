import { NextRequest, NextResponse } from "next/server";
import twilio from "twilio";

// TEST-ONLY route to trigger an outbound call straight into the new
// streaming voice pipeline (call-stream-twiml -> media-stream-server),
// bypassing the client lookup / status updates in make-call/route.ts so
// testing never touches real lead records. Delete this file once the
// streaming pipeline is validated and folded into make-call properly.
const client = twilio(
  process.env.TWILIO_ACCOUNT_SID!,
  process.env.TWILIO_AUTH_TOKEN!
);

export async function POST(req: NextRequest) {
  try {
    const { to } = await req.json(); // e.g. { "to": "9876543210" }

    if (!to) {
      return NextResponse.json({ error: "to (10-digit phone) required" }, { status: 400 });
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://solaripe.vercel.app";

    const call = await client.calls.create({
      to: `+91${to.replace(/\D/g, "").slice(-10)}`,
      from: process.env.TWILIO_PHONE_NUMBER!,
      url: `${baseUrl}/api/call-stream-twiml`,
    });

    return NextResponse.json({ success: true, callSid: call.sid });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}