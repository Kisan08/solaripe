import { NextRequest, NextResponse } from "next/server";
import { company } from "@/lib/company.config";
import { getOrCreateSession } from "@/lib/calling/stateManager";
import { fetchClientContext } from "@/lib/calling/crmContext";
import { buildGatherTwiml } from "@/lib/calling/twiml";

// Turn 0 stays a fast, fixed (but CRM-personalized) greeting rather than an
// OpenAI call — there's nothing from the customer to react to yet, so
// generating it would only add latency before the phone even finishes
// ringing into the conversation. Every turn from here on is AI-driven (see
// call-response/route.ts).
async function handle(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const name = searchParams.get("name") || "Sir";
  const clientId = searchParams.get("clientId") || "";
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || company.website;

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

  const crm = await fetchClientContext(clientId);
  await getOrCreateSession(callSid, clientId);

  const greeting = crm?.city
    ? `Namaste ${name} ji, main ${company.name} se Kajal bol rahi hoon. Aapko ${crm.city} mein solar ke baare mein jaankari chahiye thi na?`
    : `Namaste ${name} ji, main ${company.name} se Kajal bol rahi hoon. Aapke bijli bill mein bachat ke liye solar panel ke baare mein do minute baat karna chahoongi.`;

  const actionUrl = `${baseUrl}/api/call-response?clientId=${clientId}`;
  return new NextResponse(buildGatherTwiml(greeting, actionUrl), {
    headers: { "Content-Type": "text/xml" },
  });
}

export async function GET(req: NextRequest) { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }
