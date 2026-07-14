import { supabase } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

const VOICE = "Polly.Kajal-Neural";
const LANG = "hi-IN";

// Keyword lists cover Romanized Hindi, Devanagari, and plain English, since
// I can't confirm from here which script Twilio's hi-IN speech recognition
// actually returns — log the raw SpeechResult on your first test calls
// (see the console.log below) and tell me what format shows up so these
// lists can be tightened instead of over-covering guesses.
//
// Order matters: check the most specific/distinct phrases (call-back)
// first, then negation, then affirmative — "chahiye nahi" contains both an
// affirmative-looking word (chahiye) and a negation (nahi), so negation
// must win when both are present.
const CALLBACK_WORDS = [
  "baad me", "baad mein", "later", "abhi nahi baad", "busy", "व्यस्त", "बाद में", "बाद में बात",
];
const NEGATIVE_WORDS = [
  "nahi", "nako", "no", " na ", "मत", "नहीं", "ना",
];
const AFFIRMATIVE_WORDS = [
  "haan", " ha ", "yes", "ji haan", "theek hai", "chahiye", "batao", "batayen", "sahi", "ok", "okay",
  "हाँ", "हां", "जी हाँ", "ठीक है", "चाहिए",
];

function classify(rawSpeech: string, digit: string): "interested" | "not_interested" | "call_back" | "unclear" {
  // Digit press still takes priority if present (kept for backward
  // compatibility with the old numbered-menu flow, and as the reliable
  // fallback when speech recognition doesn't return anything usable).
  if (digit === "1") return "interested";
  if (digit === "2") return "not_interested";
  if (digit === "3") return "call_back";

  const s = ` ${rawSpeech.toLowerCase().trim()} `;
  if (!s.trim()) return "unclear";

  if (CALLBACK_WORDS.some(w => s.includes(w.toLowerCase()))) return "call_back";
  if (NEGATIVE_WORDS.some(w => s.includes(w.toLowerCase()))) return "not_interested";
  if (AFFIRMATIVE_WORDS.some(w => s.includes(w.toLowerCase()))) return "interested";
  return "unclear";
}

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const clientId = searchParams.get("clientId") || "";

  const formData = await req.formData();
  const digit = (formData.get("Digits") as string) || "";
  const speechResult = (formData.get("SpeechResult") as string) || "";
  const speechConfidence = formData.get("Confidence") as string | null;

  // Log the raw transcript + confidence for your first real test calls —
  // this is exactly what you need to check to confirm the script/format
  // being returned and tighten the keyword lists above.
  console.log("[call-response]", { clientId, digit, speechResult, speechConfidence });

  const outcome = classify(speechResult, digit);

  const statusMap = {
    interested: { status: "interested", response: `Interested — "${speechResult || `pressed ${digit}`}"` },
    not_interested: { status: "not_interested", response: `Not Interested — "${speechResult || `pressed ${digit}`}"` },
    call_back: { status: "call_back", response: `Call Back Later — "${speechResult || `pressed ${digit}`}"` },
    unclear: { status: "unclear_response", response: `Unclear — "${speechResult || "no input"}" (needs manual follow-up)` },
  } as const;

  const { status, response } = statusMap[outcome];

  await supabase
    .from("clients")
    .update({ status, response, called_at: new Date().toISOString() })
    .eq("id", clientId);

  const replyText =
    outcome === "interested"
      ? `Bahut accha!<break time="300ms"/> Humari team jald hi aapse sampark karegi.<break time="300ms"/> Dhanyavaad.`
      : outcome === "not_interested"
      ? `Theek hai.<break time="300ms"/> Agar kabhi zaroorat ho toh hume zaroor call karein.<break time="300ms"/> Dhanyavaad.`
      : outcome === "call_back"
      ? `Bilkul.<break time="300ms"/> Hum aapko baad mein call karenge.<break time="300ms"/> Dhanyavaad.`
      : `Maaf kijiye, samajh nahi aaya.<break time="300ms"/> Humari team aapse jald hi seedha baat karegi.<break time="300ms"/> Dhanyavaad.`;

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${VOICE}" language="${LANG}">
    ${replyText}
  </Say>
</Response>`;

  return new NextResponse(twiml, {
    headers: { "Content-Type": "text/xml" },
  });
}