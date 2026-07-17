import { NextRequest, NextResponse } from "next/server";
import { company } from "@/lib/company.config";
import { getOrCreateSession } from "@/lib/calling/stateManager";
import { buildGatherTwiml, buildHangupTwiml } from "@/lib/calling/twiml";

// Turn 0 stays a fast, fixed (but CRM-personalized) greeting rather than an
// OpenAI call — there's nothing from the customer to react to yet, so
// generating it would only add latency before the phone even finishes
// ringing into the conversation. Every turn from here on is AI-driven (see
// call-response/route.ts).
async function handle(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const clientId = searchParams.get("clientId") || "";
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || company.website;

  try {
    // Twilio's real voice webhook POSTs CallSid as a form field. The GET
    // handler exists only so this route can be opened by hand for testing;
    // in that case there's no CallSid, so fall back to a synthetic one tied
    // to the client so a session still gets created and the turn loop still
    // works end to end.
    let callSid = "";
    if (req.method === "POST") {
      const formData = await req.formData();
      callSid = (formData.get("CallSid") as string) || "";
    }
    if (!callSid) callSid = `manual-${clientId}-${Date.now()}`;

    await getOrCreateSession(callSid, clientId);

    // Short, casual opener: short company name (not the full legal name),
    // and no name+"ji" honorific — gets straight to the point instead of
    // sounding like a formal script. Always the same line regardless of
    // whether we know the customer's city yet — keeps the very first thing
    // the customer hears consistent and simple.
    const greeting = `Hello, mai ${company.shortName} se Kajal bol rahi hoon. Aapke bijli bill mein bachat ke liye solar ke baare mein do minute baat kar sakte hain?`;

    const actionUrl = `${baseUrl}/api/call-response?clientId=${clientId}`;
    return new NextResponse(buildGatherTwiml(greeting, actionUrl), {
      headers: { "Content-Type": "text/xml" },
    });
  } catch (err) {
    // A live phone call must always get back valid TwiML — a raw 500 here
    // means Twilio can't render anything and the call just fails silently.
    // Most likely causes: the supabase/migrations/0001_ai_calling.sql
    // migration hasn't been run yet, or clientId isn't a real client row.
    console.error("[call-twiml] failed to build greeting", err);
    return new NextResponse(
      buildHangupTwiml("Maaf kijiye, thodi technical dikkat aa gayi. Humari team aapko dobara call karegi. Dhanyavaad."),
      { headers: { "Content-Type": "text/xml" } },
    );
  }
}

export async function GET(req: NextRequest) { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }
