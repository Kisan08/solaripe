import { NextRequest, NextResponse } from "next/server";
import { company } from "@/lib/company.config";
import { getOrCreateSession, saveSession } from "@/lib/calling/stateManager";
import { fetchClientContext, applyCrmUpdates } from "@/lib/calling/crmContext";
import { buildTurnMessages, parseAiTurnResult } from "@/lib/calling/promptBuilder";
import { callOpenAiJson } from "@/lib/calling/openai";
import { buildGatherTwiml, buildHangupTwiml } from "@/lib/calling/twiml";
import { logTurn } from "@/lib/calling/logging";
import type { CallSession } from "@/lib/calling/types";

const GENTLE_REPROMPT = "Hello? Main sun rahi hoon, aap bataiye.";
const SILENCE_CLOSE = "Theek hai, lagta hai line thodi disturb hai. Main baad mein dobara call karungi. Dhanyavaad.";

// Old numbered-menu shortcut, kept for accessibility / as a fallback when
// speech recognition returns nothing — maps a keypress straight onto what
// the customer would have said, so it still flows through the same AI turn
// instead of a separate code path.
function digitToText(digit: string): string | null {
  if (digit === "1") return "Haan, mujhe interested hoon, jaankari chahiye.";
  if (digit === "2") return "Nahi, mujhe interested nahi hai.";
  if (digit === "3") return "Mujhe baad mein call kariye.";
  return null;
}

function mapEndStatus(intent: string): "interested" | "not_interested" | "call_back" {
  if (intent === "not_interested" || intent === "angry") return "not_interested";
  if (intent === "busy") return "call_back";
  return "interested";
}

export async function POST(req: NextRequest) {
  try {
    return await handleTurn(req);
  } catch (err) {
    // A live phone call must always get back valid TwiML — a raw 500 here
    // means Twilio can't render anything and the call just fails silently
    // instead of ending gracefully. Most likely causes: the
    // supabase/migrations/0001_ai_calling.sql migration hasn't been run
    // yet, or clientId doesn't match a real client row.
    console.error("[call-response] unhandled turn error", err);
    return new NextResponse(
      buildHangupTwiml("Maaf kijiye, thodi technical dikkat aa gayi. Humari team aapko dobara call karegi. Dhanyavaad."),
      { headers: { "Content-Type": "text/xml" } },
    );
  }
}

async function handleTurn(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const clientId = searchParams.get("clientId") || "";
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || company.website;
  const actionUrl = `${baseUrl}/api/call-response?clientId=${clientId}`;

  const formData = await req.formData();
  const callSid = (formData.get("CallSid") as string) || `manual-${clientId}`;
  const digit = (formData.get("Digits") as string) || "";
  const speechResult = (formData.get("SpeechResult") as string) || "";

  // Session and CRM context don't depend on each other — fetching them
  // together instead of one-after-another removes a full DB round trip
  // from every single turn's perceived "thinking" pause.
  const [session, crm] = await Promise.all([
    getOrCreateSession(callSid, clientId),
    fetchClientContext(clientId),
  ]);

  if (session.ended) {
    // Twilio shouldn't call back after Hangup, but guard defensively.
    return new NextResponse(buildHangupTwiml("Dhanyavaad."), { headers: { "Content-Type": "text/xml" } });
  }

  const customerText = speechResult.trim() || digitToText(digit) || "";

  // ── Silence handling ──
  // actionOnEmptyResult on the <Gather> guarantees Twilio calls this route
  // even with nothing heard, so silence is handled entirely here instead of
  // needing a separate TwiML branch: wait once with a gentle nudge, then
  // close politely rather than looping forever.
  if (!customerText) {
    session.silence_count += 1;
    if (session.silence_count === 1) {
      await saveSession(session);
      return new NextResponse(buildGatherTwiml(GENTLE_REPROMPT, actionUrl), {
        headers: { "Content-Type": "text/xml" },
      });
    }
    session.ended = true;
    await Promise.all([
      saveSession(session),
      applyCrmUpdates(clientId, { status: "call_back", notes: "Customer went silent mid-call; needs a manual callback." }),
    ]);
    return new NextResponse(buildHangupTwiml(SILENCE_CLOSE), { headers: { "Content-Type": "text/xml" } });
  }

  session.silence_count = 0;
  session.transcript.push({ role: "customer", text: customerText, at: new Date().toISOString() });

  if (!crm) {
    // No CRM record to drive the conversation — fail safe rather than
    // silently hallucinating customer details.
    return new NextResponse(
      buildHangupTwiml("Maaf kijiye, thodi technical dikkat aa gayi. Humari team aapko dobara call karegi. Dhanyavaad."),
      { headers: { "Content-Type": "text/xml" } },
    );
  }

  const messages = buildTurnMessages({
    companyName: company.shortName,
    crm,
    session: session as CallSession,
    latestCustomerText: customerText,
  });

  const startedAt = Date.now();
  let result;
  let aiError: string | undefined;
  try {
    const raw = await callOpenAiJson(messages);
    result = parseAiTurnResult(raw, session.stage);
  } catch (err) {
    aiError = err instanceof Error ? err.message : String(err);
    console.error("[call-response] OpenAI turn failed", aiError);
    result = parseAiTurnResult({}, session.stage); // safe fallback reply
  }
  const latencyMs = Date.now() - startedAt;

  session.transcript.push({ role: "ai", text: result.reply, at: new Date().toISOString() });
  session.slots = { ...session.slots, ...result.slots };
  session.stage = result.stage;
  session.intent = result.intent;
  session.emotion = result.emotion;
  session.turn_count += 1;
  session.ended = result.endCall;

  const logPromise = logTurn({
    callSid,
    clientId,
    turn: session.turn_count,
    customerText,
    aiText: result.reply,
    intent: result.intent,
    stage: result.stage,
    latencyMs,
    error: aiError,
  });

  if (result.endCall) {
    const notesParts = [result.summary, result.followUp && `Follow-up: ${result.followUp}`].filter(Boolean);
    // These three writes are independent of each other — running them
    // together instead of sequentially is the difference between one
    // round-trip's worth of latency and three, on the turn that's about to
    // speak the closing line and hang up.
    await Promise.all([
      saveSession(session),
      logPromise,
      applyCrmUpdates(clientId, {
        slots: session.slots,
        status: mapEndStatus(result.intent),
        notes: notesParts.join(" "),
      }),
    ]);
    return new NextResponse(buildHangupTwiml(result.reply), { headers: { "Content-Type": "text/xml" } });
  }

  // Mid-call: still write back anything new learned this turn (city, bill,
  // property type) so the CRM stays current even if the call is dropped
  // before it reaches a natural end.
  await Promise.all([
    saveSession(session),
    logPromise,
    applyCrmUpdates(clientId, { slots: session.slots }),
  ]);

  return new NextResponse(buildGatherTwiml(result.reply, actionUrl), {
    headers: { "Content-Type": "text/xml" },
  });
}
