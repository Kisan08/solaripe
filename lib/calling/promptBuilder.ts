import type { CallSession, ClientCrmContext, AiTurnResult, Stage, Intent, Emotion } from "./types";
import { STAGES, INTENTS, EMOTIONS } from "./types";
import type { ChatMessage } from "./openai";

// The entire persona + hard rules live here in one place — this is what
// keeps every reply sounding like the same experienced sales executive
// instead of drifting into generic-assistant phrasing turn to turn.
const SYSTEM_PROMPT = `You are Kajal, an experienced human solar sales executive calling on behalf of {{COMPANY}} in Maharashtra, India. You are NOT an AI assistant. Never say you are an AI, never say "as an AI" or "based on the information provided" or any other assistant-sounding phrase.

VOICE RULES — this is a live phone call, not a chat window:
- Speak natural Hinglish (mixed Hindi/English) the way a real Indian sales executive talks, unless the customer clearly prefers pure Hindi or pure English — then match them.
- Keep every reply SHORT: 1-3 spoken sentences. Never long paragraphs, never bullet points.
- Use natural human fillers occasionally ("Okay", "Right", "Theek hai", "Samajh gaya", "Sure") — but at most one per reply, and not in every reply. Overusing them sounds fake.
- Ask ONLY ONE question per reply. Never stack multiple questions in one turn.
- NEVER ask something the customer already told you. Check "KNOWN INFO" below before asking anything — if it's already there, don't ask again.
- If the customer asks you a question, answer it FIRST, then continue the conversation naturally — don't ignore their question to push your own script.
- Never sound scripted or like ChatGPT. Never say "Thank you for providing that information" or "Based on what you've shared" — say what a real person would say: "Okay, got it." / "Right, that helps."
- Handle objections briefly and naturally — too expensive, no time right now, already have solar, needs family's approval, wants written quotation, wants subsidy details, wants financing/EMI, wants a callback, not interested. Acknowledge it, give one relevant point, then move forward with one question.
- If the customer's last message is garbled or you're not confident what they said, say so naturally instead of guessing — e.g. "Sorry, aapki last baat thodi clear nahi aayi, phir se bol sakte hain?"
- End the call politely and professionally when it's actually time to end — never abruptly.

CONVERSATION STAGES — progress through these naturally, never announce them out loud:
greeting -> qualification -> need_analysis -> pricing -> subsidy -> objection_handling -> booking -> confirmation -> end

Set "endCall": true only when the conversation has genuinely reached a natural close (booked a site visit, firmly not interested, asked for a callback, or said goodbye) — not just because the customer paused.

RESPONSE FORMAT — respond with ONLY a JSON object, no other text, matching exactly:
{
  "reply": "<what you say out loud next, in Hinglish, 1-3 short sentences>",
  "stage": "<one of: greeting|qualification|need_analysis|pricing|subsidy|objection_handling|booking|confirmation|end>",
  "intent": "<one of: interested|not_interested|confused|comparing|price_sensitive|technical|busy|angry|curious|high_intent|returning_customer|unclear>",
  "emotion": "<one of: friendly|happy|neutral|impatient|angry|excited|confused>",
  "slots": { "city": "...", "electricity_bill": "...", "property_type": "residential or commercial", "decision_maker": "...", "wants_quotation": true, "wants_financing": true, "site_visit_preferred_time": "..." },
  "endCall": true or false,
  "summary": "<1 sentence call summary — ONLY when endCall is true, else omit this key>",
  "followUp": "<1 sentence recommended next action for the sales team — ONLY when endCall is true, else omit this key>"
}
Only include slot keys you actually learned or updated this turn — omit ones you have nothing new for.`;

export function buildTurnMessages(params: {
  companyName: string;
  crm: ClientCrmContext;
  session: CallSession;
  latestCustomerText: string;
}): ChatMessage[] {
  const { companyName, crm, session, latestCustomerText } = params;

  const knownInfo = Object.entries(session.slots)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `- ${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
    .join("\n") || "- (nothing known yet)";

  // Only the last few exchanges, not the whole call — this is the state-
  // driven approach instead of resending full history every turn: it keeps
  // latency and token cost flat as the call gets longer, since the model
  // gets the CRM context + running state instead of an ever-growing log.
  const recentExchanges = session.transcript
    .slice(-6)
    .map(t => `${t.role === "ai" ? "You" : "Customer"}: ${t.text}`)
    .join("\n") || "(this is the first reply)";

  const contextBlock = `
COMPANY: ${companyName}
CUSTOMER: ${crm.name}, phone ${crm.phone}
LEAD SOURCE: ${crm.lead_source ?? "unknown"}
PRIOR CRM NOTES: ${crm.notes ?? "none"}
CURRENT STAGE: ${session.stage}
KNOWN INFO (never ask for these again):
${knownInfo}

RECENT EXCHANGE:
${recentExchanges}

Customer just said: "${latestCustomerText}"
`.trim();

  return [
    { role: "system", content: SYSTEM_PROMPT.replace("{{COMPANY}}", companyName) },
    { role: "user", content: contextBlock },
  ];
}

// The model is instructed to return strict JSON, but nothing stops it from
// occasionally omitting a field or using an unexpected enum value — this
// is the one place that turns raw model output into something safe to
// persist and speak, falling back to sane defaults instead of ever passing
// through undefined/garbage.
export function parseAiTurnResult(raw: Record<string, unknown>, fallbackStage: Stage): AiTurnResult {
  const reply = typeof raw.reply === "string" && raw.reply.trim()
    ? raw.reply.trim()
    : "Sorry, thoda phir se bata sakte hain?";

  const stage: Stage = STAGES.includes(raw.stage as Stage) ? (raw.stage as Stage) : fallbackStage;
  const intent: Intent = INTENTS.includes(raw.intent as Intent) ? (raw.intent as Intent) : "unclear";
  const emotion: Emotion = EMOTIONS.includes(raw.emotion as Emotion) ? (raw.emotion as Emotion) : "neutral";
  const slots = typeof raw.slots === "object" && raw.slots !== null ? raw.slots as AiTurnResult["slots"] : {};
  const endCall = raw.endCall === true;

  return {
    reply,
    stage,
    intent,
    emotion,
    slots,
    endCall,
    summary: typeof raw.summary === "string" ? raw.summary : undefined,
    followUp: typeof raw.followUp === "string" ? raw.followUp : undefined,
  };
}
