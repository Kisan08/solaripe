import { NextRequest, NextResponse } from "next/server";
import { company } from "@/lib/company.config";
import { getOrCreateSession } from "@/lib/calling/stateManager";
import { buildGatherTwiml, buildHangupTwiml } from "@/lib/calling/twiml";

// Turn 0 stays a fast, fixed greeting rather than an AI call — there's
// nothing from the customer to react to yet, so generating it would only
// add latency before the phone even finishes ringing into the
// conversation. The next one or two turns after this can ALSO be
// scripted (see lib/calling/fastPath.ts) if the customer's reply cleanly
// matches a simple yes/no pattern; anything else falls through to the
// full AI flow in call-response/route.ts.
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

    // Ends with a direct yes/no question ("Kya aapko solar lagvana hai?")
    // rather than a permission-to-talk question — this is what
    // lib/calling/fastPath.ts's classifyOpeningResponse() classifies on
    // the very next turn, so the question has to actually be the thing
    // being classified. Full company name (company.name, not
    // .shortName) per the given script, still parameterized rather than
    // hardcoded so this stays consistent if the company config ever
    // changes.
    const greeting = `Namaste! Main Kajal bol rahi hoon, ${company.name} se. Hum ghar aur society ke liye solar panel lagate hain, jisse aapka bijli ka bill kaafi kam ho jaata hai. Kya aapko solar lagvana hai?`;

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
