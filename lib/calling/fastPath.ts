// Scripted, zero-AI-latency handling for the two most predictable
// exchanges in a call: the opening "do you want solar" question, and the
// bill-amount follow-up. Anything that doesn't cleanly match a simple
// keyword pattern falls through to the existing full AI flow in
// app/api/call-response/route.ts — this file only ever says "yes",
// "no", or "not sure, let the AI handle it."

export type OpeningAnswer = "positive" | "negative" | "unclear";

// Bug fix (found via a real test call's transcript): Twilio's
// language="hi-IN" speech recognition transcribes spoken Hindi into
// DEVANAGARI SCRIPT (e.g. "हां", "नहीं"), not romanized Hinglish. The
// original pattern lists here were Latin-script only ("haan", "nahi"),
// so a real customer saying "हां!" never matched anything —
// classifyOpeningResponse silently returned "unclear" for essentially
// every real spoken reply, and the call fell through to the full AI
// flow on turn 1 every single time. That's what looked like "the
// greeting repeats" (really: the AI re-asking about interest in its own
// words) and "it asks about city" (really: the normal full-AI
// slot-filling flow running because the fast path never actually
// engaged) — one root cause, not two. Both scripts are kept side by
// side below since digitToText()'s canned replies and any
// English-language callers still produce Latin text.
//
// Negative checked FIRST — "nahi chahiye" ("don't want it") contains
// "chahiye", a positive keyword, so checking positive first would
// misclassify a clear decline as interest.
//
// Single words are matched by WORD, not substring — a raw
// includes("ना") would also match inside unrelated words like "जाना"
// (to go). Multi-word phrases are still matched as substrings since
// they're long enough that accidental collisions aren't realistic.
const NEGATIVE_WORDS = ["nahi", "nahin", "no", "नहीं", "नहि", "ना"];
const NEGATIVE_PHRASES = ["not interested"];
const POSITIVE_WORDS = ["haan", "haa", "ji", "yes", "हां", "हाँ", "जी"];
const POSITIVE_PHRASES = ["ji haan", "chahiye", "interested", "sahi hai", "जी हां", "जी हाँ", "चाहिए", "इंटरेस्ट"];

// Splits on whitespace and common sentence punctuation from BOTH scripts,
// including the Devanagari danda (।) which Twilio's Hindi transcription
// uses as a full stop.
function toWords(normalized: string): string[] {
  return normalized.split(/[\s,.!?।]+/).filter(Boolean);
}

export function classifyOpeningResponse(text: string): OpeningAnswer {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return "unclear";
  const words = toWords(normalized);

  const isNegative = NEGATIVE_PHRASES.some((p) => normalized.includes(p)) || NEGATIVE_WORDS.some((w) => words.includes(w));
  if (isNegative) return "negative";

  const isPositive = POSITIVE_PHRASES.some((p) => normalized.includes(p)) || POSITIVE_WORDS.some((w) => words.includes(w));
  if (isPositive) return "positive";

  return "unclear";
}

// Deliberately permissive, not a real parser — the instruction is to
// capture whatever was said for a human to review later, not validate it.
// The only thing this rules out is an obvious non-answer (a question, an
// objection) that contains no digits at all, e.g. "aap kaunsi company se
// ho?" — that falls through to the AI instead of being force-captured as
// a bill figure. Matches Devanagari digits (०-९) too, same script-gap
// reasoning as classifyOpeningResponse above, even though observed real
// transcripts have used Latin numerals ("10000") inside Devanagari
// sentences so far.
export function looksLikeBillAmount(text: string): boolean {
  return /[\d०-९]/.test(text);
}

export const FAST_PATH_BILL_QUESTION =
  "Bahut badhiya! Bas ek chhota sa sawaal — aapka monthly light bill lagbhag kitna aata hai?";

export const FAST_PATH_INTERESTED_CLOSE =
  "Dhanyavaad! Hamari sales team aapse jaldi hi contact karke poori jaankari aur best price bataayegi. Aapka din shubh ho!";

export const FAST_PATH_DECLINE_CLOSE =
  "Koi baat nahi! Agar future mein interest ho, toh humein zaroor call kijiye. Dhanyavaad, aapka din shubh ho!";
